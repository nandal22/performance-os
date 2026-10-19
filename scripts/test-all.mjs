#!/usr/bin/env node
// One command for the migration cases and the frontend cases.

import { spawnSync } from 'node:child_process';

function run(title, command, args) {
  console.log(`\n== ${title} ==`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  return result.status === 0;
}

const migrations = run('Database migrations', 'node', ['scripts/test-migrations.mjs']);
const frontend = run('Frontend', 'npx', ['vitest', 'run']);
const safeArea = run('Safe area', 'node', ['scripts/test-safe-area.mjs']);

console.log('\n== Summary ==');
console.log(`${migrations ? 'PASS' : 'FAIL'}  database migrations`);
console.log(`${frontend ? 'PASS' : 'FAIL'}  frontend`);
console.log(`${safeArea ? 'PASS' : 'FAIL'}  safe area`);
process.exit(migrations && frontend && safeArea ? 0 : 1);
