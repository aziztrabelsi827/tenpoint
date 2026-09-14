-- ============================================================================
-- TenPoint — 0006: per-weekday habit targets
-- ----------------------------------------------------------------------------
-- Habits gain an optional weekday-by-weekday repetition target in addition to
-- the existing global `target_count`. The stored shape is a JSON array of
-- length 7 indexed Sun(0)..Sat(6) (matching `extract(dow ...)` and the UI's
-- weekday labels); a JSON null (or missing/bad) entry means "use the habit's
-- global target_count that day". Values are whole numbers 1..20 — 0 is
-- deliberately not a valid override, since a day a habit is skipped should be
-- expressed with the `days` frequency field instead.
--
-- Snapshot compatibility: NO table shape change outside this one column. The
-- daily effective target flows into the existing `target_count_at_record`
-- snapshot exactly like a global target change does — recorded days keep their
-- snapshot, provisional (zero-progress) rows and brand-new days capture the
-- effective target for the specific weekday. The `handle_occurrence_toggle`
-- RPC below is re-created so it resolves the weekday-effective target in
-- lockstep with src/lib/scoring.ts (effectiveTargetFor).
--
-- SECURITY model unchanged: SECURITY INVOKER, row-locked serialisation, same
-- grants.
-- ============================================================================

alter table public.habits
  add column if not exists weekday_targets text not null default '[]';

comment on column public.habits.weekday_targets is
  'JSON array of length 7, indexed Sun(0)..Sat(6). Each entry is a whole number 1..20 or null. A null entry uses the habit''s global target_count that day.';

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
  v_recorded boolean;
  v_overrides jsonb;
  v_override_target integer;
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

  -- resolveHabitSnapshot (mirrors src/lib/scoring.ts). A stored snapshot is
  -- authoritative ONLY for a day holding real recorded progress (count > 0);
  -- a zero-progress row is provisional and resolves against the habit's
  -- CURRENT configuration instead.
  v_recorded := false;
  if found and v_existing_log.count > 0 then
    v_recorded := true;
  end if;

  v_snap_weight := v_habit.point_value;
  v_snap_target := greatest(1, v_habit.target_count);
  v_snap_kind := v_habit.kind;
  v_legacy_preserve := null;

  -- Per-weekday target override (mirrors src/lib/scoring.ts effectiveTargetFor).
  -- weekdays run Sun(0)..Sat(6), matching extract(dow ...). A JSON null or a
  -- missing entry keeps the global target_count; malformed JSON is ignored.
  if v_habit.weekday_targets is not null and v_habit.weekday_targets <> '[]' then
    begin
      v_overrides := v_habit.weekday_targets::jsonb;
      v_override_target := (v_overrides -> extract(dow from p_day)::integer)::int;
      if v_override_target is not null and v_override_target >= 1 then
        v_snap_target := greatest(1, v_override_target);
      end if;
    exception when others then
      null;
    end;
  end if;

  if v_recorded then
    if v_existing_log.point_value_at_record is not null then
      -- Stored snapshot is authoritative.
      v_snap_weight := v_existing_log.point_value_at_record;
      v_snap_target := greatest(1, coalesce(v_existing_log.target_count_at_record, v_snap_target));
      v_snap_kind := case when v_existing_log.kind_at_record = 'negative' then 'negative' else 'positive' end;
    else
      -- Recorded legacy row, no snapshot: preserve the recorded points verbatim.
      v_legacy_preserve := v_existing_log.points_earned;
    end if;
  end if;

  -- Provisional zero: keep the log (and zero points) at count=0 when a row
  -- exists, so participation is preserved — but nothing is frozen. The next
  -- real completion re-captures the current configuration.
  if v_count <= 0 and found then
    update public.habit_logs
    set count = 0, points_earned = 0
    where id = v_existing_log.id;
    return query select 0::integer, 0::double precision, p_completed;
  end if;

  -- Recorded legacy preserved points (real progress, no snapshot): keep them verbatim.
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
        -- Snapshot columns are write-once ONCE a day holds real progress. A
        -- provisional (zero-progress) row re-captures the current configuration;
        -- a recorded day keeps its original values.
        point_value_at_record = case when v_recorded then point_value_at_record else v_snap_weight end,
        target_count_at_record = case when v_recorded then target_count_at_record else v_snap_target end,
        kind_at_record = case when v_recorded then kind_at_record else v_snap_kind end
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