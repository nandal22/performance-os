import { beforeEach, describe, expect, it } from 'vitest';
import { createSyncQueue } from './syncQueue';
import { createSessionStore, globalSetNumber, setRow, type SessionSet } from './workoutSession';
import { createFakeSessionServer } from '@/test/fakeSessionServer';

const bench = (id: string, set_number: number, reps = 5): SessionSet => ({
  id, exercise_id: 'bench', exercise_name: 'Bench Press', set_number, reps, weight: 80, rpe: null, plan_set_id: null,
});

beforeEach(() => localStorage.clear());

describe('workout session store', () => {
  it('persists every set, then resumes the same session after a reload', async () => {
    const server = createFakeSessionServer();
    const queue = createSyncQueue({ execute: server.execute });
    const store = createSessionStore(queue);
    let session = store.begin({ planId: null, type: 'gym', date: '2026-10-19' });
    session = store.saveSet(session, bench('s1', 1));
    session = store.saveSet(session, bench('s2', 2));
    await queue.flush();
    expect(server.state.sets.size).toBe(2);

    const reloadedQueue = createSyncQueue({ execute: server.execute });
    const reloaded = createSessionStore(reloadedQueue).read(null);
    expect(reloaded?.activityId).toBe(session.activityId);
    expect(reloaded?.sets.map(set => set.id)).toEqual(['s1', 's2']);
  });

  it('edits and deletes a logged set in place', async () => {
    const server = createFakeSessionServer();
    const queue = createSyncQueue({ execute: server.execute });
    const store = createSessionStore(queue);
    let session = store.begin({ planId: null, type: 'gym', date: '2026-10-19' });
    session = store.saveSet(session, bench('s1', 1));
    session = store.saveSet(session, bench('s2', 2));
    session = store.saveSet(session, bench('s1', 1, 7));
    store.deleteSet(session, 's2');
    await queue.flush();
    expect([...server.state.sets.values()].map(set => [set.id, set.reps])).toEqual([['s1', 7]]);
    expect(store.read(null)?.sets.map(set => set.reps)).toEqual([7]);
  });

  it('finishing renumbers the remaining sets, closes the session, and clears the local copy', async () => {
    const server = createFakeSessionServer();
    const queue = createSyncQueue({ execute: server.execute });
    const store = createSessionStore(queue);
    let session = store.begin({ planId: null, type: 'gym', date: '2026-10-19' });
    session = store.saveSet(session, bench('s1', 1));
    session = store.saveSet(session, bench('s2', 2));
    session = store.saveSet(session, bench('s3', 3));
    session = store.deleteSet(session, 's2');
    store.finish(session, { duration: 45, notes: null, structuredMetrics: { calorieEstimate: { calories: 210 } }, numberSet: globalSetNumber });
    await queue.flush();
    expect(server.state.sets.get('s3')?.set_number).toBe(2);
    expect(server.state.activities.get(session.activityId)?.status).toBe('done');
    expect(server.state.activities.get(session.activityId)?.structured_metrics).toEqual({ calorieEstimate: { calories: 210 } });
    expect(store.read(null)).toBeNull();
  });
});

describe('set rows for bodyweight and timed sets', () => {
  const session = { activityId: 'a1' } as Parameters<typeof setRow>[0];

  it('keeps the old row shape for a set without the new fields', () => {
    expect(Object.keys(setRow(session, bench('s1', 1))).sort()).toEqual(
      ['activity_id', 'exercise_id', 'id', 'plan_set_id', 'reps', 'rpe', 'set_number', 'weight'],
    );
  });

  it('sends the bodyweight split and seconds when the set has them', () => {
    expect(setRow(session, { ...bench('s2', 1, 8), weight: 86.4, added_weight_kg: 15, bodyweight_kg: 71.4 }))
      .toMatchObject({ reps: 8, weight: 86.4, added_weight_kg: 15, bodyweight_kg: 71.4 });
    const hold = setRow(session, { ...bench('s3', 1), reps: null, weight: 48, duration_sec: 60 });
    expect(hold).toMatchObject({ reps: null, weight: 48, duration_sec: 60 });
    expect(hold).not.toHaveProperty('added_weight_kg');
  });

  it('resumes and finishes a session saved before these fields existed', async () => {
    const server = createFakeSessionServer();
    const queue = createSyncQueue({ execute: server.execute });
    const store = createSessionStore(queue);
    let session = store.begin({ planId: 'p-old', type: 'gym', date: '2026-10-22' });
    session = store.saveSet(session, bench('old', 1));
    await queue.flush();
    // A copy written by the previous app version: no added_weight_kg / duration_sec anywhere.
    localStorage.setItem(`perf-os-session:plan:p-old`, JSON.stringify({ ...session, sets: [bench('old', 1)] }));
    const reloaded = createSessionStore(queue);
    const resumed = reloaded.read('p-old');
    expect(resumed?.sets).toEqual([bench('old', 1)]);
    const next = reloaded.saveSet(resumed!, { ...bench('new', 2, 60), reps: null, duration_sec: 60, weight: 71.4, added_weight_kg: 0, bodyweight_kg: 71.4 });
    reloaded.finish(next, { duration: null, notes: '', structuredMetrics: {}, numberSet: (_set, index) => index + 1 });
    await queue.flush();
    expect(server.state.activities.get(session.activityId)?.status).toBe('done');
    expect(server.state.sets.get('old')).not.toHaveProperty('duration_sec');
    expect(server.state.sets.get('new')).toMatchObject({ reps: null, duration_sec: 60, added_weight_kg: 0 });
  });
});
