-- Bodyweight and timed exercises.
--
-- Storage contract:
--   strength_sets.weight stays the TOTAL load (body weight + added), exactly as history
--   was logged, so volume, Progress, PRs and calories keep one meaning across old and new rows.
--   New nullable columns carry the split: added_weight_kg (the added load) and
--   bodyweight_kg (body weight used). A timed set stores duration_sec; its reps are null.
--   plan_sets.target_weight_kg is the ADDED load for load_type 'bodyweight' (null = BW only),
--   one dumbbell for 'per_dumbbell', and the total otherwise.
--
-- Every original column of every existing row keeps its value, except the documented
-- plan target conversion below (old values are kept in migration_019_changes).
-- The backfill only writes the new columns and is recorded there too, so it can be reversed:
--   UPDATE exercises e SET load_type = c.old->>'load_type'
--     FROM migration_019_changes c WHERE c.table_name = 'exercises' AND c.kind = 'bodyweight_flag' AND c.row_id = e.id;
--   (exercises.measure, the new columns, bodyweight_on and migration_019_changes can then be dropped.)
--   UPDATE strength_sets s SET added_weight_kg = NULL, bodyweight_kg = NULL, duration_sec = NULL
--     FROM migration_019_changes c WHERE c.table_name = 'strength_sets' AND c.row_id = s.id;
--   UPDATE plan_sets p SET target_weight_kg = (c.old->>'target_weight_kg')::numeric
--     FROM migration_019_changes c WHERE c.table_name = 'plan_sets' AND c.kind = 'added_weight' AND c.row_id = p.id;
--   UPDATE plan_sets p SET target_reps_min = (c.old->>'target_reps_min')::int, target_reps_max = (c.old->>'target_reps_max')::int,
--       target_duration_sec_min = NULL, target_duration_sec_max = NULL
--     FROM migration_019_changes c WHERE c.table_name = 'plan_sets' AND c.kind = 'duration_from_reps' AND c.row_id = p.id;

-- 1. Load type 'bodyweight'. Replacing the check is safe to rerun.
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_load_type_check;
ALTER TABLE exercises
  ADD CONSTRAINT exercises_load_type_check CHECK (load_type IN ('total', 'per_dumbbell', 'bodyweight'));

-- 2. New columns. All nullable or defaulted, so old payloads keep working.
ALTER TABLE strength_sets
  ADD COLUMN IF NOT EXISTS added_weight_kg numeric(6,2),
  ADD COLUMN IF NOT EXISTS bodyweight_kg   numeric(5,2),
  ADD COLUMN IF NOT EXISTS duration_sec    integer;

ALTER TABLE plan_sets
  ADD COLUMN IF NOT EXISTS target_duration_sec_min integer,
  ADD COLUMN IF NOT EXISTS target_duration_sec_max integer;

-- A timed set has seconds instead of reps.
ALTER TABLE plan_sets ALTER COLUMN target_reps_min DROP NOT NULL;
ALTER TABLE plan_sets ALTER COLUMN target_reps_max DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'strength_sets_load_split_check') THEN
    ALTER TABLE strength_sets
      ADD CONSTRAINT strength_sets_load_split_check CHECK (
        (added_weight_kg IS NULL OR added_weight_kg >= 0)
        AND (bodyweight_kg IS NULL OR bodyweight_kg > 0)
        AND (duration_sec IS NULL OR duration_sec > 0)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_sets_target_measure_check') THEN
    ALTER TABLE plan_sets
      ADD CONSTRAINT plan_sets_target_measure_check CHECK (
        (target_reps_min IS NULL) = (target_reps_max IS NULL)
        AND (target_duration_sec_min IS NULL) = (target_duration_sec_max IS NULL)
        AND (target_reps_min IS NOT NULL OR target_duration_sec_min IS NOT NULL)
        AND (target_duration_sec_min IS NULL OR (target_duration_sec_min > 0 AND target_duration_sec_min <= target_duration_sec_max))
      );
  END IF;
END $$;

-- Reversal record for the one-time data steps. Not exposed to the API.
CREATE TABLE IF NOT EXISTS migration_019_changes (
  table_name text NOT NULL,
  row_id     uuid NOT NULL,
  kind       text NOT NULL,
  old        jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id, kind)
);
ALTER TABLE migration_019_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON migration_019_changes FROM PUBLIC, anon, authenticated;

