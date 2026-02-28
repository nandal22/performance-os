-- ============================================================
-- Performance OS — Analytics SQL Functions
-- Migration: 002_analytics_functions.sql
-- ============================================================

-- ============================================================
-- FUNCTION: get_exercise_summaries
-- Returns aggregated stats per exercise for the calling user.
-- Called via: supabase.rpc('get_exercise_summaries')
-- ============================================================
CREATE OR REPLACE FUNCTION get_exercise_summaries()
RETURNS TABLE (
  exercise_id    UUID,
  exercise_name  TEXT,
  total_volume   DECIMAL,
  max_weight     DECIMAL,
  estimated_1rm  DECIMAL,
  set_count      BIGINT,
  last_performed DATE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    ss.exercise_id,
    e.name                                                       AS exercise_name,
    SUM(ss.volume)                                               AS total_volume,
    MAX(ss.weight)                                               AS max_weight,
    MAX(ss.weight * (1.0 + COALESCE(ss.reps, 0) / 30.0))       AS estimated_1rm,
    COUNT(*)                                                     AS set_count,
    MAX(a.date)                                                  AS last_performed
  FROM  strength_sets ss
  JOIN  activities a  ON a.id = ss.activity_id
  JOIN  exercises  e  ON e.id = ss.exercise_id
  WHERE a.user_id = auth.uid()
  GROUP BY ss.exercise_id, e.name
  ORDER BY total_volume DESC;
$$;

-- ============================================================
-- FUNCTION: get_personal_records
-- Returns the best set (highest estimated 1RM) per exercise.
-- Called via: supabase.rpc('get_personal_records')
-- ============================================================
CREATE OR REPLACE FUNCTION get_personal_records()
RETURNS TABLE (
  exercise_id    UUID,
  exercise_name  TEXT,
  weight         DECIMAL,
  reps           INTEGER,
  estimated_1rm  DECIMAL,
  achieved_on    DATE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      ss.exercise_id,
      e.name                                                     AS exercise_name,
      ss.weight,
      ss.reps,
      ss.weight * (1.0 + COALESCE(ss.reps, 0) / 30.0)          AS estimated_1rm,
      a.date                                                     AS achieved_on,
      ROW_NUMBER() OVER (
        PARTITION BY ss.exercise_id
        ORDER BY (ss.weight * (1.0 + COALESCE(ss.reps, 0) / 30.0)) DESC
      ) AS rn
    FROM  strength_sets ss
    JOIN  activities a  ON a.id = ss.activity_id
    JOIN  exercises  e  ON e.id = ss.exercise_id
    WHERE a.user_id        = auth.uid()
      AND ss.weight        IS NOT NULL
      AND ss.reps          IS NOT NULL
  )
  SELECT
    exercise_id,
    exercise_name,
    weight,
    reps,
    estimated_1rm,
    achieved_on
  FROM  ranked
  WHERE rn = 1
  ORDER BY estimated_1rm DESC;
$$;

-- ============================================================
-- FUNCTION: get_training_load
-- Returns daily load breakdown for the last N days.
-- Called via: supabase.rpc('get_training_load', { days_back: 28 })
-- ============================================================
CREATE OR REPLACE FUNCTION get_training_load(days_back INTEGER DEFAULT 28)
RETURNS TABLE (
  activity_date  DATE,
  activity_type  TEXT,
  duration_min   INTEGER,
  load_score     INTEGER
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    a.date                                               AS activity_date,
    a.type                                               AS activity_type,
    COALESCE(a.duration, 30)                             AS duration_min,
    CASE a.type
      WHEN 'strength' THEN ROUND(COALESCE(a.duration, 30) * 1.0)::INTEGER
      WHEN 'cardio'   THEN ROUND(COALESCE(a.duration, 30) * 0.8)::INTEGER
      WHEN 'sport'    THEN ROUND(COALESCE(a.duration, 30) * 0.7)::INTEGER
      WHEN 'mobility' THEN ROUND(COALESCE(a.duration, 30) * 0.3)::INTEGER
      ELSE                 ROUND(COALESCE(a.duration, 30) * 0.6)::INTEGER
    END                                                  AS load_score
  FROM  activities a
  WHERE a.user_id = auth.uid()
    AND a.date   >= CURRENT_DATE - days_back
  ORDER BY a.date DESC;
$$;
