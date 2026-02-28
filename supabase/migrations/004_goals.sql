-- ============================================================
-- Performance OS — Goals Table (Phase 3)
-- Migration: 004_goals.sql
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('weight', 'waist', 'lift', 'cardio_distance', 'cardio_time', 'body_fat')),
  exercise_id  UUID REFERENCES exercises,
  target_value DECIMAL(10,2) NOT NULL,
  target_date  DATE,
  notes        TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_own" ON goals;
CREATE POLICY "goals_own" ON goals
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_goals_user ON goals(user_id, is_active);
