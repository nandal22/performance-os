#!/usr/bin/env node
// Applies supabase/migrations to a throwaway local database and prints pass/fail per case.
// Never connects to the hosted Supabase project.

import { gzipSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbName = `perfos_test_${process.pid}`;
const ownerId = '11111111-1111-1111-1111-111111111111';
const otherId = '22222222-2222-2222-2222-222222222222';
const thirdId = '33333333-3333-3333-3333-333333333333';
const results = [];

function psql(sql, database = dbName) {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

function psqlFile(path, database = dbName) {
  const sql = readFileSync(path);
  const result = spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1', '-X', '-q'], {
    input: sql,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql failed for ${path}`);
  }
}

function record(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    results.push({ name, pass: false, message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const preamble = `
-- Roles first: the grants below need them on a fresh cluster.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS auth.uid_override (id uuid);
INSERT INTO auth.uid_override VALUES ('${ownerId}');
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, public
AS $$ SELECT id FROM auth.uid_override LIMIT 1 $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
`;

const seed = `
INSERT INTO auth.users (id) VALUES ('${ownerId}');
INSERT INTO activities (id, user_id, date, type, duration, notes, structured_metrics) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '${ownerId}', '2026-01-01', 'gym', 40, 'keep-me', '{}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '${ownerId}', '2026-01-02', 'run', 25, 'old-run', '{"cardio":{"method":"running"}}');
INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', id, 1, 5, 100
FROM exercises WHERE name = 'Bench Press' AND user_id IS NULL LIMIT 1;
INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', id, 2, 5, 80
FROM exercises WHERE name = 'Bench Press' AND user_id IS NULL LIMIT 1;
INSERT INTO cardio_metrics (activity_id, calories, distance)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 320, 4.2);
CREATE TABLE test_snapshot AS
SELECT
  (SELECT count(*) FROM activities) AS activities,
  (SELECT count(*) FROM strength_sets) AS sets,
  (SELECT coalesce(sum(volume), 0) FROM strength_sets) AS volume,
  (SELECT count(*) FROM cardio_metrics) AS cardio_metrics,
  (SELECT coalesce(sum(calories), 0) FROM cardio_metrics) AS cardio_calories,
  (SELECT count(*) FROM exercises) AS exercises,
  (SELECT notes FROM activities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') AS gym_notes;
`;

// Rows that exist before 018: custom dumbbell spellings, one-arm and cable moves, and a
// coach plan whose dumbbell targets are combined weights, as they were written before 018.
const seed018 = `
INSERT INTO exercises (id, name, category, primary_muscle, equipment, is_custom, user_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Incline Dummbell Press', 'push', 'Chest', NULL, true, '${ownerId}'),
  ('e0000000-0000-0000-0000-000000000002', 'Shoulder Dumbell Press', 'push', 'Shoulders', NULL, true, '${ownerId}'),
  ('e0000000-0000-0000-0000-000000000003', 'Hammer Curl', 'pull', 'Biceps', NULL, true, '${ownerId}'),
  ('e0000000-0000-0000-0000-000000000004', 'Lean-Away Dumbbell Lateral Raise', 'push', 'Shoulders', 'dumbbell', true, '${ownerId}'),
  ('e0000000-0000-0000-0000-000000000005', 'Cable Lateral Raise', 'push', 'Shoulders', 'cable', true, '${ownerId}'),
  ('e0000000-0000-0000-0000-000000000006', 'Bulgarian Split Squat', 'legs', 'Quads', 'dumbbell', true, '${ownerId}');
SELECT upsert_workout_plan(
  '${ownerId}', '2026-09-20', 'Push', 'Before 018', NULL,
  jsonb_build_array(
    jsonb_build_object('position', 1, 'exercise_id', (SELECT id FROM exercises WHERE name = 'Bench Press' AND user_id IS NULL LIMIT 1),
      'sets', jsonb_build_array(jsonb_build_object('set_number', 1, 'set_type', 'top', 'target_reps_min', 5, 'target_reps_max', 5, 'target_weight_kg', 80))),
    jsonb_build_object('position', 2, 'exercise_id', 'e0000000-0000-0000-0000-000000000001',
      'sets', jsonb_build_array(
        jsonb_build_object('set_number', 1, 'set_type', 'top', 'target_reps_min', 6, 'target_reps_max', 8, 'target_weight_kg', 55),
        jsonb_build_object('set_number', 2, 'set_type', 'backoff', 'target_reps_min', 8, 'target_reps_max', 10, 'target_weight_kg', 45)))
  )
);
INSERT INTO activities (id, user_id, date, type, duration, notes, structured_metrics) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '${ownerId}', '2026-10-10', 'gym', 50, 'db-day', '{}');
INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'e0000000-0000-0000-0000-000000000001', 1, 8, 55);
-- The 013-017 cases compare against the first snapshot; count these rows into it.
UPDATE test_snapshot SET
  activities = activities + 1,
  sets = sets + 1,
  volume = volume + (SELECT coalesce(sum(volume), 0) FROM strength_sets WHERE activity_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'),
  exercises = exercises + 6;
CREATE TABLE test_snapshot_018 AS
SELECT
  (SELECT md5(string_agg(concat_ws('|', id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics), ',' ORDER BY id)) FROM activities) AS activities,
  (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, set_number, reps, weight, rpe, volume, plan_set_id), ',' ORDER BY id)) FROM strength_sets) AS sets,
  (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, position, duration_minutes, calories, label), ',' ORDER BY id)) FROM cardio_entries) AS cardio,
  (SELECT md5(string_agg(concat_ws('|', id, name, category, primary_muscle, equipment, is_custom, user_id), ',' ORDER BY id)) FROM exercises) AS exercises;
`;

const snapshot018 = `
SELECT
  (SELECT md5(string_agg(concat_ws('|', id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics), ',' ORDER BY id)) FROM activities) = activities
  AND (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, set_number, reps, weight, rpe, volume, plan_set_id), ',' ORDER BY id)) FROM strength_sets) = sets
  AND (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, position, duration_minutes, calories, label), ',' ORDER BY id)) FROM cardio_entries) IS NOT DISTINCT FROM cardio
  AND (SELECT md5(string_agg(concat_ws('|', id, name, category, primary_muscle, equipment, is_custom, user_id), ',' ORDER BY id)) FROM exercises) = exercises
FROM test_snapshot_018
`;

// Rows that exist before 019, shaped like production: custom bodyweight moves with no
// equipment, BW typed into the weight field, plank seconds typed into reps, a farmer carry
// logged as one trip, and a coach plan whose bodyweight targets include body weight.
const seed019 = `
INSERT INTO auth.users (id) VALUES ('${thirdId}') ON CONFLICT DO NOTHING;
INSERT INTO body_metrics (user_id, date, weight) VALUES
  ('${ownerId}', '2026-03-01', 70.75),
  ('${ownerId}', '2026-10-03', 71.4);
INSERT INTO exercises (id, name, category, primary_muscle, equipment, load_type, is_custom, user_id) VALUES
  ('e1900000-0000-0000-0000-000000000001', 'Dips', 'push', 'Chest', NULL, 'total', true, '${ownerId}'),
  ('e1900000-0000-0000-0000-000000000002', 'Chin Up', 'pull', 'Back', NULL, 'total', true, '${ownerId}'),
  ('e1900000-0000-0000-0000-000000000003', 'Farmer Carry', 'legs', 'Forearms', NULL, 'per_dumbbell', true, '${ownerId}'),
  ('e1900000-0000-0000-0000-000000000004', 'Hanging Leg Raise', 'core', 'Abs', 'bodyweight', 'total', true, '${ownerId}'),
  ('e1900000-0000-0000-0000-000000000005', 'Glute Bridge', 'legs', 'Glutes', NULL, 'total', true, '${ownerId}'),
  ('e1900000-0000-0000-0000-000000000006', 'Lunges', 'legs', 'Quads', NULL, 'total', true, '${ownerId}'),
  ('e1900000-0000-0000-0000-000000000007', 'Cable Crunch', 'core', 'Abs', 'cable', 'total', true, '${ownerId}'),
  ('e1900000-0000-0000-0000-000000000008', 'Dips', 'push', 'Chest', NULL, 'total', true, '${thirdId}');
INSERT INTO activities (id, user_id, date, type, duration, notes, structured_metrics) VALUES
  ('a1900000-0000-0000-0000-000000000001', '${ownerId}', '2026-10-21', 'gym', 60, 'bw-day', '{}'),
  ('a1900000-0000-0000-0000-000000000002', '${ownerId}', '2026-02-01', 'gym', 30, 'before-weigh-in', '{}'),
  ('a1900000-0000-0000-0000-000000000003', '${thirdId}', '2026-10-21', 'gym', 30, 'no-weigh-in', '{}');
