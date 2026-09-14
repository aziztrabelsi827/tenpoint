-- Focus timer must survive screen lock / backgrounding / refresh / browser close.
--
-- The running timer is therefore persisted as an absolute end timestamp on the
-- existing focus_sessions row (never as a JavaScript tick count):
--
--   completed = false, ends_at IS NOT NULL        -> RUNNING
--   completed = false, ends_at IS NULL            -> PAUSED (remaining_seconds persists the countdown)
--   completed = true                              -> finished / legacy
--
-- `seconds` stays the session's planned total duration (what stats log on
-- completion); `remaining_seconds` holds the frozen countdown while paused.

alter table public.focus_sessions
  add column if not exists ends_at timestamptz,
  add column if not exists remaining_seconds integer;

-- A user has at most one active/paused session; this index keeps the
-- "latest active row" lookup cheap.
create index if not exists focus_sessions_active_idx
  on public.focus_sessions (user_id, id desc)
  where completed is not true;