-- ============================================================
-- Performance OS - Guided Workout Drafts
-- Migration: 010_guided_workout_drafts.sql
-- ============================================================
-- Keeps one in-progress guided workout per user/date/plan day so a session can
-- be resumed after closing the PWA or switching devices.

CREATE TABLE IF NOT EXISTS public.guided_workout_drafts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  date       DATE NOT NULL,
  plan_day   INTEGER NOT NULL CHECK (plan_day BETWEEN 1 AND 7),
  progress   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, plan_day)
);

CREATE INDEX IF NOT EXISTS idx_guided_workout_drafts_user_date
  ON public.guided_workout_drafts(user_id, date DESC, plan_day);

ALTER TABLE public.guided_workout_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guided_workout_drafts_own" ON public.guided_workout_drafts;
CREATE POLICY "guided_workout_drafts_own" ON public.guided_workout_drafts
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