INSERT INTO strength_sets (id, activity_id, exercise_id, set_number, reps, weight) VALUES
  ('51900000-0000-0000-0000-000000000001', 'a1900000-0000-0000-0000-000000000001', 'e1900000-0000-0000-0000-000000000001', 1, 6, 71.4),
  ('51900000-0000-0000-0000-000000000002', 'a1900000-0000-0000-0000-000000000001', 'e1900000-0000-0000-0000-000000000001', 2, 9, 86.4),
  ('51900000-0000-0000-0000-000000000003', 'a1900000-0000-0000-0000-000000000001', (SELECT id FROM exercises WHERE name = 'Plank' AND user_id IS NULL), 1, 70, 71.4),
  ('51900000-0000-0000-0000-000000000004', 'a1900000-0000-0000-0000-000000000001', 'e1900000-0000-0000-0000-000000000003', 1, 1, 60),
  ('51900000-0000-0000-0000-000000000005', 'a1900000-0000-0000-0000-000000000001', 'e1900000-0000-0000-0000-000000000004', 1, 15, NULL),
  ('51900000-0000-0000-0000-000000000006', 'a1900000-0000-0000-0000-000000000001', 'e1900000-0000-0000-0000-000000000006', 1, 10, 20),
  ('51900000-0000-0000-0000-000000000007', 'a1900000-0000-0000-0000-000000000002', 'e1900000-0000-0000-0000-000000000002', 1, 8, 70),
  ('51900000-0000-0000-0000-000000000008', 'a1900000-0000-0000-0000-000000000003', 'e1900000-0000-0000-0000-000000000008', 1, 8, 80);
SELECT upsert_workout_plan(
  '${ownerId}', '2026-10-21', 'Push', 'Before 019', NULL,
  jsonb_build_array(
    jsonb_build_object('position', 1, 'exercise_id', 'e1900000-0000-0000-0000-000000000001',
      'sets', jsonb_build_array(
        jsonb_build_object('set_number', 1, 'set_type', 'warmup', 'target_reps_min', 6, 'target_reps_max', 6, 'target_weight_kg', 71.4),
        jsonb_build_object('set_number', 2, 'set_type', 'top', 'target_reps_min', 9, 'target_reps_max', 10, 'target_weight_kg', 86.4),
        jsonb_build_object('set_number', 3, 'set_type', 'backoff', 'target_reps_min', 8, 'target_reps_max', 10, 'target_weight_kg', 78.9))),
    jsonb_build_object('position', 2, 'exercise_id', (SELECT id FROM exercises WHERE name = 'Plank' AND user_id IS NULL),
      'sets', jsonb_build_array(jsonb_build_object('set_number', 1, 'target_reps_min', 65, 'target_reps_max', 75, 'target_weight_kg', 71.4))),
    jsonb_build_object('position', 3, 'exercise_id', 'e1900000-0000-0000-0000-000000000004',
      'sets', jsonb_build_array(jsonb_build_object('set_number', 1, 'target_reps_min', 10, 'target_reps_max', 15))),
    jsonb_build_object('position', 4, 'exercise_id', 'e1900000-0000-0000-0000-000000000006',
      'sets', jsonb_build_array(jsonb_build_object('set_number', 1, 'target_reps_min', 10, 'target_reps_max', 12, 'target_weight_kg', 20)))
  )
);
-- A plan the session already started: 019 must leave it usable.
SELECT upsert_workout_plan(
  '${ownerId}', '2026-10-22', 'Pull', 'Started before 019', NULL,
  jsonb_build_array(
    jsonb_build_object('position', 1, 'exercise_id', 'e1900000-0000-0000-0000-000000000002',
      'sets', jsonb_build_array(jsonb_build_object('set_number', 1, 'target_reps_min', 5, 'target_reps_max', 8, 'target_weight_kg', 73.9)))
  )
);
SELECT start_workout_session('a1900000-0000-0000-0000-000000000004'::uuid, '2026-10-22'::date, 'gym', NULL, NULL, ARRAY[]::text[],
  (SELECT id FROM workout_plans WHERE plan_date = '2026-10-22' AND user_id = '${ownerId}'));
UPDATE test_snapshot SET
  activities = activities + 4,
  sets = sets + 8,
  volume = volume + (SELECT coalesce(sum(volume), 0) FROM strength_sets WHERE id::text LIKE '51900000-%'),
  exercises = exercises + 8;
DROP TABLE test_snapshot_018;
CREATE TABLE test_snapshot_018 AS
SELECT
  (SELECT md5(string_agg(concat_ws('|', id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics), ',' ORDER BY id)) FROM activities) AS activities,
  (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, set_number, reps, weight, rpe, volume, plan_set_id), ',' ORDER BY id)) FROM strength_sets) AS sets,
  (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, position, duration_minutes, calories, label), ',' ORDER BY id)) FROM cardio_entries) AS cardio,
  (SELECT md5(string_agg(concat_ws('|', id, name, category, primary_muscle, equipment, is_custom, user_id), ',' ORDER BY id)) FROM exercises) AS exercises;
CREATE TABLE test_snapshot_019 AS
SELECT
  (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, set_number, reps, weight, rpe, rest, tempo, plan_set_id, volume, created_at), ',' ORDER BY id)) FROM strength_sets) AS sets,
  (SELECT md5(string_agg(concat_ws('|', id, name, category, primary_muscle, secondary_muscles, equipment, is_custom, user_id, created_at), ',' ORDER BY id)) FROM exercises) AS exercises,
  (SELECT md5(string_agg(concat_ws('|', id, user_id, plan_date, day_type, title, notes, status, activity_id), ',' ORDER BY id)) FROM workout_plans) AS plans,
  (SELECT md5(string_agg(concat_ws('|', id, plan_id, position, exercise_id, superset_group, note), ',' ORDER BY id)) FROM plan_exercises) AS plan_exercises,
  (SELECT md5(string_agg(concat_ws('|', id, plan_exercise_id, set_number, set_type, target_rir_min, target_rir_max, rest_seconds, note), ',' ORDER BY id)) FROM plan_sets) AS plan_sets_untouched_cols,
  (SELECT md5(string_agg(concat_ws('|', id, user_id, date, weight), ',' ORDER BY id)) FROM body_metrics) AS body_metrics;
`;

// Original columns 019 must not touch. Plan targets are checked by rule in their own case.
const snapshot019 = `
SELECT
  (SELECT md5(string_agg(concat_ws('|', id, activity_id, exercise_id, set_number, reps, weight, rpe, rest, tempo, plan_set_id, volume, created_at), ',' ORDER BY id)) FROM strength_sets) = sets
  AND (SELECT md5(string_agg(concat_ws('|', id, name, category, primary_muscle, secondary_muscles, equipment, is_custom, user_id, created_at), ',' ORDER BY id)) FROM exercises) = exercises
  AND (SELECT md5(string_agg(concat_ws('|', id, user_id, plan_date, day_type, title, notes, status, activity_id), ',' ORDER BY id)) FROM workout_plans) = plans
  AND (SELECT md5(string_agg(concat_ws('|', id, plan_id, position, exercise_id, superset_group, note), ',' ORDER BY id)) FROM plan_exercises) = plan_exercises
  AND (SELECT md5(string_agg(concat_ws('|', id, plan_exercise_id, set_number, set_type, target_rir_min, target_rir_max, rest_seconds, note), ',' ORDER BY id)) FROM plan_sets) = plan_sets_untouched_cols
  AND (SELECT md5(string_agg(concat_ws('|', id, user_id, date, weight), ',' ORDER BY id)) FROM body_metrics) = body_metrics
FROM test_snapshot_019
`;

const splitChecksum019 = `
SELECT md5(coalesce(string_agg(concat_ws('|', id, added_weight_kg, bodyweight_kg, duration_sec), ',' ORDER BY id), ''))
  || md5(coalesce((SELECT string_agg(concat_ws('|', id, target_reps_min, target_reps_max, target_weight_kg, target_duration_sec_min, target_duration_sec_max), ',' ORDER BY id) FROM plan_sets), ''))
  || md5(coalesce((SELECT string_agg(concat_ws('|', id, load_type, measure), ',' ORDER BY id) FROM exercises), ''))
