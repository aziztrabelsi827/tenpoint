-- ============================================================================
-- TenPoint — initial schema (authoritative)
-- ----------------------------------------------------------------------------
-- Supabase Auth owns user identity in `auth.users`. Every application record
-- belongs to `auth.users.id` via a `user_id uuid` column, and ROW LEVEL
-- SECURITY isolates each user's data using `auth.uid()`.
--
-- App-table primary keys stay `serial` (surrogate). Ownership is `user_id`.
--
-- Run order matters: tables before FKs, FKs before indexes/policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users.id)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- User settings
-- ----------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'productivity',
  custom_primary text default '#2563eb',
  custom_accent text default '#14b8a6',
  custom_background text default '#f6f7f9',
  custom_card text default '#ffffff',
  custom_radius integer not null default 14,
  custom_mode text not null default 'light',
  timezone text not null default 'Etc/UTC',
  focus_minutes integer not null default 25,
  short_break_minutes integer not null default 5,
  long_break_minutes integer not null default 15,
  sessions_before_long_break integer not null default 4,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Habits
-- ----------------------------------------------------------------------------
create table if not exists public.habits (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  icon text not null default '✅',
  color text not null default '#2563eb',
  description text not null default '',
  kind text not null default 'positive',           -- positive | negative
  point_value double precision not null default 1,
  target_count integer not null default 1,
  days text not null default '[]',                 -- JSON number[] weekday indexes
  schedule_times text not null default '[]',       -- JSON string[] "HH:MM"
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Habit logs (per habit + day snapshot)
-- ----------------------------------------------------------------------------
create table if not exists public.habit_logs (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id integer not null references public.habits (id) on delete cascade,
  day date not null,
  count integer not null default 1,
  points_earned double precision not null default 0,
  point_value_at_record double precision,
  target_count_at_record integer,
  kind_at_record text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Habit occurrences (per habit + day + occurrence)
-- ----------------------------------------------------------------------------
create table if not exists public.habit_occurrences (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id integer not null references public.habits (id) on delete cascade,
  day date not null,
  occurrence_index integer not null,
  scheduled_time text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tasks
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text not null default '',
  status text not null default 'todo',             -- todo | in_progress | completed | archived
  priority text not null default 'medium',         -- low | medium | high
  category text not null default 'General',
  measure_type text not null default 'completion', -- time | quantity | count | completion
  target_value double precision not null default 1,
  unit text not null default '',
  max_points double precision not null default 0.5,
  day date,
  start_time text,
  end_time text,
  habit_id integer references public.habits (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- Task progress logs (per task + day snapshot)
-- ----------------------------------------------------------------------------
create table if not exists public.task_progress_logs (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id integer not null references public.tasks (id) on delete cascade,
  day date not null,
  progress double precision not null default 0,
  points_earned double precision not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Calendar events
-- ----------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  kind text not null default 'event',              -- event | personal | work | focus
  day date not null,
  start_time text not null default '09:00',
  end_time text not null default '10:00',
  notes text not null default '',
  location text not null default '',
  color text not null default '',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Focus sessions
-- ----------------------------------------------------------------------------
create table if not exists public.focus_sessions (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null default 'focus',              -- focus | short_break | long_break
  seconds integer not null default 0,
  completed boolean not null default true,
  habit_id integer references public.habits (id) on delete set null,
  task_id integer references public.tasks (id) on delete set null,
  day date not null,
  started_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes & constraints
-- ============================================================================

create unique index if not exists habits_user_slug_idx on public.habits (user_id, slug);
create index if not exists habit_logs_habit_day_idx on public.habit_logs (habit_id, day);
create index if not exists habit_logs_user_day_idx on public.habit_logs (user_id, day);
create unique index if not exists habit_occurrences_habit_day_idx_idx
  on public.habit_occurrences (habit_id, day, occurrence_index);
create index if not exists habit_occurrences_user_day_idx on public.habit_occurrences (user_id, day);
create index if not exists tasks_user_day_idx on public.tasks (user_id, day);
create unique index if not exists task_progress_task_day_idx on public.task_progress_logs (task_id, day);
create index if not exists task_progress_user_day_idx on public.task_progress_logs (user_id, day);
create index if not exists calendar_events_user_day_idx on public.calendar_events (user_id, day);
create index if not exists focus_sessions_user_day_idx on public.focus_sessions (user_id, day);

-- Per-user uniqueness on habit + day snapshots is implied by the habit-level
-- unique indexes above (habit_id is itself unique owner-scoped). The composite
-- (habit_id, day) uniqueness is enforced by habit_logs_habit_day_idx.

-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Every owned table is protected: a user may only SELECT/INSERT/UPDATE/DELETE
-- rows whose user_id equals their own auth.uid(). The database enforces
-- isolation; the application never relies on filtering alone.
-- ============================================================================

-- profiles
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on public.profiles for delete using (id = auth.uid());

-- user_settings
alter table public.user_settings enable row level security;
create policy user_settings_select on public.user_settings for select using (user_id = auth.uid());
create policy user_settings_insert on public.user_settings for insert with check (user_id = auth.uid());
create policy user_settings_update on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_settings_delete on public.user_settings for delete using (user_id = auth.uid());

-- habits
alter table public.habits enable row level security;
create policy habits_select on public.habits for select using (user_id = auth.uid());
create policy habits_insert on public.habits for insert with check (user_id = auth.uid());
create policy habits_update on public.habits for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habits_delete on public.habits for delete using (user_id = auth.uid());

-- habit_logs
alter table public.habit_logs enable row level security;
create policy habit_logs_select on public.habit_logs for select using (user_id = auth.uid());
create policy habit_logs_insert on public.habit_logs for insert with check (user_id = auth.uid());
create policy habit_logs_update on public.habit_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habit_logs_delete on public.habit_logs for delete using (user_id = auth.uid());

-- habit_occurrences
alter table public.habit_occurrences enable row level security;
create policy habit_occurrences_select on public.habit_occurrences for select using (user_id = auth.uid());
create policy habit_occurrences_insert on public.habit_occurrences for insert with check (user_id = auth.uid());
create policy habit_occurrences_update on public.habit_occurrences for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habit_occurrences_delete on public.habit_occurrences for delete using (user_id = auth.uid());

-- tasks
alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select using (user_id = auth.uid());
create policy tasks_insert on public.tasks for insert with check (user_id = auth.uid());
create policy tasks_update on public.tasks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_delete on public.tasks for delete using (user_id = auth.uid());

-- task_progress_logs
alter table public.task_progress_logs enable row level security;
create policy task_progress_logs_select on public.task_progress_logs for select using (user_id = auth.uid());
create policy task_progress_logs_insert on public.task_progress_logs for insert with check (user_id = auth.uid());
create policy task_progress_logs_update on public.task_progress_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy task_progress_logs_delete on public.task_progress_logs for delete using (user_id = auth.uid());

-- calendar_events
alter table public.calendar_events enable row level security;
create policy calendar_events_select on public.calendar_events for select using (user_id = auth.uid());
create policy calendar_events_insert on public.calendar_events for insert with check (user_id = auth.uid());
create policy calendar_events_update on public.calendar_events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_events_delete on public.calendar_events for delete using (user_id = auth.uid());

-- focus_sessions
alter table public.focus_sessions enable row level security;
create policy focus_sessions_select on public.focus_sessions for select using (user_id = auth.uid());
create policy focus_sessions_insert on public.focus_sessions for insert with check (user_id = auth.uid());
create policy focus_sessions_update on public.focus_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy focus_sessions_delete on public.focus_sessions for delete using (user_id = auth.uid());

-- ============================================================================
-- Automatic profile provisioning on sign-up
-- ----------------------------------------------------------------------------
-- Creates a matching profile row whenever Supabase Auth inserts a user. This
-- keeps the 1:1 auth.users <-> profiles relationship without the app needing a
-- race-prone "ensure profile" check on every request.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
