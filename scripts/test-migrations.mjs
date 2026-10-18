#!/usr/bin/env node
// Applies supabase/migrations to a throwaway local database and prints pass/fail per case.
// Never connects to the hosted Supabase project.

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
      'save_workout(date,text,text,integer,text,text[],jsonb,jsonb,jsonb,jsonb)',
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
        AND p.proname IN ('get_exercise_summaries', 'get_personal_records', 'get_training_load', 'save_workout')
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
