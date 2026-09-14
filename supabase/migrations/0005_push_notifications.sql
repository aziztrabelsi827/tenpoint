-- 0005_push_notifications.sql
-- Adds push subscription storage and a scheduled-reminder queue for
-- the 30-minute-before notification system.

-- ----------------------------------------------------------------
-- 1. push_subscriptions — one row per browser/device push endpoint
-- ----------------------------------------------------------------
CREATE TABLE push_subscriptions (
  id          serial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- A push endpoint is globally unique (one browser subscription = one endpoint).
CREATE UNIQUE INDEX push_subscriptions_endpoint_idx ON push_subscriptions (endpoint);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- RLS: users can only read/delete their own subscriptions.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select_own ON push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY push_subscriptions_insert_own ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_delete_own ON push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY push_subscriptions_update_own ON push_subscriptions
  FOR UPDATE USING (user_id = auth.uid());

-- ----------------------------------------------------------------
-- 2. scheduled_reminders — idempotent reminder queue
-- ----------------------------------------------------------------
CREATE TABLE scheduled_reminders (
  id            serial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type   text NOT NULL CHECK (source_type IN ('task', 'event')),
  source_id     integer NOT NULL,
  title         text NOT NULL DEFAULT '',
  scheduled_for timestamptz NOT NULL,
  reminder_type text NOT NULL DEFAULT '30min_before',
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One pending reminder per (user, source_type, source_id, reminder_type).
-- Sent reminders (sent_at IS NOT NULL) are allowed to coexist because
-- a rescheduled item creates a NEW row after the old one is marked sent.
CREATE UNIQUE INDEX scheduled_reminders_pending_uidx
  ON scheduled_reminders (user_id, source_type, source_id, reminder_type)
  WHERE sent_at IS NULL;

CREATE INDEX scheduled_reminders_due_idx ON scheduled_reminders (scheduled_for)
  WHERE sent_at IS NULL;

CREATE INDEX scheduled_reminders_user_idx ON scheduled_reminders (user_id);

ALTER TABLE scheduled_reminders ENABLE ROW LEVEL SECURITY;

-- Users can read their own reminders (for potential future UI).
CREATE POLICY scheduled_reminders_select_own ON scheduled_reminders
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own reminders (API routes create them).
CREATE POLICY scheduled_reminders_insert_own ON scheduled_reminders
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can delete their own reminders (task/event deletion).
CREATE POLICY scheduled_reminders_delete_own ON scheduled_reminders
  FOR DELETE USING (user_id = auth.uid());

-- Users can update their own reminders (task/event reschedule marks old as sent).
CREATE POLICY scheduled_reminders_update_own ON scheduled_reminders
  FOR UPDATE USING (user_id = auth.uid());
