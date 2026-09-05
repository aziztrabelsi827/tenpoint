-- ============================================================================
-- TenPoint — 0002: atomic occurrence toggle RPC
-- ----------------------------------------------------------------------------
-- The occurrence toggle must (a) run under the authenticated user's RLS and
-- (b) serialise concurrent toggles of the same habit with a row lock so the
-- recomputed aggregate count never drifts. PostgREST cannot express a
-- multi-statement transaction with `SELECT ... FOR UPDATE`, so this work is
-- exposed as an RPC function.
--
-- SECURITY INVOKER (default): the function runs with the invoking role's
-- privileges, so ROW LEVEL SECURITY is enforced on every table touched —
-- `auth.uid()` resolves from the request's JWT claims that PostgREST sets.
-- A SECURITY DEFINER version would run as the table owner and BYPASS RLS,
-- which is exactly what must be avoided.
--
-- The snapshot maths mirrors src/lib/scoring.ts (resolveHabitSnapshot +
-- calculateHabitPointsFromSnapshot). Keep the two in lockstep.
-- ============================================================================

create or replace function public.handle_occurrence_toggle(
  p_habit_id integer,
  p_day date,
  p_occurrence_index integer,
  p_scheduled_time text,
  p_completed boolean
)
returns table (count integer, points_earned double precision, completed boolean)
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_habit public.habits%rowtype;
  v_existing_occ public.habit_occurrences%rowtype;
  v_existing_log public.habit_logs%rowtype;
  v_count integer;
  v_row_count integer;
  v_snap_weight double precision;
  v_snap_target integer;
  v_snap_kind text;
  v_legacy_preserve double precision;
  v_points double precision;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Ownership + serialisation. RLS keeps this to the user's own habit; the row
  -- lock serialises concurrent toggles for the same habit.
  select * into v_habit
  from public.habits
  where id = p_habit_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Habit not found' using errcode = 'S0101';
  end if;

  -- Occurrence upsert (scheduled_time captured at creation, only `completed`
  -- changes on update). habit_id is globally unique to one user, so the
  -- (habit_id, day, occurrence_index) conflict can never be a cross-user one.
  insert into public.habit_occurrences
    (user_id, habit_id, day, occurrence_index, scheduled_time, completed)
  values
    (v_uid, p_habit_id, p_day, p_occurrence_index, p_scheduled_time, p_completed)
  on conflict (habit_id, day, occurrence_index)
    do update set completed = excluded.completed, updated_at = now();

  -- Recompute the aggregate count from ALL of the day's occurrences. The output
  -- parameter named `completed` must not shadow the table column, so qualify it.
  select count(*) into v_count
  from public.habit_occurrences
  where public.habit_occurrences.habit_id = p_habit_id
    and public.habit_occurrences.day = p_day
    and public.habit_occurrences.completed = true;

  select * into v_existing_log
  from public.habit_logs
  where habit_id = p_habit_id and day = p_day and user_id = v_uid
  limit 1;

  -- resolveHabitSnapshot (mirrors src/lib/scoring.ts)
  v_snap_weight := v_habit.point_value;
  v_snap_target := greatest(1, v_habit.target_count);
  v_snap_kind := v_habit.kind;
  v_legacy_preserve := null;

  if found then
    if v_existing_log.point_value_at_record is not null then
      -- Stored snapshot is authoritative.
      v_snap_weight := v_existing_log.point_value_at_record;
      v_snap_target := greatest(1, coalesce(v_existing_log.target_count_at_record, v_habit.target_count));
      v_snap_kind := case when v_existing_log.kind_at_record = 'negative' then 'negative' else 'positive' end;
    else
      -- Legacy row, no snapshot: preserve the recorded points verbatim.
      v_legacy_preserve := v_existing_log.points_earned;
    end if;
  end if;

  -- Recorded-zero semantics: keep the log (and its snapshot) at count=0 when an
  -- existing log exists, so a later re-check is scored against the day's own
  -- snapshot rather than today's configuration.
  if v_count <= 0 and found then
    update public.habit_logs
    set count = 0, points_earned = 0
    where id = v_existing_log.id;
    return query select 0::integer, 0::double precision, p_completed;
  end if;

  -- Legacy preserved points (no snapshot): keep them verbatim.
  if v_legacy_preserve is not null then
    update public.habit_logs
    set count = v_count
    where id = v_existing_log.id;
    return query select v_count, v_legacy_preserve, p_completed;
  end if;

  -- calculateHabitPointsFromSnapshot (mirrors src/lib/scoring.ts, roundPoints = 2dp)
  if v_snap_kind = 'negative' then
    v_points := round((v_count * v_snap_weight)::numeric, 2)::double precision;
  else
    v_points := round(
      (least(1.0, v_count::double precision / v_snap_target::double precision) * v_snap_weight)::numeric,
      2
    )::double precision;
  end if;

  if found then
    update public.habit_logs
    set count = v_count,
        points_earned = v_points,
        -- Snapshot columns are write-once: only set when not already present.
        point_value_at_record = coalesce(point_value_at_record,
          case when v_existing_log.point_value_at_record is null
            then v_snap_weight else point_value_at_record end),
        target_count_at_record = coalesce(target_count_at_record,
          case when v_existing_log.target_count_at_record is null
            then v_snap_target else target_count_at_record end),
        kind_at_record = coalesce(kind_at_record,
          case when v_existing_log.kind_at_record is null
            then v_snap_kind else kind_at_record end)
    where id = v_existing_log.id;
  else
    insert into public.habit_logs
      (user_id, habit_id, day, count, points_earned, point_value_at_record, target_count_at_record, kind_at_record)
    values
      (v_uid, p_habit_id, p_day, v_count, v_points, v_snap_weight, v_snap_target, v_snap_kind);
  end if;

  return query select v_count, v_points, p_completed;
end;
$$;

revoke all on function public.handle_occurrence_toggle(integer, date, integer, text, boolean) from public;
grant execute on function public.handle_occurrence_toggle(integer, date, integer, text, boolean) to authenticated;
grant execute on function public.handle_occurrence_toggle(integer, date, integer, text, boolean) to service_role;

-- ============================================================================
-- Health probe RPC. PUBLIC-executable; returns only a constant and touches no
-- user data, so it is safe for the unauthenticated /api/health endpoint.
-- ============================================================================
create or replace function public.health_check()
returns boolean
language sql
security invoker
set search_path = public
as $$
  select true;
$$;

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
