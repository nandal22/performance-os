import { beforeEach, describe, expect, it } from 'vitest';
import { createSyncQueue } from './syncQueue';
import { createSessionStore, globalSetNumber, type SessionSet } from './workoutSession';
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
