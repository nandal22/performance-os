-- ============================================================
-- Performance OS — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ACTIVITIES
-- Core table — every workout/session is an activity
-- ============================================================
CREATE TABLE activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  date          DATE NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('strength', 'cardio', 'sport', 'mobility', 'custom')),
  duration      INTEGER,              -- minutes
  notes         TEXT,
  tags          TEXT[] DEFAULT '{}',
  structured_metrics JSONB DEFAULT '{}', -- extensible block for future data
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_user_date ON activities(user_id, date DESC);
CREATE INDEX idx_activities_type ON activities(user_id, type);

-- ============================================================
-- EXERCISES
-- System exercises (user_id IS NULL) + custom per user
-- ============================================================
CREATE TABLE exercises (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,      -- e.g., 'push', 'pull', 'legs', 'core', 'cardio'
  primary_muscle    TEXT NOT NULL,
  secondary_muscles TEXT[] DEFAULT '{}',
  equipment         TEXT,               -- 'barbell', 'dumbbell', 'bodyweight', 'machine', 'cable'
  is_custom         BOOLEAN DEFAULT false,
  user_id           UUID REFERENCES auth.users, -- NULL = system exercise
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exercises_user ON exercises(user_id);
CREATE INDEX idx_exercises_name ON exercises(name);

-- ============================================================
-- STRENGTH SETS
-- One row per set. Volume is generated for fast queries.
-- ============================================================
CREATE TABLE strength_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES exercises NOT NULL,
  set_number  INTEGER NOT NULL,
  reps        INTEGER,
  weight      DECIMAL(6,2),   -- kg
  rpe         DECIMAL(3,1),   -- Rate of Perceived Exertion 1–10
  rest        INTEGER,        -- seconds
  tempo       TEXT,           -- e.g., '3-1-2-0' (eccentric-pause-concentric-pause)
  -- volume stored (reps × weight) for performant aggregation
  volume      DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(reps, 0) * COALESCE(weight, 0)
  ) STORED,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strength_sets_activity ON strength_sets(activity_id);
CREATE INDEX idx_strength_sets_exercise ON strength_sets(exercise_id);

-- ============================================================
-- CARDIO METRICS
-- One row per cardio activity (1:1 with activities)
-- ============================================================
CREATE TABLE cardio_metrics (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id    UUID REFERENCES activities ON DELETE CASCADE NOT NULL UNIQUE,
  distance       DECIMAL(8,3),  -- km
  avg_heart_rate INTEGER,
  max_heart_rate INTEGER,
  elevation      INTEGER,       -- meters gain
  calories       INTEGER,
  avg_pace       TEXT,          -- e.g., '5:30' min/km
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BODY METRICS
-- One entry per day. Soft unique per user+date.
-- ============================================================
CREATE TABLE body_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users NOT NULL,
  date        DATE NOT NULL,
  weight      DECIMAL(5,2),  -- kg
  waist       DECIMAL(5,1),  -- cm
  chest       DECIMAL(5,1),  -- cm
  thigh       DECIMAL(5,1),  -- cm
  body_fat    DECIMAL(4,1),  -- %
  resting_hr  INTEGER,
  sleep_hours DECIMAL(3,1),
  steps       INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_body_metrics_user_date ON body_metrics(user_id, date DESC);

-- ============================================================
-- GOALS (schema ready for Phase 3)
-- ============================================================
CREATE TABLE goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('weight', 'waist', 'lift', 'cardio_distance', 'cardio_time', 'body_fat')),
  exercise_id  UUID REFERENCES exercises,  -- only for lift goals
  target_value DECIMAL(10,2) NOT NULL,
  target_date  DATE,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Users can only see/edit their own data
-- ============================================================
ALTER TABLE activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_sets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardio_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises      ENABLE ROW LEVEL SECURITY;

-- Activities: own rows only
CREATE POLICY "activities_own" ON activities
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Strength sets: via joined activity
CREATE POLICY "strength_sets_own" ON strength_sets
  USING (activity_id IN (SELECT id FROM activities WHERE user_id = auth.uid()));

-- Cardio metrics: via joined activity
CREATE POLICY "cardio_metrics_own" ON cardio_metrics
  USING (activity_id IN (SELECT id FROM activities WHERE user_id = auth.uid()));

-- Body metrics: own rows only
CREATE POLICY "body_metrics_own" ON body_metrics
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Goals: own rows only
CREATE POLICY "goals_own" ON goals
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Exercises: system exercises readable by all, custom only by owner
CREATE POLICY "exercises_read" ON exercises
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "exercises_write" ON exercises
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_custom = true);
CREATE POLICY "exercises_delete" ON exercises
  FOR DELETE USING (auth.uid() = user_id AND is_custom = true);

-- ============================================================
-- SEED: System Exercises
-- ============================================================
INSERT INTO exercises (name, category, primary_muscle, secondary_muscles, equipment, is_custom) VALUES
  -- PUSH
  ('Bench Press',        'push', 'Chest',   ARRAY['Triceps', 'Front Delt'], 'barbell',   false),
  ('Incline Bench Press','push', 'Chest',   ARRAY['Triceps', 'Front Delt'], 'barbell',   false),
  ('Overhead Press',     'push', 'Shoulders',ARRAY['Triceps'],              'barbell',   false),
  ('Push-up',            'push', 'Chest',   ARRAY['Triceps', 'Shoulders'], 'bodyweight', false),
  ('Dumbbell Flye',      'push', 'Chest',   ARRAY['Front Delt'],           'dumbbell',  false),
  ('Lateral Raise',      'push', 'Shoulders',ARRAY[]::text[],                      'dumbbell',  false),
  ('Tricep Pushdown',    'push', 'Triceps', ARRAY[]::text[],                       'cable',     false),
  -- PULL
  ('Deadlift',           'pull', 'Back',    ARRAY['Hamstrings', 'Glutes'], 'barbell',   false),
  ('Pull-up',            'pull', 'Back',    ARRAY['Biceps'],               'bodyweight',false),
  ('Barbell Row',        'pull', 'Back',    ARRAY['Biceps', 'Rear Delt'],  'barbell',   false),
  ('Lat Pulldown',       'pull', 'Back',    ARRAY['Biceps'],               'cable',     false),
  ('Face Pull',          'pull', 'Rear Delt',ARRAY['Rotator Cuff'],        'cable',     false),
  ('Barbell Curl',       'pull', 'Biceps',  ARRAY['Brachialis'],           'barbell',   false),
  -- LEGS
  ('Squat',              'legs', 'Quads',   ARRAY['Glutes', 'Hamstrings'], 'barbell',   false),
  ('Romanian Deadlift',  'legs', 'Hamstrings',ARRAY['Glutes', 'Back'],     'barbell',   false),
  ('Leg Press',          'legs', 'Quads',   ARRAY['Glutes'],               'machine',   false),
  ('Leg Curl',           'legs', 'Hamstrings',ARRAY[]::text[],                     'machine',   false),
  ('Calf Raise',         'legs', 'Calves',  ARRAY[]::text[],                       'machine',   false),
  ('Hip Thrust',         'legs', 'Glutes',  ARRAY['Hamstrings'],           'barbell',   false),
  -- CORE
  ('Plank',              'core', 'Abs',     ARRAY['Lower Back'],           'bodyweight',false),
  ('Ab Wheel Rollout',   'core', 'Abs',     ARRAY['Lats'],                 'bodyweight',false),
  ('Cable Crunch',       'core', 'Abs',     ARRAY[]::text[],                       'cable',     false);
