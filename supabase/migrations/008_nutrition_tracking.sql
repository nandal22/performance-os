-- ============================================================
-- Performance OS - Nutrition Tracking
-- Migration: 008_nutrition_tracking.sql
-- ============================================================

CREATE TABLE calorie_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  date       DATE NOT NULL,
  meal       TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  name       TEXT NOT NULL,
  calories   DECIMAL(8,1) NOT NULL DEFAULT 0,
  protein    DECIMAL(8,1) NOT NULL DEFAULT 0,
  carbs      DECIMAL(8,1) NOT NULL DEFAULT 0,
  fat        DECIMAL(8,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calorie_logs_user_date ON calorie_logs(user_id, date DESC, created_at ASC);

CREATE TABLE daily_steps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  date       DATE NOT NULL,
  steps      INTEGER NOT NULL DEFAULT 0 CHECK (steps >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_steps_user_date ON daily_steps(user_id, date DESC);

CREATE TABLE quick_foods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  name       TEXT NOT NULL,
  meal       TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  calories   DECIMAL(8,1) NOT NULL DEFAULT 0,
  protein    DECIMAL(8,1) NOT NULL DEFAULT 0,
  carbs      DECIMAL(8,1) NOT NULL DEFAULT 0,
  fat        DECIMAL(8,1) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quick_foods_user_sort ON quick_foods(user_id, sort_order, created_at);

ALTER TABLE calorie_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_foods  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calorie_logs_own" ON calorie_logs
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "daily_steps_own" ON daily_steps
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quick_foods_own" ON quick_foods
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
