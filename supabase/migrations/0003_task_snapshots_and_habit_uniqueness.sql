-- ============================================================================
-- TenPoint — 0003: task-progress configuration snapshots + habit-log uniqueness
-- ----------------------------------------------------------------------------
-- Two data-integrity fixes against the plan:
--
--   1. TASK-PROGRESS SNAPSHOTS
--      task_progress_logs now stores the task configuration (target, reward,
--      measure type, unit) that produced a given day's points. These columns
--      are WRITE-ONCE: /api/tasks and /api/focus compute an existing day's
--      points from the stored snapshot, never from the task's CURRENT config,
--      so editing a task never rewrites an already-recorded historical day.
--
--      The columns are added NULLABLE and NOT backfilled: rows created before
--      this migration are treated as legacy, where `points_earned` remains
--      authoritative and is frozen (never reinterpreted from today's settings).
--      Only brand-new progress rows capture a snapshot.
--
--   2. HABIT-LOG UNIQUENESS
--      0001 created a NON-UNIQUE index on habit_logs(habit_id, day) but its
--      comment claimed uniqueness was enforced — it was not. Two rows for the
--      same (habit_id, day) were technically possible, making historical daily
--      scoring ambiguous. This migration de-duplicates any such rows and then
--      enforces UNIQUE(habit_id, day) at the database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Task-progress configuration snapshots (nullable, legacy-safe)
-- ----------------------------------------------------------------------------
alter table public.task_progress_logs
  add column if not exists target_value_at_record double precision,
  add column if not exists max_points_at_record double precision,
  add column if not exists measure_type_at_record text,
  add column if not exists unit_at_record text;

-- ----------------------------------------------------------------------------
-- 2. Habit-log uniqueness: de-duplicate, then enforce UNIQUE(habit_id, day)
-- ----------------------------------------------------------------------------

-- Remove duplicate (habit_id, day) rows BEFORE adding the unique index.
--
-- Survivor selection (deterministic, history-preserving):
--   - prefer a row that carries a configuration snapshot (point_value_at_record
--     is NOT NULL), because it holds the most complete historical record;
--   - among equal candidates keep the LOWEST id (the first-inserted record).
--
-- On a fresh database there are no rows, so this is a no-op. On an existing
-- database with duplicates it removes the non-survivors only — it never
-- rewrites a survivor's points.
do $$
declare
  r record;
  survivor_id bigint;
begin
  for r in (
    select habit_id, day
    from public.habit_logs
    group by habit_id, day
    having count(*) > 1
  )
  loop
    select id into survivor_id
    from public.habit_logs
    where habit_id = r.habit_id and day = r.day
    order by
      (case when point_value_at_record is not null then 0 else 1 end),
      id
    limit 1;

    delete from public.habit_logs
    where habit_id = r.habit_id and day = r.day
      and id <> survivor_id;
  end loop;
end $$;

-- Drop the misleading NON-UNIQUE index and replace it with a UNIQUE one.
drop index if exists public.habit_logs_habit_day_idx;
create unique index if not exists habit_logs_habit_day_uidx
  on public.habit_logs (habit_id, day);

-- ----------------------------------------------------------------------------
-- 3. Ensure the other required unique relationships are enforced, too.
--    (These already exist from 0001; kept idempotent for completeness.)
-- ----------------------------------------------------------------------------
create unique index if not exists habits_user_slug_idx
  on public.habits (user_id, slug);
create unique index if not exists habit_occurrences_habit_day_idx_idx
  on public.habit_occurrences (habit_id, day, occurrence_index);
create unique index if not exists task_progress_task_day_idx
  on public.task_progress_logs (task_id, day);
