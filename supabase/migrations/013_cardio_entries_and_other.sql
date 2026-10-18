-- Cardio is an exercise inside a workout, not a session type.
-- 'other' is a free-text session stored in activities.notes.

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check
  CHECK (type IN ('gym', 'cult_session', 'swimming', 'run', 'other', 'cardio'));

CREATE TABLE IF NOT EXISTS cardio_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id       UUID REFERENCES activities ON DELETE CASCADE NOT NULL,
  exercise_id       UUID REFERENCES exercises,
  position          INTEGER NOT NULL,
  duration_minutes  NUMERIC(6,1),
  calories          INTEGER,
  label             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cardio_entries_activity ON cardio_entries(activity_id);

ALTER TABLE cardio_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cardio_entries_own" ON cardio_entries;
CREATE POLICY "cardio_entries_own" ON cardio_entries
  USING (
    activity_id IN (
      SELECT id FROM activities WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    activity_id IN (
      SELECT id FROM activities WHERE user_id = (SELECT auth.uid())
    )
  );

INSERT INTO exercises (name, category, primary_muscle, secondary_muscles, equipment, is_custom)
SELECT 'Cardio', 'cardio', 'Cardio', ARRAY[]::text[], 'machine', false
WHERE NOT EXISTS (
  SELECT 1 FROM exercises
  WHERE user_id IS NULL AND lower(name) = 'cardio'
);

-- Copy the four session-level cardio_metrics rows into entries so history
-- can show them in the new shape. The old table stays readable.
INSERT INTO cardio_entries (activity_id, exercise_id, position, duration_minutes, calories, label)
SELECT
  cm.activity_id,
  (SELECT id FROM exercises WHERE user_id IS NULL AND lower(name) = 'cardio' ORDER BY created_at LIMIT 1),
  1,
  a.duration,
  cm.calories,
  COALESCE(
    a.structured_metrics #>> '{cardio,methodLabel}',
    a.structured_metrics #>> '{cardio,method}',
    'Cardio'
  )
FROM cardio_metrics cm
JOIN activities a ON a.id = cm.activity_id
WHERE NOT EXISTS (
  SELECT 1 FROM cardio_entries ce WHERE ce.activity_id = cm.activity_id
);

-- One transaction for a workout, its strength sets, and its cardio entries.
CREATE OR REPLACE FUNCTION save_workout(
  p_date date,
  p_type text,
  p_sub_type text,
  p_duration integer,
  p_notes text,
  p_tags text[],
  p_structured_metrics jsonb,
  p_sets jsonb,
  p_cardio jsonb,
  p_legacy_cardio jsonb DEFAULT NULL
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

  INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
  SELECT
    v_id,
    (row->>'exercise_id')::uuid,
    (row->>'set_number')::integer,
    NULLIF(row->>'reps', '')::integer,
    NULLIF(row->>'weight', '')::numeric
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

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION save_workout(date, text, text, integer, text, text[], jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_workout(date, text, text, integer, text, text[], jsonb, jsonb, jsonb, jsonb) TO authenticated;
