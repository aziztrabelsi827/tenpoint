-- Archived habits are removed from the current UI but their historical data
-- (logs, occurrences, snapshots) stays intact so historical ratings never change.
--
-- NULL = active/current. NOT NULL = archived (hidden from the workspace but
-- kept for historical scoring and analytics).

alter table public.habits
  add column if not exists archived_at timestamptz;

-- Backfill habits previously soft-archived by the rename path
-- (name LIKE '%(archived)%' + enabled = false). This ensures existing archived
-- habits leave the current UI on refresh while their history stays intact.
update public.habits
set archived_at = created_at
where archived_at is null
  and enabled = false
  and name like '%(archived)%';
