-- Compact main-lift cards for the Progress screen.
-- One row per compound lift: last session's sets, the previous max, the PR,
-- and the last eight session peaks. Full set history stays on the detail sheet.

CREATE OR REPLACE FUNCTION public.get_progress_cards()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH names(name) AS (
    VALUES
      ('bench press'),
      ('squat'),
      ('deadlift'),
      ('overhead press'),
      ('dumbbell overhead press'),
      ('barbell row'),
      ('romanian deadlift'),
      ('incline bench press'),
      ('pull-up'),
      ('leg press'),
      ('hip thrust')
  ),
  owned AS (
    SELECT
      e.id AS exercise_id,
      e.name AS exercise_name,
      a.date,
      ss.set_number,
      ss.reps,
      ss.weight
    FROM strength_sets ss
    JOIN activities a ON a.id = ss.activity_id
    JOIN exercises e ON e.id = ss.exercise_id
    JOIN names n ON n.name = lower(e.name)
    WHERE a.user_id = (SELECT auth.uid())
      AND COALESCE(ss.weight, 0) > 0
  ),
  sessions AS (
    SELECT
      exercise_id,
      exercise_name,
      date,
      MAX(weight) AS max_weight,
      jsonb_agg(
        jsonb_build_object(
          'weight', weight,
          'reps', reps,
          'set_number', set_number
        )
        ORDER BY set_number
      ) AS sets
    FROM owned
    GROUP BY exercise_id, exercise_name, date
  ),
  ranked AS (
    SELECT
      sessions.*,
      ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY date DESC) AS rn
    FROM sessions
  ),
  pr AS (
    SELECT DISTINCT ON (exercise_id)
      exercise_id,
      weight AS pr_weight,
      reps AS pr_reps
    FROM owned
    ORDER BY exercise_id, weight DESC, date DESC, set_number
  ),
  spark AS (
    SELECT
      exercise_id,
      jsonb_agg(
        jsonb_build_object('date', date, 'weight', max_weight)
        ORDER BY date
      ) AS sparkline
    FROM ranked
    WHERE rn <= 8
    GROUP BY exercise_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'exercise_id', latest.exercise_id,
      'exercise_name', latest.exercise_name,
      'last_date', latest.date,
      'previous_max', previous.max_weight,
      'pr_weight', pr.pr_weight,
      'pr_reps', pr.pr_reps,
      'last_sets', latest.sets,
      'sparkline', COALESCE(spark.sparkline, '[]'::jsonb)
    )
    ORDER BY array_position(
      ARRAY[
        'bench press', 'squat', 'deadlift', 'overhead press',
        'dumbbell overhead press', 'barbell row', 'romanian deadlift',
        'incline bench press', 'pull-up', 'leg press', 'hip thrust'
      ],
      lower(latest.exercise_name)
    )
  ), '[]'::jsonb)
  FROM ranked latest
  LEFT JOIN ranked previous
    ON previous.exercise_id = latest.exercise_id
   AND previous.rn = 2
  LEFT JOIN pr ON pr.exercise_id = latest.exercise_id
  LEFT JOIN spark ON spark.exercise_id = latest.exercise_id
  WHERE latest.rn = 1;
$$;

REVOKE ALL ON FUNCTION public.get_progress_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_progress_cards() TO authenticated;
