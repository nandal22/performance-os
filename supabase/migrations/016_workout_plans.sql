-- Workout plans written by the coach and logged by the owner.
-- The coach connector bypasses RLS and must set user_id itself.
-- upsert_workout_plan is the coach write recipe.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE workout_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  plan_date   date NOT NULL,
  day_type    text NOT NULL,
  title       text,
  notes       text,
  status      text NOT NULL DEFAULT 'planned',
  activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  source      text NOT NULL DEFAULT 'coach',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT workout_plans_status_check CHECK (status IN ('planned', 'in_progress', 'done', 'skipped')),
  CONSTRAINT workout_plans_user_date UNIQUE (user_id, plan_date)
);

CREATE TRIGGER workout_plans_set_updated_at
  BEFORE UPDATE ON workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE plan_exercises (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES workout_plans ON DELETE CASCADE,
  position       int NOT NULL,
  exercise_id    uuid NOT NULL REFERENCES exercises(id),
  superset_group text,
  note           text,
  CONSTRAINT plan_exercises_plan_position UNIQUE (plan_id, position)
);

CREATE TABLE plan_sets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_exercise_id  uuid NOT NULL REFERENCES plan_exercises ON DELETE CASCADE,
  set_number        int NOT NULL,
  set_type          text NOT NULL DEFAULT 'straight',
  target_reps_min   int NOT NULL,
  target_reps_max   int NOT NULL,
  target_weight_kg  numeric(6,2),
  target_rir_min    numeric(3,1),
  target_rir_max    numeric(3,1),
  rest_seconds      int,
  note              text,
  CONSTRAINT plan_sets_type_check CHECK (set_type IN ('warmup', 'top', 'backoff', 'straight')),
  CONSTRAINT plan_sets_reps_check CHECK (target_reps_min <= target_reps_max),
  CONSTRAINT plan_sets_exercise_number UNIQUE (plan_exercise_id, set_number)
);

ALTER TABLE strength_sets
  ADD COLUMN plan_set_id uuid REFERENCES plan_sets(id) ON DELETE SET NULL;

CREATE INDEX idx_strength_sets_plan_set ON strength_sets(plan_set_id);

CREATE TABLE exercise_guidance (
  exercise_id     uuid PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
  setup           text,
  movement        text,
  common_mistakes text,
  image_urls      text[] DEFAULT '{}',
  video_url       text,
  source          text,
  license         text,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_guidance ENABLE ROW LEVEL SECURITY;

CREATE POLICY workout_plans_own ON workout_plans
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY plan_exercises_own ON plan_exercises
  USING (
    plan_id IN (SELECT id FROM workout_plans WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    plan_id IN (SELECT id FROM workout_plans WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY plan_sets_own ON plan_sets
  USING (
    plan_exercise_id IN (
      SELECT pe.id
      FROM plan_exercises pe
      JOIN workout_plans wp ON wp.id = pe.plan_id
      WHERE wp.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    plan_exercise_id IN (
      SELECT pe.id
      FROM plan_exercises pe
      JOIN workout_plans wp ON wp.id = pe.plan_id
      WHERE wp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY exercise_guidance_visible ON exercise_guidance
  USING (
    EXISTS (
      SELECT 1 FROM exercises e
      WHERE e.id = exercise_guidance.exercise_id
        AND (e.user_id IS NULL OR e.user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exercises e
      WHERE e.id = exercise_guidance.exercise_id
        AND (e.user_id IS NULL OR e.user_id = (SELECT auth.uid()))
    )
  );

REVOKE ALL ON workout_plans, plan_exercises, plan_sets, exercise_guidance FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plans, plan_exercises, plan_sets, exercise_guidance TO authenticated;

-- Extra argument is optional so existing save_workout calls keep working.
DROP FUNCTION IF EXISTS public.save_workout(date, text, text, integer, text, text[], jsonb, jsonb, jsonb, jsonb);

CREATE FUNCTION public.save_workout(
  p_date date,
  p_type text,
  p_sub_type text,
  p_duration integer,
  p_notes text,
  p_tags text[],
  p_structured_metrics jsonb,
  p_sets jsonb,
  p_cardio jsonb,
  p_legacy_cardio jsonb DEFAULT NULL,
  p_plan_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO activities (user_id, date, type, sub_type, duration, notes, tags, structured_metrics)
  VALUES (
    v_user,
    p_date,
    p_type,
    p_sub_type,
    p_duration,
    p_notes,
    COALESCE(p_tags, '{}'),
    COALESCE(p_structured_metrics, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight, rpe, plan_set_id)
  SELECT
    v_id,
    (row->>'exercise_id')::uuid,
    (row->>'set_number')::integer,
    NULLIF(row->>'reps', '')::integer,
    NULLIF(row->>'weight', '')::numeric,
    NULLIF(row->>'rpe', '')::numeric,
    NULLIF(row->>'plan_set_id', '')::uuid
  FROM jsonb_array_elements(COALESCE(p_sets, '[]'::jsonb)) AS row
  WHERE COALESCE((row->>'exercise_id'), '') <> ''
    AND (row->>'exercise_id') NOT LIKE 'pending-%';

  INSERT INTO cardio_entries (activity_id, exercise_id, position, duration_minutes, calories, label)
  SELECT
    v_id,
    CASE
      WHEN COALESCE(row->>'exercise_id', '') = '' OR (row->>'exercise_id') LIKE 'pending-%' THEN (
        SELECT id FROM exercises WHERE user_id IS NULL AND lower(name) = 'cardio' ORDER BY created_at LIMIT 1
      )
      ELSE (row->>'exercise_id')::uuid
    END,
    (row->>'position')::integer,
    NULLIF(row->>'duration_minutes', '')::numeric,
    NULLIF(row->>'calories', '')::integer,
    NULLIF(row->>'label', '')
  FROM jsonb_array_elements(COALESCE(p_cardio, '[]'::jsonb)) AS row;

  IF p_legacy_cardio IS NOT NULL THEN
    INSERT INTO cardio_metrics (activity_id, distance, avg_heart_rate, calories)
    VALUES (
      v_id,
      NULLIF(p_legacy_cardio->>'distance', '')::numeric,
      NULLIF(p_legacy_cardio->>'avg_heart_rate', '')::integer,
      NULLIF(p_legacy_cardio->>'calories', '')::integer
    );
  END IF;

  IF p_plan_id IS NOT NULL THEN
    UPDATE workout_plans
    SET activity_id = v_id,
        status = 'done'
    WHERE id = p_plan_id
      AND user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan not found';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_workout(date, text, text, integer, text, text[], jsonb, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout(date, text, text, integer, text, text[], jsonb, jsonb, jsonb, jsonb, uuid) TO authenticated;

-- Coach write recipe. Refuses to change a plan that is in_progress or done.
CREATE FUNCTION public.upsert_workout_plan(
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
    INSERT INTO plan_exercises (plan_id, position, exercise_id, superset_group, note)
    VALUES (
      v_plan_id,
      (v_exercise->>'position')::int,
      (v_exercise->>'exercise_id')::uuid,
      NULLIF(v_exercise->>'superset_group', ''),
      NULLIF(v_exercise->>'note', '')
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
