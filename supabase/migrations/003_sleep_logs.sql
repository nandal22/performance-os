-- ============================================================
-- Performance OS — Sleep Logs
-- Migration: 003_sleep_logs.sql
-- ============================================================

CREATE TABLE sleep_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  date         DATE NOT NULL,          -- wake-up date (the morning you woke up)
  bedtime      TEXT,                   -- "23:30" — store as HH:MM text
  wake_time    TEXT,                   -- "07:00"
  duration_hrs DECIMAL(3,1),          -- total hours slept (client-computed)
  quality      SMALLINT CHECK (quality BETWEEN 1 AND 5),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_sleep_logs_user_date ON sleep_logs(user_id, date DESC);

ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sleep_logs_own" ON sleep_logs
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
