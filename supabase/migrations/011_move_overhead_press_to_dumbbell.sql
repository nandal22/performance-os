-- Move historical overhead press logs to the dumbbell overhead press exercise.
-- Sachin's existing Overhead Press rows were logged as dumbbell work.

INSERT INTO exercises (name, category, primary_muscle, secondary_muscles, equipment, is_custom)
SELECT
  'Dumbbell Overhead Press',
  'push',
  'Shoulders',
  ARRAY['Triceps'],
  'dumbbell',
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM exercises
  WHERE lower(name) = 'dumbbell overhead press'
);

WITH target AS (
  SELECT id
  FROM exercises
  WHERE lower(name) = 'dumbbell overhead press'
  ORDER BY (user_id IS NULL) DESC, created_at ASC
  LIMIT 1
),
source AS (
  SELECT id
  FROM exercises
  WHERE lower(name) IN ('overhead press', 'db shoulder press', 'dumbbell shoulder press')
    AND id <> (SELECT id FROM target)
)
UPDATE strength_sets
SET exercise_id = (SELECT id FROM target)
WHERE exercise_id IN (SELECT id FROM source)
  AND created_at <= TIMESTAMPTZ '2026-05-09T14:30:00.000Z';