-- Body weight on a date: the latest weigh-in on or before it, else the first one after.
CREATE OR REPLACE FUNCTION public.bodyweight_on(p_user_id uuid, p_date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT weight FROM (
    (SELECT weight, 0 AS pick, date FROM body_metrics
      WHERE user_id = p_user_id AND weight IS NOT NULL AND date <= p_date
      ORDER BY date DESC LIMIT 1)
    UNION ALL
    (SELECT weight, 1 AS pick, date FROM body_metrics
      WHERE user_id = p_user_id AND weight IS NOT NULL AND date > p_date
      ORDER BY date ASC LIMIT 1)
  ) w
  ORDER BY pick
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.bodyweight_on(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bodyweight_on(uuid, date) TO authenticated;

-- 3. One-time flagging and conversion, gated on the measure column so a rerun cannot
--    convert a target twice.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'measure'
  ) THEN
    ALTER TABLE exercises ADD COLUMN measure text NOT NULL DEFAULT 'reps';
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_measure_check CHECK (measure IN ('reps', 'time'));

    -- Bodyweight movements: bodyweight equipment, or a bodyweight name on an exercise with
    -- no loading equipment. Paired-dumbbell exercises keep 'per_dumbbell'.
    WITH upd AS (
      UPDATE exercises
      SET load_type = 'bodyweight'
      WHERE load_type = 'total'
        AND category <> 'cardio'
        AND (
          equipment = 'bodyweight'
          OR (
            COALESCE(equipment, '') IN ('', 'bodyweight', 'other')
            AND name ~* '(^|[^a-z])(dips?|chin[- ]?ups?|pull[- ]?ups?|push[- ]?ups?|leg raises?|hanging|plank|dands?|glute bridges?|block jumps?|sit[- ]?ups?|burpees?|muscle[- ]?ups?|pistol)([^a-z]|$)'
          )
        )
      RETURNING id
    )
    INSERT INTO migration_019_changes (table_name, row_id, kind, old)
    SELECT 'exercises', id, 'bodyweight_flag', '{"load_type":"total"}'::jsonb FROM upd;

    -- Timed movements: holds, planks and carries.
    UPDATE exercises
    SET measure = 'time'
    WHERE category <> 'cardio'
      AND name ~* '(^|[^a-z])(planks?|holds?|carry|carries|wall sit|dead hang|l[- ]sit|hollow)([^a-z]|$)';

    -- Backfill the load split on past sets of bodyweight exercises. weight is untouched.
    WITH src AS (
      SELECT s.id, s.weight, bodyweight_on(a.user_id, a.date) AS bw
      FROM strength_sets s
      JOIN activities a ON a.id = s.activity_id
      JOIN exercises e ON e.id = s.exercise_id
      WHERE e.load_type = 'bodyweight'
        AND s.added_weight_kg IS NULL
        AND s.bodyweight_kg IS NULL
    ), upd AS (
      UPDATE strength_sets s
      SET bodyweight_kg = round(src.bw, 2),
          added_weight_kg = CASE
            WHEN src.weight IS NULL OR src.weight - src.bw < 0.5 THEN 0
            ELSE round(src.weight - src.bw, 2)
          END
      FROM src
      WHERE s.id = src.id AND src.bw IS NOT NULL
      RETURNING s.id
    )
    INSERT INTO migration_019_changes (table_name, row_id, kind)
    SELECT 'strength_sets', id, 'bodyweight_split' FROM upd;

    -- Past timed sets were logged with the seconds in reps. Copy them to duration_sec.
    -- A rep count under 10 (a farmer carry logged as 1) is a trip count, not seconds.
    WITH upd AS (
      UPDATE strength_sets s
      SET duration_sec = s.reps
      FROM exercises e
      WHERE e.id = s.exercise_id
        AND e.measure = 'time'
        AND s.duration_sec IS NULL
        AND s.reps >= 10
      RETURNING s.id
    )
    INSERT INTO migration_019_changes (table_name, row_id, kind)
    SELECT 'strength_sets', id, 'duration_from_reps' FROM upd
    ON CONFLICT DO NOTHING;

    -- Plan targets for bodyweight exercises were body weight + added (e.g. 86.4 = 71.4 + 15).
    -- Under this contract they mean the added load only: subtract the body weight on the plan
    -- date. Under 0.5 kg left means BW only (null). Without a weigh-in the target is kept.
    WITH src AS (
      SELECT ps.id, ps.target_weight_kg, ps.target_reps_min, ps.target_reps_max,
             bodyweight_on(wp.user_id, wp.plan_date) AS bw
      FROM plan_sets ps
      JOIN plan_exercises pe ON pe.id = ps.plan_exercise_id
      JOIN workout_plans wp ON wp.id = pe.plan_id
      JOIN exercises e ON e.id = pe.exercise_id
      WHERE e.load_type = 'bodyweight'
        AND ps.target_weight_kg IS NOT NULL
    ), rec AS (
      INSERT INTO migration_019_changes (table_name, row_id, kind, old)
      SELECT 'plan_sets', id, 'added_weight',
             jsonb_build_object('target_weight_kg', target_weight_kg, 'target_reps_min', target_reps_min,
                                'target_reps_max', target_reps_max, 'bodyweight_kg', bw)
      FROM src WHERE bw IS NOT NULL
      RETURNING row_id
    )
    UPDATE plan_sets ps
    SET target_weight_kg = CASE WHEN src.target_weight_kg - src.bw < 0.5 THEN NULL ELSE round(src.target_weight_kg - src.bw, 2) END
    FROM src
    JOIN rec ON rec.row_id = src.id
    WHERE ps.id = src.id;

    -- Plan targets for timed exercises carried the seconds in reps (e.g. plank 65-75).
    WITH src AS (
      SELECT ps.id, ps.target_weight_kg, ps.target_reps_min, ps.target_reps_max
      FROM plan_sets ps
      JOIN plan_exercises pe ON pe.id = ps.plan_exercise_id
      JOIN exercises e ON e.id = pe.exercise_id
      WHERE e.measure = 'time'
        AND ps.target_duration_sec_min IS NULL
        AND ps.target_reps_max >= 10
    ), rec AS (
      INSERT INTO migration_019_changes (table_name, row_id, kind, old)
      SELECT 'plan_sets', id, 'duration_from_reps',
             jsonb_build_object('target_reps_min', target_reps_min, 'target_reps_max', target_reps_max)
      FROM src
      RETURNING row_id
    )
    UPDATE plan_sets ps
    SET target_duration_sec_min = src.target_reps_min,
        target_duration_sec_max = src.target_reps_max,
        target_reps_min = NULL,
        target_reps_max = NULL
    FROM src
    JOIN rec ON rec.row_id = src.id
    WHERE ps.id = src.id;
  END IF;
END $$;

-- 4. Coach write recipe. Same signature; the duration keys are optional.
-- For a timed exercise, a payload with no duration keys and reps of 10 or more is read the
-- way the coach wrote planks before 019: the reps are seconds.
-- For a bodyweight exercise, target_weight_kg is the ADDED load. A v2 payload sent body weight
-- + added (e.g. 86.4 for BW + 15 at 71.4 kg); a target at or above body weight on the plan date
-- (less 0.5 kg) is read that way and the body weight is taken off, as the 019 backfill does.
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
  v_timed boolean;
  v_bodyweight boolean;
  v_bw numeric := bodyweight_on(p_user_id, p_plan_date);
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

    SELECT measure = 'time', load_type = 'bodyweight' INTO v_timed, v_bodyweight
    FROM exercises WHERE id = (v_exercise->>'exercise_id')::uuid;

    INSERT INTO plan_sets (
      plan_exercise_id, set_number, set_type,
      target_reps_min, target_reps_max, target_weight_kg,
      target_duration_sec_min, target_duration_sec_max,
      target_rir_min, target_rir_max, rest_seconds, note
    )
    SELECT
      v_exercise_id,
      x.set_number,
      x.set_type,
      CASE WHEN x.legacy_seconds THEN NULL ELSE x.reps_min END,
      CASE WHEN x.legacy_seconds THEN NULL ELSE x.reps_max END,
      CASE
        WHEN COALESCE(v_bodyweight, false) AND v_bw IS NOT NULL AND x.weight >= v_bw - 0.5 THEN
          CASE WHEN x.weight - v_bw < 0.5 THEN NULL ELSE round(x.weight - v_bw, 2) END
        ELSE x.weight
      END,
      CASE WHEN x.legacy_seconds THEN x.reps_min ELSE x.sec_min END,
      CASE WHEN x.legacy_seconds THEN x.reps_max ELSE x.sec_max END,
      x.rir_min, x.rir_max, x.rest, x.note
    FROM (
      SELECT
        (s->>'set_number')::int AS set_number,
        COALESCE(NULLIF(s->>'set_type', ''), 'straight') AS set_type,
        NULLIF(s->>'target_reps_min', '')::int AS reps_min,
        NULLIF(s->>'target_reps_max', '')::int AS reps_max,
        NULLIF(s->>'target_weight_kg', '')::numeric AS weight,
        COALESCE(NULLIF(s->>'target_duration_sec_min', ''), NULLIF(s->>'target_duration_sec_max', ''))::int AS sec_min,
        COALESCE(NULLIF(s->>'target_duration_sec_max', ''), NULLIF(s->>'target_duration_sec_min', ''))::int AS sec_max,
        NULLIF(s->>'target_rir_min', '')::numeric AS rir_min,
        NULLIF(s->>'target_rir_max', '')::numeric AS rir_max,
        NULLIF(s->>'rest_seconds', '')::int AS rest,
        NULLIF(s->>'note', '') AS note,
        COALESCE(v_timed, false)
          AND NULLIF(s->>'target_duration_sec_min', '') IS NULL
          AND NULLIF(s->>'target_duration_sec_max', '') IS NULL
          AND COALESCE(NULLIF(s->>'target_reps_max', '')::int, 0) >= 10 AS legacy_seconds
      FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb)) AS s
    ) x;
  END LOOP;

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_workout_plan(uuid, date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_workout_plan(uuid, date, text, text, text, jsonb) TO authenticated;

-- 5. save_workout: same signature; sets accept the optional added_weight_kg, bodyweight_kg
--    and duration_sec keys.
CREATE OR REPLACE FUNCTION public.save_workout(
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

  INSERT INTO strength_sets (
    activity_id, exercise_id, set_number, reps, weight, rpe, plan_set_id,
    added_weight_kg, bodyweight_kg, duration_sec
  )
  SELECT
    v_id,
    (row->>'exercise_id')::uuid,
    (row->>'set_number')::integer,
    NULLIF(row->>'reps', '')::integer,
    NULLIF(row->>'weight', '')::numeric,
    NULLIF(row->>'rpe', '')::numeric,
    NULLIF(row->>'plan_set_id', '')::uuid,
    NULLIF(row->>'added_weight_kg', '')::numeric,
    NULLIF(row->>'bodyweight_kg', '')::numeric,
    NULLIF(row->>'duration_sec', '')::numeric::integer
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
