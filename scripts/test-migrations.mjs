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
  const after = files.filter(name => name >= '013_');
  for (const name of before) psqlFile(join(root, 'supabase/migrations', name));
  psql(seed);
  psql(rlsAuto);
  for (const name of after) psqlFile(join(root, 'supabase/migrations', name));

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
        AND p.proname IN ('get_exercise_summaries', 'get_personal_records', 'get_training_load', 'save_workout', 'get_progress_cards', 'upsert_workout_plan')
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
