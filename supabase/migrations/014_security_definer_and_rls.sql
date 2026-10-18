-- Lock down SECURITY DEFINER analytics functions and initplan-wrap auth.uid().

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
SET search_path = public
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
  WHERE a.user_id = (SELECT auth.uid())
    AND lower(e.name) <> 'cardio'
    AND COALESCE(ss.weight, 0) > 0
  GROUP BY ss.exercise_id, e.name
  ORDER BY total_volume DESC;
$$;

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
SET search_path = public
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
    WHERE a.user_id = (SELECT auth.uid())
      AND ss.weight IS NOT NULL
      AND ss.reps IS NOT NULL
      AND ss.weight > 0
      AND lower(e.name) <> 'cardio'
  )
  SELECT exercise_id, exercise_name, weight, reps, estimated_1rm, achieved_on
  FROM ranked
  WHERE rn = 1
  ORDER BY estimated_1rm DESC;
$$;

CREATE OR REPLACE FUNCTION get_training_load(days_back INTEGER DEFAULT 28)
RETURNS TABLE (
  activity_date  DATE,
  activity_type  TEXT,
  duration_min   INTEGER,
  load_score     INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.date                                               AS activity_date,
    a.type                                               AS activity_type,
    COALESCE(a.duration, 30)                             AS duration_min,
    CASE a.type
      WHEN 'gym'          THEN ROUND(COALESCE(a.duration, 30) * 1.0)::INTEGER
      WHEN 'cult_session' THEN ROUND(COALESCE(a.duration, 30) * 0.8)::INTEGER
      WHEN 'run'          THEN ROUND(COALESCE(a.duration, 30) * 0.8)::INTEGER
      WHEN 'swimming'     THEN ROUND(COALESCE(a.duration, 30) * 0.8)::INTEGER
      WHEN 'other'        THEN ROUND(COALESCE(a.duration, 30) * 0.4)::INTEGER
      ELSE                     ROUND(COALESCE(a.duration, 30) * 0.6)::INTEGER
    END                                                  AS load_score
  FROM activities a
  WHERE a.user_id = (SELECT auth.uid())
    AND a.date >= CURRENT_DATE - days_back
  ORDER BY a.date DESC;
$$;

REVOKE ALL ON FUNCTION get_exercise_summaries() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_personal_records() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_training_load(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_exercise_summaries() TO authenticated;
GRANT EXECUTE ON FUNCTION get_personal_records() TO authenticated;
GRANT EXECUTE ON FUNCTION get_training_load(integer) TO authenticated;

DO $body$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END
$body$;

DROP POLICY IF EXISTS "activities_own" ON activities;
CREATE POLICY "activities_own" ON activities
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "strength_sets_own" ON strength_sets;
CREATE POLICY "strength_sets_own" ON strength_sets
  USING (activity_id IN (SELECT id FROM activities WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (activity_id IN (SELECT id FROM activities WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "cardio_metrics_own" ON cardio_metrics;
CREATE POLICY "cardio_metrics_own" ON cardio_metrics
  USING (activity_id IN (SELECT id FROM activities WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (activity_id IN (SELECT id FROM activities WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "cardio_entries_own" ON cardio_entries;
CREATE POLICY "cardio_entries_own" ON cardio_entries
  USING (activity_id IN (SELECT id FROM activities WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (activity_id IN (SELECT id FROM activities WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "body_metrics_own" ON body_metrics;
CREATE POLICY "body_metrics_own" ON body_metrics
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "exercises_read" ON exercises;
CREATE POLICY "exercises_read" ON exercises
  FOR SELECT USING (user_id IS NULL OR (SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "exercises_write" ON exercises;
CREATE POLICY "exercises_write" ON exercises
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id AND is_custom = true);

DROP POLICY IF EXISTS "exercises_delete" ON exercises;
CREATE POLICY "exercises_delete" ON exercises
  FOR DELETE USING ((SELECT auth.uid()) = user_id AND is_custom = true);

DROP POLICY IF EXISTS "calorie_logs_own" ON calorie_logs;
CREATE POLICY "calorie_logs_own" ON calorie_logs
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "daily_steps_own" ON daily_steps;
CREATE POLICY "daily_steps_own" ON daily_steps
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "quick_foods_own" ON quick_foods;
CREATE POLICY "quick_foods_own" ON quick_foods
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "speech_practice_sessions_own" ON speech_practice_sessions;
CREATE POLICY "speech_practice_sessions_own" ON speech_practice_sessions
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "guided_workout_drafts_own" ON guided_workout_drafts;
CREATE POLICY "guided_workout_drafts_own" ON guided_workout_drafts
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