FROM strength_sets
`;

const rlsAuto = `
CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, anon, authenticated;
`;

try {
  execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${dbName}`], { stdio: 'inherit' });
  execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'postgres', '-c', `CREATE DATABASE ${dbName}`], { stdio: 'inherit' });

  psql(preamble);

  const files = readdirSync(join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  const before = files.filter(name => name < '013_');
  const after = files.filter(name => name >= '013_' && name < '018_');
  const at018 = files.filter(name => name >= '018_' && name < '019_');
  const from019 = files.filter(name => name >= '019_');
  const latest = files.filter(name => name >= '018_');
  for (const name of before) psqlFile(join(root, 'supabase/migrations', name));
  psql(seed);
  psql(rlsAuto);
  for (const name of after) psqlFile(join(root, 'supabase/migrations', name));
  // Data written by the 017 app and coach, so 018 has existing rows to flag and convert.
  psql(seed018);
  for (const name of at018) psqlFile(join(root, 'supabase/migrations', name));
  const after018 = psql(snapshot018);
  // Data written by the 018 app and coach: bodyweight sets logged as BW in the weight field,
  // plank seconds in reps, and plan targets that include body weight.
  psql(seed019);
  for (const name of from019) psqlFile(join(root, 'supabase/migrations', name));
  const after019Old = psql(snapshot018);
  const after019 = psql(snapshot019);
  const changes019 = psql(`SELECT md5(string_agg(concat_ws('|', table_name, row_id, kind, old), ',' ORDER BY table_name, row_id, kind)) FROM migration_019_changes`);
  const split019 = psql(splitChecksum019);
  for (const name of latest) psqlFile(join(root, 'supabase/migrations', name));
  const rerun018 = psql(snapshot018);
  const rerun019 = psql(snapshot019);
  const rerunChanges019 = psql(`SELECT md5(string_agg(concat_ws('|', table_name, row_id, kind, old), ',' ORDER BY table_name, row_id, kind)) FROM migration_019_changes`);
  const rerunSplit019 = psql(splitChecksum019);
  // Supabase grants table access to authenticated by default; RLS does the filtering.
  psql(`GRANT SELECT, INSERT, UPDATE, DELETE ON activities, strength_sets, cardio_entries TO authenticated`);

  record('existing activity count is unchanged', () => {
    const value = psql(`SELECT (SELECT count(*) FROM activities) = (SELECT activities FROM test_snapshot)`);
    assert(value === 't', value);
  });
  record('existing strength set count and volume sum are unchanged', () => {
    const value = psql(`SELECT (SELECT count(*) FROM strength_sets) = (SELECT sets FROM test_snapshot) AND (SELECT coalesce(sum(volume),0) FROM strength_sets) = (SELECT volume FROM test_snapshot)`);
    assert(value === 't', `volume or count changed: ${value}`);
  });
  record('existing cardio_metrics rows and calorie sum are unchanged', () => {
    const value = psql(`SELECT (SELECT count(*) FROM cardio_metrics) = (SELECT cardio_metrics FROM test_snapshot) AND (SELECT coalesce(sum(calories),0) FROM cardio_metrics) = (SELECT cardio_calories FROM test_snapshot)`);
    assert(value === 't', value);
  });
  record('existing gym notes are unchanged', () => {
    const value = psql(`SELECT notes FROM activities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'`);
    assert(value === 'keep-me', value);
  });
  record('cardio exercise exists and old cardio_metrics were copied', () => {
    const name = psql(`SELECT category FROM exercises WHERE user_id IS NULL AND lower(name) = 'cardio'`);
    assert(name === 'cardio', name);
    const copied = psql(`SELECT count(*) FROM cardio_entries WHERE activity_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' AND calories = 320 AND duration_minutes = 25`);
    assert(copied === '1', copied);
    const exerciseDelta = psql(`SELECT (SELECT count(*) FROM exercises) - (SELECT exercises FROM test_snapshot)`);
    assert(exerciseDelta === '1', `expected one new exercise, delta ${exerciseDelta}`);
  });
  record('activities type accepts cardio', () => {
    psql(`INSERT INTO activities (user_id, date, type) VALUES ('${ownerId}', '2026-03-01', 'cardio')`);
  });
  record('activities type accepts other', () => {
    psql(`INSERT INTO activities (user_id, date, type, notes) VALUES ('${ownerId}', '2026-03-02', 'other', 'free text')`);
  });
  record('activities type rejects junk', () => {
    let failed = false;
    try {
      psql(`INSERT INTO activities (user_id, date, type) VALUES ('${ownerId}', '2026-03-03', 'junk')`);
    } catch (error) {
      failed = /check constraint|activities_type_check/i.test(String(error));
      if (!failed) throw error;
    }
    assert(failed, 'junk insert was accepted');
  });
  record('save_workout writes activity, sets, and multiple cardio entries', () => {
    psql(`
      SELECT save_workout(
        '2026-04-01'::date, 'gym', NULL, 45, 'atomic', ARRAY[]::text[], '{}'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'exercise_id', (SELECT id::text FROM exercises WHERE name = 'Squat' AND user_id IS NULL LIMIT 1),
          'set_number', 1, 'reps', 5, 'weight', 80
        )),
        jsonb_build_array(
          jsonb_build_object('position', 1, 'duration_minutes', 10, 'calories', 90, 'label', 'Stair climber'),
          jsonb_build_object('position', 2, 'duration_minutes', 8, 'calories', 70, 'label', 'Treadmill incline walk')
        ),
        NULL
      )
    `);
    const counts = psql(`
      SELECT (SELECT count(*) FROM cardio_entries ce JOIN activities a ON a.id = ce.activity_id WHERE a.notes = 'atomic')
        || ',' ||
        (SELECT count(*) FROM strength_sets ss JOIN activities a ON a.id = ss.activity_id WHERE a.notes = 'atomic')
    `);
    assert(counts === '2,1', counts);
  });
  record('save_workout rolls back the activity when a set insert fails', () => {
    const beforeCount = psql(`SELECT count(*) FROM activities`);
    let failed = false;
    try {
      psql(`
        SELECT save_workout(
          '2026-04-02'::date, 'gym', NULL, 20, 'orphan', ARRAY[]::text[], '{}'::jsonb,
          jsonb_build_array(jsonb_build_object(
            'exercise_id', '99999999-9999-9999-9999-999999999999',
            'set_number', 1, 'reps', 5, 'weight', 40
          )),
          '[]'::jsonb,
          NULL
        )
      `);
    } catch (error) {
      failed = /foreign key|violates/i.test(String(error));
      if (!failed) throw error;
    }
    assert(failed, 'bad set insert did not fail');
    const afterCount = psql(`SELECT count(*) FROM activities`);
    const orphans = psql(`SELECT count(*) FROM activities WHERE notes = 'orphan'`);
    assert(beforeCount === afterCount && orphans === '0', `before ${beforeCount} after ${afterCount} orphans ${orphans}`);
  });
  record('anon cannot execute security definer functions', () => {
    const names = [
      'get_exercise_summaries()',
      'get_personal_records()',
      'get_training_load(integer)',
      'rls_auto_enable()',
      'save_workout(date,text,text,integer,text,text[],jsonb,jsonb,jsonb,jsonb,uuid)',
      'get_progress_cards()',
      'upsert_workout_plan(uuid,date,text,text,text,jsonb)',
      'start_workout_session(uuid,date,text,text,text,text[],uuid)',
      'finish_workout_session(uuid,integer,text,jsonb,uuid)',
      'discard_workout_session(uuid)',
      'bodyweight_on(uuid,date)',
    ];
    for (const name of names) {
      const allowed = psql(`SELECT has_function_privilege('anon', 'public.${name}', 'EXECUTE')`);
      assert(allowed === 'f', `${name} still executable by anon`);
    }
  });
  record('security definer functions pin search_path', () => {
    const missing = psql(`
      SELECT string_agg(p.proname, ',')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('get_exercise_summaries', 'get_personal_records', 'get_training_load', 'save_workout', 'get_progress_cards', 'upsert_workout_plan', 'start_workout_session', 'finish_workout_session', 'discard_workout_session', 'bodyweight_on')
        AND NOT ('search_path=public' = ANY (COALESCE(p.proconfig, ARRAY[]::text[])))
    `);
    assert(missing === '', missing || 'none');
  });
  record('rls policies call auth.uid() once via a scalar subquery', () => {
    const plain = psql(`
      SELECT coalesce(string_agg(policyname, ', '), '')
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\\.uid\\(\\)'
        AND (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\\.uid\\(\\)'
    `);
    assert(plain === '', plain);
  });
  record('authenticated reads only the session user rows', () => {
    psql(`GRANT SELECT ON activities TO authenticated`);
    psql(`UPDATE auth.uid_override SET id = '${otherId}'`);
    const hidden = psql(`BEGIN; SET LOCAL ROLE authenticated; SELECT count(*) FROM activities; ROLLBACK;`);
    psql(`UPDATE auth.uid_override SET id = '${ownerId}'`);
    const visible = psql(`BEGIN; SET LOCAL ROLE authenticated; SELECT count(*) FROM activities; ROLLBACK;`);
    assert(hidden === '0', `hidden ${hidden}`);
    assert(Number(visible) > 0, `visible ${visible}`);
  });
  record('get_progress_cards returns compact main-lift cards', () => {
    psql(`GRANT SELECT ON activities, strength_sets, exercises TO authenticated`);
    psql(`INSERT INTO auth.users (id) VALUES ('${otherId}') ON CONFLICT DO NOTHING`);
    psql(`
      INSERT INTO activities (id, user_id, date, type)
      SELECT ('bbbbbbbb-bbbb-bbbb-bbbb-' || lpad(g::text, 12, '0'))::uuid,
             '${ownerId}', DATE '2026-01-01' + g, 'gym'
      FROM generate_series(1, 12) AS g;
      INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
      SELECT ('bbbbbbbb-bbbb-bbbb-bbbb-' || lpad(g::text, 12, '0'))::uuid,
             (SELECT id FROM exercises WHERE name = 'Bench Press' AND user_id IS NULL LIMIT 1),
             s, 5, 40 + g
      FROM generate_series(1, 12) AS g
      CROSS JOIN generate_series(1, 4) AS s;
      INSERT INTO activities (id, user_id, date, type)
      VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '${otherId}', '2026-02-01', 'gym');
      INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
      SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc',
             (SELECT id FROM exercises WHERE name = 'Bench Press' AND user_id IS NULL LIMIT 1),
             1, 1, 250;
      INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
      SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
             (SELECT id FROM exercises WHERE name = 'Lateral Raise' AND user_id IS NULL LIMIT 1),
             9, 12, 10;
      WITH days AS (
        INSERT INTO activities (user_id, date, type)
        SELECT '${ownerId}', DATE '2024-01-01' + g, 'gym'
        FROM generate_series(0, 199) AS g
        RETURNING id
      )
      INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight)
      SELECT id,
             (SELECT id FROM exercises WHERE name = 'Squat' AND user_id IS NULL LIMIT 1),
             s, 5, 100
      FROM days
      CROSS JOIN generate_series(1, 6) AS s;
    `);
    const rawBytes = Number(psql(`
      SELECT octet_length(jsonb_agg(to_jsonb(ss) || jsonb_build_object('date', a.date))::text)
      FROM strength_sets ss
      JOIN activities a ON a.id = ss.activity_id
      WHERE a.user_id = '${ownerId}'
    `));
    const payload = psql(`BEGIN; SET LOCAL ROLE authenticated; SELECT get_progress_cards()::text; ROLLBACK;`);
    const cards = JSON.parse(payload);
    const bench = cards.find(card => card.exercise_name === 'Bench Press');
    assert(bench, 'bench card missing');
    assert(Number(bench.pr_weight) === 100, `pr ${bench.pr_weight}`);
    assert(Math.max(...bench.sparkline.map(point => Number(point.weight))) === 52, 'sparkline included the older heavier session');
    assert(bench.last_date === '2026-01-13', bench.last_date);
    assert(bench.last_sets.length === 4, `last sets ${bench.last_sets.length}`);
    assert(bench.sparkline.length === 8, `sparkline ${bench.sparkline.length}`);
    assert(bench.previous_max === 51, `previous ${bench.previous_max}`);
    assert(!cards.some(card => card.exercise_name === 'Lateral Raise'), 'non main lift included');
    assert(!payload.includes('250'), 'other user weight leaked');
    const cardBytes = Buffer.byteLength(payload);
    const rawText = psql(`
      SELECT jsonb_agg(to_jsonb(ss) || jsonb_build_object('date', a.date))::text
      FROM strength_sets ss
      JOIN activities a ON a.id = ss.activity_id
      WHERE a.user_id = '${ownerId}'
    `);
    console.log(`      progress payload ${cardBytes} bytes (${gzipSync(payload).length} gzip), raw owner sets ${rawBytes} bytes (${gzipSync(rawText).length} gzip)`);
    assert(cardBytes < rawBytes, `card payload ${cardBytes} is not smaller than raw ${rawBytes}`);
  });
  record('workout plan constraints and unique keys', () => {
    const bench = psql(`SELECT id FROM exercises WHERE user_id IS NULL AND name = 'Bench Press' LIMIT 1`);
    const planId = psql(`INSERT INTO workout_plans (user_id, plan_date, day_type) VALUES ('${ownerId}', '2026-10-20', 'Push') RETURNING id`);
    let uniqueDate = false;
    try {
      psql(`INSERT INTO workout_plans (user_id, plan_date, day_type) VALUES ('${ownerId}', '2026-10-20', 'Pull')`);
    } catch (error) {
      uniqueDate = /unique|workout_plans_user_date/i.test(String(error));
      if (!uniqueDate) throw error;
    }
    assert(uniqueDate, 'duplicate plan date was accepted');
    let badStatus = false;
    try {
      psql(`INSERT INTO workout_plans (user_id, plan_date, day_type, status) VALUES ('${ownerId}', '2026-10-21', 'Push', 'nope')`);
    } catch (error) {
      badStatus = /workout_plans_status_check|check constraint/i.test(String(error));
      if (!badStatus) throw error;
    }
    assert(badStatus, 'bad status was accepted');
    const exerciseId = psql(`INSERT INTO plan_exercises (plan_id, position, exercise_id) VALUES ('${planId}', 1, '${bench}') RETURNING id`);
    let uniquePosition = false;
    try {
      psql(`INSERT INTO plan_exercises (plan_id, position, exercise_id) VALUES ('${planId}', 1, '${bench}')`);
    } catch (error) {
      uniquePosition = /unique|plan_exercises_plan_position/i.test(String(error));
      if (!uniquePosition) throw error;
    }
    assert(uniquePosition, 'duplicate exercise position was accepted');
    psql(`INSERT INTO plan_sets (plan_exercise_id, set_number, set_type, target_reps_min, target_reps_max) VALUES ('${exerciseId}', 1, 'warmup', 8, 10)`);
    let uniqueSet = false;
    try {
      psql(`INSERT INTO plan_sets (plan_exercise_id, set_number, set_type, target_reps_min, target_reps_max) VALUES ('${exerciseId}', 1, 'top', 5, 5)`);
    } catch (error) {
      uniqueSet = /unique|plan_sets_exercise_number/i.test(String(error));
      if (!uniqueSet) throw error;
    }
    assert(uniqueSet, 'duplicate set number was accepted');
    let badReps = false;
    try {
      psql(`INSERT INTO plan_sets (plan_exercise_id, set_number, set_type, target_reps_min, target_reps_max) VALUES ('${exerciseId}', 2, 'straight', 10, 8)`);
    } catch (error) {
      badReps = /plan_sets_reps_check|check constraint/i.test(String(error));
      if (!badReps) throw error;
    }
    assert(badReps, 'reps min above max was accepted');
    let badType = false;
    try {
      psql(`INSERT INTO plan_sets (plan_exercise_id, set_number, set_type, target_reps_min, target_reps_max) VALUES ('${exerciseId}', 3, 'drop', 8, 8)`);
    } catch (error) {
      badType = /plan_sets_type_check|check constraint/i.test(String(error));
      if (!badType) throw error;
    }
    assert(badType, 'junk set type was accepted');
  });
  record('coach upsert replaces a planned workout and refuses a started one', () => {
    const bench = psql(`SELECT id FROM exercises WHERE user_id IS NULL AND name = 'Bench Press' LIMIT 1`);
    const squat = psql(`SELECT id FROM exercises WHERE user_id IS NULL AND name = 'Squat' LIMIT 1`);
    const planId = psql(`
      SELECT upsert_workout_plan(
        '${ownerId}', '2026-11-02', 'Push', 'First', 'notes',
        $json$[{"position":1,"exercise_id":"${bench}","sets":[{"set_number":1,"set_type":"warmup","target_reps_min":8,"target_reps_max":10,"target_weight_kg":40,"rest_seconds":60}]}] $json$::jsonb
      )
    `);
    const replaced = psql(`
      SELECT upsert_workout_plan(
        '${ownerId}', '2026-11-02', 'Push', 'Second', 'notes',
        $json$[{"position":1,"exercise_id":"${squat}","sets":[{"set_number":1,"set_type":"top","target_reps_min":5,"target_reps_max":5,"target_weight_kg":100}]}] $json$::jsonb
      )
    `);
    assert(replaced === planId, `ids ${planId} ${replaced}`);
    const names = psql(`SELECT string_agg(e.name, ',') FROM plan_exercises pe JOIN exercises e ON e.id = pe.exercise_id WHERE pe.plan_id = '${planId}'`);
    assert(names === 'Squat', names);
    psql(`UPDATE workout_plans SET status = 'in_progress' WHERE id = '${planId}'`);
    let refused = false;
    try {
      psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-02', 'Legs', 'Nope', NULL, '[]'::jsonb)`);
    } catch (error) {
      refused = /cannot be replaced/i.test(String(error));
      if (!refused) throw error;
    }
    assert(refused, 'in-progress plan was replaced');
    const still = psql(`SELECT title FROM workout_plans WHERE id = '${planId}'`);
    assert(still === 'Second', still);
    psql(`UPDATE workout_plans SET status = 'done' WHERE id = '${planId}'`);
    let doneRefused = false;
    try {
      psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-02', 'Legs', 'Later', NULL, '[]'::jsonb)`);
    } catch (error) {
      doneRefused = /cannot be replaced/i.test(String(error));
      if (!doneRefused) throw error;
    }
    assert(doneRefused, 'done plan was replaced');
  });
  record('another user and anon cannot read or edit workout plans', () => {
    psql(`INSERT INTO auth.users (id) VALUES ('${otherId}') ON CONFLICT DO NOTHING`);
    for (const table of ['workout_plans', 'plan_exercises', 'plan_sets', 'exercise_guidance']) {
      const allowed = psql(`SELECT has_table_privilege('anon', 'public.${table}', 'SELECT')`);
      assert(allowed === 'f', `${table} is visible to anon`);
    }
    psql(`UPDATE auth.uid_override SET id = '${otherId}'`);
    const visible = psql(`BEGIN; SET LOCAL ROLE authenticated; SELECT count(*) FROM workout_plans; ROLLBACK;`);
    const changed = psql(`BEGIN; SET LOCAL ROLE authenticated; WITH changed AS (UPDATE workout_plans SET title = 'Hacked' RETURNING id) SELECT count(*) FROM changed; ROLLBACK;`);
    psql(`UPDATE auth.uid_override SET id = '${ownerId}'`);
    const ownerVisible = psql(`BEGIN; SET LOCAL ROLE authenticated; SELECT count(*) FROM workout_plans; ROLLBACK;`);
    assert(visible === '0', `other user saw ${visible}`);
    assert(changed === '0', `other user edited ${changed}`);
    assert(Number(ownerVisible) > 0, `owner saw ${ownerVisible}`);
    const title = psql(`SELECT title FROM workout_plans WHERE plan_date = '2026-11-02'`);
    assert(title === 'Second', title);
  });
  record('save_workout links the plan and rolls back together', () => {
    psql(`
      SELECT upsert_workout_plan(
        '${ownerId}', '2026-11-03', 'Pull', 'Link', NULL,
        $json$[{"position":1,"exercise_id":"${psql(`SELECT id FROM exercises WHERE user_id IS NULL AND name = 'Barbell Row' LIMIT 1`)}","sets":[{"set_number":1,"set_type":"straight","target_reps_min":8,"target_reps_max":8,"target_weight_kg":60,"rest_seconds":90}]}] $json$::jsonb
      )
    `);
    const planId = psql(`SELECT id FROM workout_plans WHERE plan_date = '2026-11-03'`);
    const setId = psql(`SELECT ps.id FROM plan_sets ps JOIN plan_exercises pe ON pe.id = ps.plan_exercise_id WHERE pe.plan_id = '${planId}'`);
    const exerciseId = psql(`SELECT exercise_id FROM plan_exercises WHERE plan_id = '${planId}'`);
    psql(`UPDATE workout_plans SET status = 'in_progress' WHERE id = '${planId}'`);
    const before = psql(`SELECT count(*) FROM activities`);
    let failed = false;
    try {
      psql(`
        SELECT save_workout(
          '2026-11-03'::date, 'gym', NULL, 40, 'plan-fail', ARRAY[]::text[], '{}'::jsonb,
          jsonb_build_array(jsonb_build_object(
            'exercise_id', '${exerciseId}',
            'set_number', 1, 'reps', 8, 'weight', 60,
            'plan_set_id', '99999999-9999-9999-9999-999999999999'
          )),
          '[]'::jsonb, NULL, '${planId}'::uuid
        )
      `);
    } catch (error) {
      failed = /foreign key|violates|plan_set/i.test(String(error));
      if (!failed) throw error;
    }
    assert(failed, 'bad plan set did not fail');
    const after = psql(`SELECT count(*) FROM activities`);
    const status = psql(`SELECT status || ',' || COALESCE(activity_id::text, '') FROM workout_plans WHERE id = '${planId}'`);
    assert(before === after && status === 'in_progress,', `before ${before} after ${after} status ${status}`);
    const activityId = psql(`
      SELECT save_workout(
        '2026-11-03'::date, 'gym', NULL, 40, 'plan-ok', ARRAY[]::text[], '{}'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'exercise_id', '${exerciseId}',
          'set_number', 1, 'reps', 8, 'weight', 60, 'rpe', 8,
          'plan_set_id', '${setId}'
        )),
        '[]'::jsonb, NULL, '${planId}'::uuid
      )
    `);
    const linked = psql(`SELECT plan_set_id::text FROM strength_sets WHERE activity_id = '${activityId}'`);
    const done = psql(`SELECT status || ',' || activity_id::text FROM workout_plans WHERE id = '${planId}'`);
    assert(linked === setId, linked);
    assert(done === `done,${activityId}`, done);
  });
  record('018 leaves existing activities, sets, cardio and exercises byte-identical', () => {
    assert(after018 === 't', `checksum changed after 018: ${after018}`);
    const rerun = rerun018;
    assert(rerun === 't', `checksum changed after rerunning 018: ${rerun}`);
    const status = psql(`SELECT string_agg(DISTINCT status, ',') FROM activities WHERE id <> 'a1900000-0000-0000-0000-000000000004'`);
    assert(status === 'done', status);
  });
  record('load_type defaults to total and rejects junk', () => {
    const def = psql(`SELECT load_type FROM exercises WHERE name = 'Bench Press' AND user_id IS NULL`);
    assert(def === 'total', def);
    const fresh = psql(`INSERT INTO exercises (name, category, primary_muscle) VALUES ('Plain New', 'push', 'Chest') RETURNING load_type`);
    assert(fresh === 'total', fresh);
    let rejected = false;
    try {
      psql(`UPDATE exercises SET load_type = 'pair' WHERE name = 'Plain New'`);
    } catch (error) {
      rejected = /exercises_load_type_check/.test(String(error));
    }
    assert(rejected, 'junk load_type accepted');
    psql(`DELETE FROM exercises WHERE name = 'Plain New'`);
  });
  record('dumbbell exercises are flagged per_dumbbell, one-arm and cable ones are not', () => {
    const flagged = psql(`SELECT string_agg(name, ',' ORDER BY name) FROM exercises WHERE load_type = 'per_dumbbell'`);
    // Farmer Carry is seeded as per_dumbbell for 019, the way production has it.
    assert(flagged === 'Bulgarian Split Squat,Dumbbell Flye,Dumbbell Overhead Press,Farmer Carry,Hammer Curl,Incline Dummbell Press,Lateral Raise,Shoulder Dumbell Press', flagged);
  });
  record('existing dumbbell plan targets are halved exactly once', () => {
    const targets = psql(`
      SELECT string_agg(e.name || ':' || ps.target_weight_kg::numeric(6,2), ',' ORDER BY pe.position, ps.set_number)
      FROM workout_plans wp
      JOIN plan_exercises pe ON pe.plan_id = wp.id
      JOIN exercises e ON e.id = pe.exercise_id
      JOIN plan_sets ps ON ps.plan_exercise_id = pe.id
      WHERE wp.plan_date = '2026-09-20'
    `);
    assert(targets === 'Bench Press:80.00,Incline Dummbell Press:27.50,Incline Dummbell Press:22.50', targets);
    const logged = psql(`SELECT weight FROM strength_sets WHERE activity_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'`);
    assert(Number(logged) === 55, `logged weight changed to ${logged}`);
  });
  record('upsert_workout_plan stores cardio targets and still accepts the old payload', () => {
    const cardioId = psql(`SELECT id FROM exercises WHERE user_id IS NULL AND lower(name) = 'cardio'`);
    const benchId = psql(`SELECT id FROM exercises WHERE user_id IS NULL AND name = 'Bench Press'`);
    psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-10', 'Push', 'With cardio', NULL, $json$[
      {"position":1,"exercise_id":"${benchId}","sets":[{"set_number":1,"set_type":"top","target_reps_min":5,"target_reps_max":5,"target_weight_kg":80,"rest_seconds":120}]},
      {"position":2,"exercise_id":"${cardioId}","note":"Treadmill incline walk","target_duration_min":20,"target_incline_pct":10,"target_speed_kmh":5.5,"target_kcal":180,"sets":[]}
    ]$json$::jsonb)`);
    const cardio = psql(`
      SELECT concat_ws('|', pe.note, pe.target_duration_min, pe.target_incline_pct, pe.target_speed_kmh, pe.target_kcal, (SELECT count(*) FROM plan_sets WHERE plan_exercise_id = pe.id))
      FROM plan_exercises pe JOIN workout_plans wp ON wp.id = pe.plan_id
      WHERE wp.plan_date = '2026-11-10' AND pe.exercise_id = '${cardioId}'
    `);
    assert(cardio === 'Treadmill incline walk|20.0|10.0|5.5|180|0', cardio);
    psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-11', 'Push', 'Old shape', NULL, $json$[
      {"position":1,"exercise_id":"${benchId}","superset_group":"","note":"","sets":[{"set_number":1,"target_reps_min":5,"target_reps_max":5,"target_weight_kg":80}]}
    ]$json$::jsonb)`);
    const old = psql(`
      SELECT concat_ws('|', coalesce(pe.target_duration_min::text, 'null'), coalesce(pe.target_kcal::text, 'null'), ps.set_type)
      FROM plan_exercises pe JOIN workout_plans wp ON wp.id = pe.plan_id JOIN plan_sets ps ON ps.plan_exercise_id = pe.id
      WHERE wp.plan_date = '2026-11-11'
    `);
    assert(old === 'null|null|straight', old);
    let rejected = false;
    try {
      psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-12', 'Push', 'Bad', NULL, $json$[{"position":1,"exercise_id":"${cardioId}","target_duration_min":-5,"sets":[]}]$json$::jsonb)`);
    } catch (error) {
      rejected = /plan_exercises_cardio_targets_check/.test(String(error));
    }
    assert(rejected, 'negative cardio duration accepted');
  });
  record('plan session start, set writes and finish are idempotent', () => {
    const planId = psql(`SELECT id FROM workout_plans WHERE plan_date = '2026-11-10'`);
    const planSet = psql(`SELECT ps.id FROM plan_sets ps JOIN plan_exercises pe ON pe.id = ps.plan_exercise_id WHERE pe.plan_id = '${planId}'`);
    const cardioItem = psql(`SELECT pe.id FROM plan_exercises pe WHERE pe.plan_id = '${planId}' AND pe.target_kcal IS NOT NULL`);
    const benchId = psql(`SELECT id FROM exercises WHERE user_id IS NULL AND name = 'Bench Press'`);
    const cardioId = psql(`SELECT id FROM exercises WHERE user_id IS NULL AND lower(name) = 'cardio'`);
    const run = sql => psql(`BEGIN; SET LOCAL ROLE authenticated; ${sql}; COMMIT;`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      run(`SELECT start_workout_session('${planId}', '2026-11-10', 'gym', NULL, NULL, '{}', '${planId}')`);
    }
    const started = psql(`SELECT a.status || ',' || wp.status || ',' || wp.activity_id FROM activities a JOIN workout_plans wp ON wp.activity_id = a.id WHERE a.id = '${planId}'`);
    assert(started === `in_progress,in_progress,${planId}`, started);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      run(`INSERT INTO strength_sets (id, activity_id, exercise_id, set_number, reps, weight, plan_set_id)
           VALUES ('5e700000-0000-0000-0000-000000000001', '${planId}', '${benchId}', 1, 5, 80, '${planSet}')
           ON CONFLICT (id) DO UPDATE SET reps = EXCLUDED.reps, weight = EXCLUDED.weight`);
      run(`INSERT INTO cardio_entries (id, activity_id, exercise_id, position, duration_minutes, calories, label, plan_exercise_id)
           VALUES ('ca700000-0000-0000-0000-000000000001', '${planId}', '${cardioId}', 1, 20, 180, 'Treadmill incline walk', '${cardioItem}')
           ON CONFLICT (id) DO UPDATE SET calories = EXCLUDED.calories`);
    }
    let duplicate = false;
    try {
      run(`INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, weight, plan_set_id) VALUES ('${planId}', '${benchId}', 2, 5, 80, '${planSet}')`);
    } catch (error) {
      duplicate = /strength_sets_activity_plan_set/.test(String(error));
    }
    assert(duplicate, 'second row for the same plan set was accepted');
    let duplicateCardio = false;
    try {
      run(`INSERT INTO cardio_entries (activity_id, exercise_id, position, duration_minutes, plan_exercise_id) VALUES ('${planId}', '${cardioId}', 2, 10, '${cardioItem}')`);
    } catch (error) {
      duplicateCardio = /cardio_entries_activity_plan_exercise/.test(String(error));
    }
    assert(duplicateCardio, 'second cardio row for the same plan item was accepted');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      run(`SELECT finish_workout_session('${planId}', 45, NULL, '{"calorieEstimate":{"calories":380}}'::jsonb, '${planId}')`);
    }
    const done = psql(`
      SELECT concat_ws('|', a.status, a.duration, a.structured_metrics->'calorieEstimate'->>'calories', wp.status,
        (SELECT count(*) FROM strength_sets WHERE activity_id = a.id), (SELECT count(*) FROM cardio_entries WHERE activity_id = a.id))
      FROM activities a JOIN workout_plans wp ON wp.activity_id = a.id WHERE a.id = '${planId}'
    `);
    assert(done === 'done|45|380|done|1|1', done);
    let restart = false;
    try {
      run(`SELECT start_workout_session(gen_random_uuid(), '2026-11-10', 'gym', NULL, NULL, '{}', '${planId}')`);
    } catch (error) {
      restart = /cannot be started/.test(String(error));
    }
    assert(restart, 'a done plan was started again');
    const stillDone = psql(`SELECT status FROM workout_plans WHERE id = '${planId}'`);
    assert(stillDone === 'done', stillDone);
  });
  record('discarding an unfinished session returns its plan, keeps finished ones', () => {
    const planId = psql(`SELECT id FROM workout_plans WHERE plan_date = '2026-11-11'`);
    const run = sql => psql(`BEGIN; SET LOCAL ROLE authenticated; ${sql}; COMMIT;`);
    run(`SELECT start_workout_session('${planId}', '2026-11-11', 'gym', NULL, NULL, '{}', '${planId}')`);
    run(`SELECT discard_workout_session('${planId}')`);
    run(`SELECT discard_workout_session('${planId}')`);
    const back = psql(`SELECT status || ',' || coalesce(activity_id::text, '') || ',' || (SELECT count(*) FROM activities WHERE id = '${planId}') FROM workout_plans WHERE id = '${planId}'`);
    assert(back === 'planned,,0', back);
    run(`SELECT discard_workout_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')`);
    const kept = psql(`SELECT count(*) FROM activities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'`);
    assert(kept === '1', 'a finished workout was discarded');
  });
  record('another user cannot start, finish or discard the owner session', () => {
    const run = sql => psql(`BEGIN; SET LOCAL ROLE authenticated; ${sql}; COMMIT;`);
    run(`SELECT start_workout_session('5e550000-0000-0000-0000-000000000001', '2026-11-12', 'gym')`);
    psql(`INSERT INTO auth.users (id) VALUES ('${otherId}') ON CONFLICT DO NOTHING`);
    psql(`UPDATE auth.uid_override SET id = '${otherId}'`);
    let finishRefused = false;
    try {
      run(`SELECT finish_workout_session('5e550000-0000-0000-0000-000000000001', 10)`);
    } catch (error) {
      finishRefused = /not found/.test(String(error));
    }
    run(`SELECT discard_workout_session('5e550000-0000-0000-0000-000000000001')`);
    psql(`UPDATE auth.uid_override SET id = '${ownerId}'`);
    const owner = psql(`SELECT status || ',' || user_id FROM activities WHERE id = '5e550000-0000-0000-0000-000000000001'`);
    assert(finishRefused, 'other user finished the session');
    assert(owner === `in_progress,${ownerId}`, owner);
    run(`SELECT discard_workout_session('5e550000-0000-0000-0000-000000000001')`);
  });
  record('exercise guidance seed rows are valid', () => {
    const seeded = psql(`
      SELECT count(*) FROM exercise_guidance g
      JOIN exercises e ON e.id = g.exercise_id
      WHERE e.user_id IS NULL
        AND COALESCE(g.setup, '') <> ''
        AND COALESCE(g.movement, '') <> ''
        AND COALESCE(g.common_mistakes, '') <> ''
        AND COALESCE(g.source, '') <> ''
        AND g.license IN ('Unlicense', 'original')
    `);
    assert(Number(seeded) >= 24, seeded);
    const images = psql(`
      SELECT array_length(g.image_urls, 1)
      FROM exercise_guidance g
      JOIN exercises e ON e.id = g.exercise_id
      WHERE e.user_id IS NULL AND e.name = 'Bench Press'
    `);
    assert(images === '2', images);
    const licence = psql(`
      SELECT g.license || ' ' || g.image_urls[1]
      FROM exercise_guidance g
      JOIN exercises e ON e.id = g.exercise_id
      WHERE e.name = 'Bench Press' AND e.user_id IS NULL
    `);
    assert(licence.startsWith('Unlicense https://raw.githubusercontent.com/yuhonas/free-exercise-db/'), licence);
  });
  const planTargets = date => psql(`
    SELECT string_agg(concat_ws(':', e.name, coalesce(ps.target_reps_min::text, '-'), coalesce(ps.target_reps_max::text, '-'),
      coalesce(ps.target_weight_kg::numeric(6,2)::text, 'BW'), coalesce(ps.target_duration_sec_min::text, '-'), coalesce(ps.target_duration_sec_max::text, '-')), ','
      ORDER BY pe.position, ps.set_number)
    FROM workout_plans wp
    JOIN plan_exercises pe ON pe.plan_id = wp.id
    JOIN exercises e ON e.id = pe.exercise_id
    JOIN plan_sets ps ON ps.plan_exercise_id = pe.id
    WHERE wp.plan_date = '${date}' AND wp.user_id = '${ownerId}'
  `);
  record('019 leaves original set, exercise, plan and body metric columns byte-identical', () => {
    assert(after019 === 't', `checksum changed after 019: ${after019}`);
    assert(after019Old === 't', `018 checksum changed after 019: ${after019Old}`);
    assert(rerun019 === 't', `checksum changed after rerunning 019: ${rerun019}`);
    assert(split019 === rerunSplit019, 'rerun changed the new columns or flags');
    assert(changes019 === rerunChanges019, 'rerun changed the reversal record');
  });
  record('load_type accepts bodyweight, measure defaults to reps and rejects junk', () => {
    const fresh = psql(`INSERT INTO exercises (name, category, primary_muscle) VALUES ('Plain 019', 'push', 'Chest') RETURNING load_type || ',' || measure`);
    assert(fresh === 'total,reps', fresh);
    psql(`UPDATE exercises SET load_type = 'bodyweight', measure = 'time' WHERE name = 'Plain 019'`);
    let rejected = false;
    try {
      psql(`UPDATE exercises SET measure = 'distance' WHERE name = 'Plain 019'`);
    } catch (error) {
      rejected = /exercises_measure_check/.test(String(error));
    }
    assert(rejected, 'junk measure accepted');
    psql(`DELETE FROM exercises WHERE name = 'Plain 019'`);
  });
  record('bodyweight exercises are flagged; loaded, cable and dumbbell ones are not', () => {
    const flagged = psql(`SELECT string_agg(name || CASE WHEN is_custom THEN '(C)' ELSE '(G)' END, ',' ORDER BY name, is_custom) FROM exercises WHERE load_type = 'bodyweight'`);
    assert(flagged === 'Ab Wheel Rollout(G),Chin Up(C),Dips(C),Dips(C),Glute Bridge(C),Hanging Leg Raise(C),Plank(G),Pull-up(G),Push-up(G)', flagged);
    const kept = psql(`SELECT string_agg(name || ':' || load_type, ',' ORDER BY name) FROM exercises WHERE name IN ('Lunges', 'Cable Crunch', 'Farmer Carry', 'Bench Press') AND (is_custom OR name = 'Bench Press')`);
    assert(kept === 'Bench Press:total,Cable Crunch:total,Farmer Carry:per_dumbbell,Lunges:total', kept);
  });
  record('timed exercises are flagged, farmer carry stays per dumbbell', () => {
    const timed = psql(`SELECT string_agg(name || ':' || load_type, ',' ORDER BY name) FROM exercises WHERE measure = 'time'`);
    assert(timed === 'Farmer Carry:per_dumbbell,Plank:bodyweight', timed);
  });
  record('past bodyweight and timed sets get the split in new columns only', () => {
    const rows = psql(`
      SELECT string_agg(concat_ws(':', right(id::text, 1), weight, coalesce(bodyweight_kg::text, '-'), coalesce(added_weight_kg::text, '-'), coalesce(duration_sec::text, '-'), coalesce(reps::text, '-')), ',' ORDER BY id)
      FROM strength_sets WHERE id::text LIKE '51900000-%'
    `);
    assert(rows === '1:71.40:71.40:0.00:-:6,2:86.40:71.40:15.00:-:9,3:71.40:71.40:0.00:70:70,4:60.00:-:-:-:1,5:71.40:0.00:-:15,6:20.00:-:-:-:10,7:70.00:70.75:0.00:-:8,8:80.00:-:-:-:8', rows);
    const totalLoad = psql(`SELECT weight FROM strength_sets WHERE id = '51900000-0000-0000-0000-000000000002'`);
    assert(Number(totalLoad) === 86.4, `total load changed: ${totalLoad}`);
  });
  record('bodyweight plan targets become the added load, timed targets become seconds', () => {
    const targets = planTargets('2026-10-21');
    assert(targets === 'Dips:6:6:BW:-:-,Dips:9:10:15.00:-:-,Dips:8:10:7.50:-:-,Plank:-:-:BW:65:75,Hanging Leg Raise:10:15:BW:-:-,Lunges:10:12:20.00:-:-', targets);
    const started = planTargets('2026-10-22');
    assert(started === 'Chin Up:5:8:2.50:-:-', started);
    const record = psql(`SELECT count(*) || ':' || count(*) FILTER (WHERE kind = 'added_weight') || ':' || count(*) FILTER (WHERE kind = 'duration_from_reps') FROM migration_019_changes WHERE table_name = 'plan_sets'`);
    assert(record === '6:5:1', record);
  });
  record('019 data steps reverse from the change record', () => {
    const before019 = psql(`
      SELECT string_agg(concat_ws('|', ps.id, coalesce((c.old->>'target_reps_min')::int, ps.target_reps_min), coalesce((c.old->>'target_reps_max')::int, ps.target_reps_max),
        CASE WHEN c.old ? 'target_weight_kg' THEN (c.old->>'target_weight_kg')::numeric ELSE ps.target_weight_kg END), ',' ORDER BY ps.id)
      FROM plan_sets ps
      LEFT JOIN (SELECT row_id, jsonb_object_agg(k, v) AS old FROM migration_019_changes, jsonb_each(old) AS j(k, v) WHERE table_name = 'plan_sets' AND k <> 'bodyweight_kg' GROUP BY row_id) c ON c.row_id = ps.id
    `);
    const reversed = psql(`
      BEGIN;
      UPDATE strength_sets s SET added_weight_kg = NULL, bodyweight_kg = NULL, duration_sec = NULL
        FROM migration_019_changes c WHERE c.table_name = 'strength_sets' AND c.row_id = s.id;
      UPDATE plan_sets p SET target_weight_kg = (c.old->>'target_weight_kg')::numeric
        FROM migration_019_changes c WHERE c.table_name = 'plan_sets' AND c.kind = 'added_weight' AND c.row_id = p.id;
      UPDATE plan_sets p SET target_reps_min = (c.old->>'target_reps_min')::int, target_reps_max = (c.old->>'target_reps_max')::int,
          target_duration_sec_min = NULL, target_duration_sec_max = NULL
        FROM migration_019_changes c WHERE c.table_name = 'plan_sets' AND c.kind = 'duration_from_reps' AND c.row_id = p.id;
      UPDATE exercises e SET load_type = c.old->>'load_type'
        FROM migration_019_changes c WHERE c.table_name = 'exercises' AND c.kind = 'bodyweight_flag' AND c.row_id = e.id;
      SELECT (SELECT count(*) FROM strength_sets WHERE added_weight_kg IS NOT NULL OR bodyweight_kg IS NOT NULL OR duration_sec IS NOT NULL)
        + (SELECT count(*) FROM exercises WHERE load_type = 'bodyweight')
        || ';' || (SELECT string_agg(concat_ws('|', id, target_reps_min, target_reps_max, target_weight_kg), ',' ORDER BY id) FROM plan_sets);
      ROLLBACK;
    `);
    assert(reversed === `0;${before019}`, `${reversed} vs ${before019}`);
    const still = planTargets('2026-10-21');
    assert(still.includes('Dips:9:10:15.00'), 'rollback did not keep the migrated values');
  });
  record('upsert_workout_plan takes v3 bodyweight and timed sets and still reads old payloads', () => {
    const plank = psql(`SELECT id FROM exercises WHERE name = 'Plank' AND user_id IS NULL`);
    psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-20', 'Pull', 'v3', NULL, $json$[
      {"position":1,"exercise_id":"e1900000-0000-0000-0000-000000000001","sets":[
        {"set_number":1,"set_type":"top","target_reps_min":6,"target_reps_max":8,"target_weight_kg":15},
        {"set_number":2,"target_reps_min":8,"target_reps_max":10}]},
      {"position":2,"exercise_id":"${plank}","sets":[{"set_number":1,"target_duration_sec_min":45,"target_duration_sec_max":60}]},
      {"position":3,"exercise_id":"e1900000-0000-0000-0000-000000000003","sets":[{"set_number":1,"target_duration_sec_min":40,"target_duration_sec_max":40,"target_weight_kg":24}]}
    ]$json$::jsonb)`);
    const v3 = planTargets('2026-11-20');
    assert(v3 === 'Dips:6:8:15.00:-:-,Dips:8:10:BW:-:-,Plank:-:-:BW:45:60,Farmer Carry:-:-:24.00:40:40', v3);
    psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-21', 'Core', 'v2 shape', NULL, $json$[
      {"position":1,"exercise_id":"${plank}","sets":[{"set_number":1,"target_reps_min":65,"target_reps_max":75}]},
      {"position":2,"exercise_id":"e1900000-0000-0000-0000-000000000003","sets":[{"set_number":1,"target_reps_min":1,"target_reps_max":1,"target_weight_kg":24}]},
      {"position":3,"exercise_id":"e1900000-0000-0000-0000-000000000001","sets":[
        {"set_number":1,"target_reps_min":6,"target_reps_max":8,"target_weight_kg":86.4},
        {"set_number":2,"target_reps_min":8,"target_reps_max":10,"target_weight_kg":71.4},
        {"set_number":3,"target_reps_min":8,"target_reps_max":10,"target_weight_kg":10}]}
    ]$json$::jsonb)`);
    const v2 = planTargets('2026-11-21');
    // v2 sent body weight + added for bodyweight exercises; at or above body weight it is read as a total.
    assert(v2 === 'Plank:-:-:BW:65:75,Farmer Carry:1:1:24.00:-:-,Dips:6:8:15.00:-:-,Dips:8:10:BW:-:-,Dips:8:10:10.00:-:-', v2);
    let rejected = false;
    try {
      psql(`SELECT upsert_workout_plan('${ownerId}', '2026-11-22', 'Core', 'Bad', NULL, $json$[{"position":1,"exercise_id":"${plank}","sets":[{"set_number":1}]}]$json$::jsonb)`);
    } catch (error) {
      rejected = /plan_sets_target_measure_check/.test(String(error));
    }
    assert(rejected, 'a set with neither reps nor seconds was accepted');
    let refused = false;
    try {
      psql(`SELECT upsert_workout_plan('${ownerId}', '2026-10-22', 'Pull', 'Overwrite started', NULL, '[]'::jsonb)`);
    } catch (error) {
      refused = /cannot be replaced/.test(String(error));
    }
    assert(refused, 'started plan was replaced');
  });
  record('save_workout keeps the old payload and stores the v3 set keys', () => {
    const plank = psql(`SELECT id FROM exercises WHERE name = 'Plank' AND user_id IS NULL`);
    psql(`SELECT save_workout('2026-11-23'::date, 'gym', NULL, 30, 'old-payload-019', ARRAY[]::text[], '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('exercise_id', 'e1900000-0000-0000-0000-000000000001', 'set_number', 1, 'reps', 8, 'weight', 86.4)),
      '[]'::jsonb, NULL)`);
    const old = psql(`SELECT concat_ws(':', s.reps, s.weight, coalesce(s.added_weight_kg::text, '-'), s.volume) FROM strength_sets s JOIN activities a ON a.id = s.activity_id WHERE a.notes = 'old-payload-019'`);
    assert(old === '8:86.40:-:691.20', old);
    psql(`SELECT save_workout('2026-11-24'::date, 'gym', NULL, 30, 'v3-payload', ARRAY[]::text[], '{}'::jsonb,
      jsonb_build_array(
        jsonb_build_object('exercise_id', 'e1900000-0000-0000-0000-000000000001', 'set_number', 1, 'reps', 8, 'weight', 86.4, 'added_weight_kg', 15, 'bodyweight_kg', 71.4),
        jsonb_build_object('exercise_id', '${plank}', 'set_number', 1, 'reps', NULL, 'weight', 71.4, 'added_weight_kg', 0, 'bodyweight_kg', 71.4, 'duration_sec', 60)),
      '[]'::jsonb, NULL)`);
    const v3 = psql(`SELECT string_agg(concat_ws(':', coalesce(s.reps::text, '-'), s.weight, s.added_weight_kg, s.bodyweight_kg, coalesce(s.duration_sec::text, '-'), s.volume), ',' ORDER BY s.duration_sec NULLS FIRST) FROM strength_sets s JOIN activities a ON a.id = s.activity_id WHERE a.notes = 'v3-payload'`);
    assert(v3 === '8:86.40:15.00:71.40:-:691.20,-:71.40:0.00:71.40:60:0.00', v3);
    let rejected = false;
    try {
      psql(`INSERT INTO strength_sets (activity_id, exercise_id, set_number, reps, duration_sec) SELECT id, '${plank}', 9, NULL, -5 FROM activities WHERE notes = 'v3-payload'`);
    } catch (error) {
      rejected = /strength_sets_load_split_check/.test(String(error));
    }
    assert(rejected, 'negative duration accepted');
  });
  record('a session started before 019 logs v3 sets and finishes', () => {
    const planId = psql(`SELECT id FROM workout_plans WHERE plan_date = '2026-10-22' AND user_id = '${ownerId}'`);
    const planSet = psql(`SELECT ps.id FROM plan_sets ps JOIN plan_exercises pe ON pe.id = ps.plan_exercise_id WHERE pe.plan_id = '${planId}'`);
    const row = `('51900000-0000-0000-0000-0000000000a1', 'a1900000-0000-0000-0000-000000000004', 'e1900000-0000-0000-0000-000000000002', 1, 6, 73.9, '${planSet}', 2.5, 71.4)`;
    const upsert = `BEGIN; SET LOCAL ROLE authenticated;
      INSERT INTO strength_sets (id, activity_id, exercise_id, set_number, reps, weight, plan_set_id, added_weight_kg, bodyweight_kg) VALUES ${row}
      ON CONFLICT (id) DO UPDATE SET reps = EXCLUDED.reps, weight = EXCLUDED.weight, added_weight_kg = EXCLUDED.added_weight_kg, bodyweight_kg = EXCLUDED.bodyweight_kg;
      COMMIT;`;
    psql(upsert);
    psql(upsert);
    psql(`SELECT finish_workout_session('a1900000-0000-0000-0000-000000000004'::uuid, 45, NULL, NULL, '${planId}'::uuid)`);
    const state = psql(`SELECT (SELECT status FROM activities WHERE id = 'a1900000-0000-0000-0000-000000000004') || ':' || (SELECT status FROM workout_plans WHERE id = '${planId}') || ':' || (SELECT count(*) || '/' || max(added_weight_kg) FROM strength_sets WHERE activity_id = 'a1900000-0000-0000-0000-000000000004')`);
    assert(state === 'done:done:1/2.50', state);
  });
  record('the 019 change record is closed to the API', () => {
    for (const role of ['anon', 'authenticated']) {
      const allowed = psql(`SELECT has_table_privilege('${role}', 'public.migration_019_changes', 'SELECT')`);
      assert(allowed === 'f', `${role} can read migration_019_changes`);
    }
    const rls = psql(`SELECT relrowsecurity FROM pg_class WHERE relname = 'migration_019_changes'`);
    assert(rls === 't', rls);
  });
} finally {
  try {
    execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`], { stdio: 'ignore' });
  } catch {
    // The database is already gone, or the cluster rejected FORCE on this build.
  }
}

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} migration cases passed`);
if (!results.length) {
  console.error('No migration cases ran');
  process.exit(1);
}
process.exit(failed.length ? 1 : 0);
