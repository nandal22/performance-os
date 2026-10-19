-- In-progress sessions that persist set by set, per-dumbbell loads, and cardio items in plans.
-- Every statement is additive. Existing activities, sets, and cardio rows keep their values.

-- 1. Sessions. A session is an activity with status 'in_progress' until it is finished.
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_status_check') THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_status_check CHECK (status IN ('in_progress', 'done'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activities_in_progress
  ON activities (user_id, created_at DESC) WHERE status = 'in_progress';

-- A plan set is logged at most once per session, so a retried write cannot duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS strength_sets_activity_plan_set
  ON strength_sets (activity_id, plan_set_id) WHERE plan_set_id IS NOT NULL;

-- 2. Dumbbells. per_dumbbell: plan targets are ONE dumbbell; strength_sets.weight stays the combined pair.
-- The flag and the target conversion run once, in the same step that adds the column,
-- so a rerun cannot halve a target twice.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'load_type'
  ) THEN
    ALTER TABLE exercises ADD COLUMN load_type text NOT NULL DEFAULT 'total';
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_load_type_check CHECK (load_type IN ('total', 'per_dumbbell'));

    -- Paired-dumbbell movements: dumbbell equipment or a dumbbell name (including the
    -- owner's spellings "Dumbell" and "Dummbell"), plus hammer curls and farmer carries.
    -- One-arm movements hold a single dumbbell, so they stay 'total'.
    UPDATE exercises
    SET load_type = 'per_dumbbell'
    WHERE (
        equipment = 'dumbbell'
        OR name ~* 'dum+b+e+l+'
        OR lower(name) IN ('hammer curl', 'hammer curls', 'farmer carry', 'farmers carry', 'farmer''s carry')
      )
      AND name !~* '(lean[- ]?away|single[- ]arm|one[- ]arm|cable)'
      AND category <> 'cardio';

    -- Coach targets written before this migration used the combined weight, matching the log.
    -- Halve them so a target keeps meaning the same load under the per-dumbbell contract.
    UPDATE plan_sets ps
    SET target_weight_kg = round(ps.target_weight_kg / 2, 2)
    FROM plan_exercises pe
    JOIN exercises e ON e.id = pe.exercise_id
    WHERE pe.id = ps.plan_exercise_id
      AND e.load_type = 'per_dumbbell'
      AND ps.target_weight_kg IS NOT NULL;
  END IF;
END $$;

-- 3. Cardio items in plans.
ALTER TABLE plan_exercises
  ADD COLUMN IF NOT EXISTS target_duration_min numeric(5,1),
  ADD COLUMN IF NOT EXISTS target_incline_pct  numeric(4,1),
  ADD COLUMN IF NOT EXISTS target_speed_kmh    numeric(4,1),
  ADD COLUMN IF NOT EXISTS target_kcal         integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_exercises_cardio_targets_check') THEN
    ALTER TABLE plan_exercises
      ADD CONSTRAINT plan_exercises_cardio_targets_check CHECK (
        (target_duration_min IS NULL OR target_duration_min > 0)
        AND (target_incline_pct IS NULL OR target_incline_pct BETWEEN 0 AND 40)
        AND (target_speed_kmh IS NULL OR target_speed_kmh > 0)
        AND (target_kcal IS NULL OR target_kcal >= 0)
      );
  END IF;
END $$;

ALTER TABLE cardio_entries
  ADD COLUMN IF NOT EXISTS plan_exercise_id uuid REFERENCES plan_exercises(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cardio_entries_activity_plan_exercise
  ON cardio_entries (activity_id, plan_exercise_id) WHERE plan_exercise_id IS NOT NULL;

-- Same signature as 016. Cardio fields are optional keys, so older payloads still work.
CREATE OR REPLACE FUNCTION public.upsert_workout_plan(
  p_user_id uuid,
  p_plan_date date,
  p_day_type text,
  p_title text,
  p_notes text,
  p_exercises jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing_status text;
  v_plan_id uuid;
  v_exercise jsonb;
  v_exercise_id uuid;
BEGIN
  SELECT status INTO v_existing_status
  FROM workout_plans
  WHERE user_id = p_user_id AND plan_date = p_plan_date;

  IF FOUND AND v_existing_status <> 'planned' THEN
    RAISE EXCEPTION 'plan status % cannot be replaced', v_existing_status;
  END IF;

  INSERT INTO workout_plans (user_id, plan_date, day_type, title, notes)
  VALUES (p_user_id, p_plan_date, p_day_type, p_title, p_notes)
  ON CONFLICT (user_id, plan_date) DO UPDATE
    SET day_type = EXCLUDED.day_type,
        title = EXCLUDED.title,
        notes = EXCLUDED.notes
  RETURNING id INTO v_plan_id;

  DELETE FROM plan_exercises WHERE plan_id = v_plan_id;

  FOR v_exercise IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb))
  LOOP
    INSERT INTO plan_exercises (
      plan_id, position, exercise_id, superset_group, note,
      target_duration_min, target_incline_pct, target_speed_kmh, target_kcal
    )
    VALUES (
      v_plan_id,
      (v_exercise->>'position')::int,
      (v_exercise->>'exercise_id')::uuid,
      NULLIF(v_exercise->>'superset_group', ''),
      NULLIF(v_exercise->>'note', ''),
      NULLIF(v_exercise->>'target_duration_min', '')::numeric,
      NULLIF(v_exercise->>'target_incline_pct', '')::numeric,
      NULLIF(v_exercise->>'target_speed_kmh', '')::numeric,
      NULLIF(v_exercise->>'target_kcal', '')::numeric::int
    )
    RETURNING id INTO v_exercise_id;

    INSERT INTO plan_sets (
      plan_exercise_id, set_number, set_type,
      target_reps_min, target_reps_max, target_weight_kg,
      target_rir_min, target_rir_max, rest_seconds, note
    )
    SELECT
      v_exercise_id,
      (s->>'set_number')::int,
      COALESCE(NULLIF(s->>'set_type', ''), 'straight'),
      (s->>'target_reps_min')::int,
      (s->>'target_reps_max')::int,
      NULLIF(s->>'target_weight_kg', '')::numeric,
      NULLIF(s->>'target_rir_min', '')::numeric,
      NULLIF(s->>'target_rir_max', '')::numeric,
      NULLIF(s->>'rest_seconds', '')::int,
      NULLIF(s->>'note', '')
    FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb)) AS s;
  END LOOP;

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_workout_plan(uuid, date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_workout_plan(uuid, date, text, text, text, jsonb) TO authenticated;

-- Opens a session. The client picks the id, so a retry or a second tap converges on one row.
CREATE OR REPLACE FUNCTION public.start_workout_session(
  p_activity_id uuid,
  p_date date,
  p_type text,
  p_sub_type text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_tags text[] DEFAULT '{}',
  p_plan_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO activities (id, user_id, date, type, sub_type, notes, tags, structured_metrics, status)
  VALUES (p_activity_id, v_user, p_date, p_type, p_sub_type, p_notes, COALESCE(p_tags, '{}'), '{}'::jsonb, 'in_progress')
  ON CONFLICT (id) DO NOTHING;

  IF p_plan_id IS NOT NULL THEN
    UPDATE workout_plans
    SET status = 'in_progress',
        activity_id = p_activity_id
    WHERE id = p_plan_id
      AND user_id = v_user
      AND status IN ('planned', 'in_progress');
    IF NOT FOUND AND NOT EXISTS (
      SELECT 1 FROM workout_plans
      WHERE id = p_plan_id AND user_id = v_user AND activity_id = p_activity_id
    ) THEN
      RAISE EXCEPTION 'plan % cannot be started', p_plan_id;
    END IF;
  END IF;

  RETURN p_activity_id;
END;
$$;

-- Closes a session. Running it twice leaves the same row.
CREATE OR REPLACE FUNCTION public.finish_workout_session(
  p_activity_id uuid,
  p_duration integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_structured_metrics jsonb DEFAULT NULL,
  p_plan_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE activities
  SET status = 'done',
      duration = COALESCE(p_duration, duration),
      notes = COALESCE(p_notes, notes),
      structured_metrics = COALESCE(structured_metrics, '{}'::jsonb) || COALESCE(p_structured_metrics, '{}'::jsonb),
      updated_at = now()
  WHERE id = p_activity_id AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session % not found', p_activity_id;
  END IF;

  IF p_plan_id IS NOT NULL THEN
    UPDATE workout_plans
    SET status = 'done',
        activity_id = p_activity_id
    WHERE id = p_plan_id AND user_id = v_user;
  END IF;

  RETURN p_activity_id;
END;
$$;

-- Throws away an unfinished session and hands its plan back to 'planned'. Finished sessions are kept.
CREATE OR REPLACE FUNCTION public.discard_workout_session(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE workout_plans
  SET status = 'planned',
      activity_id = NULL
  WHERE activity_id = p_activity_id
    AND user_id = v_user
    AND status = 'in_progress';

  DELETE FROM activities
  WHERE id = p_activity_id
    AND user_id = v_user
    AND status = 'in_progress';
END;
$$;

REVOKE ALL ON FUNCTION public.start_workout_session(uuid, date, text, text, text, text[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_workout_session(uuid, integer, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_workout_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, text, text, text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_workout_session(uuid, integer, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_workout_session(uuid) TO authenticated;
