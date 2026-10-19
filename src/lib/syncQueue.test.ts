import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncQueue, op, type SetRow } from './syncQueue';
import { createFakeSessionServer } from '@/test/fakeSessionServer';

const start = op.start({ activityId: 'a1', date: '2026-10-19', type: 'gym', subType: null, notes: null, tags: [], planId: null });
const row = (patch: Partial<SetRow> = {}): SetRow => ({
  id: 's1', activity_id: 'a1', exercise_id: 'bench', set_number: 1, reps: 5, weight: 80, rpe: null, plan_set_id: null, ...patch,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('sync queue', () => {
  it('sends each write as soon as it is queued', async () => {
    const server = createFakeSessionServer();
    const queue = createSyncQueue({ execute: server.execute });
    queue.enqueue(start);
    queue.enqueue(op.upsertSet(row()));
    await queue.flush();
    expect(server.state.activities.get('a1')?.status).toBe('in_progress');
    expect([...server.state.sets.values()]).toEqual([row()]);
    expect(queue.status().pending).toBe(0);
  });

  it('keeps writes queued while offline and sends them in order once back online', async () => {
    const server = createFakeSessionServer();
    let online = false;
    const queue = createSyncQueue({ execute: server.execute, isOnline: () => online });
    queue.enqueue(start);
    queue.enqueue(op.upsertSet(row()));
    await queue.flush();
    expect(server.state.calls).toEqual([]);
    expect(queue.status().pending).toBe(2);
    expect(JSON.parse(localStorage.getItem('perf-os-outbox') ?? '[]')).toHaveLength(2);

    online = true;
    await queue.flush();
    expect(server.state.calls).toEqual(['start', 'upsertSet']);
    expect(server.state.sets.size).toBe(1);
  });

  it('retries a failed write after a delay without duplicating it', async () => {
    vi.useFakeTimers();
    const server = createFakeSessionServer();
    server.state.failNext = 2;
    const queue = createSyncQueue({ execute: server.execute, retryDelayMs: () => 50 });
    queue.enqueue(start);
    queue.enqueue(op.upsertSet(row()));
    await queue.flush();
    expect(queue.status().lastError).toBe('upstream timeout');
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(60);
    await queue.flush();
    expect(queue.status().pending).toBe(0);
    expect(server.state.sets.size).toBe(1);
    expect(server.state.activities.size).toBe(1);
  });

  it('collapses a double tap and a later edit of one set into a single row', async () => {
    const server = createFakeSessionServer();
    let online = false;
    const queue = createSyncQueue({ execute: server.execute, isOnline: () => online });
    queue.enqueue(start);
    queue.enqueue(op.upsertSet(row()));
    queue.enqueue(op.upsertSet(row()));
    queue.enqueue(op.upsertSet(row({ reps: 6 })));
    expect(queue.status().pending).toBe(2);
    online = true;
    await queue.flush();
    expect([...server.state.sets.values()]).toEqual([row({ reps: 6 })]);
  });

  it('replays the outbox from storage after a reload', async () => {
    const server = createFakeSessionServer();
    const offline = createSyncQueue({ execute: server.execute, isOnline: () => false });
    offline.enqueue(start);
    offline.enqueue(op.upsertSet(row()));
    offline.enqueue(op.deleteSet('a1', 's1'));
    offline.enqueue(op.upsertSet(row({ id: 's2', set_number: 2 })));

    const reloaded = createSyncQueue({ execute: server.execute });
    await reloaded.flush();
    expect([...server.state.sets.keys()]).toEqual(['s2']);
    expect(reloaded.status().pending).toBe(0);
  });

  it('replaying an already applied write leaves the same rows', async () => {
    const server = createFakeSessionServer();
    const queue = createSyncQueue({ execute: server.execute });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      queue.enqueue(start);
      queue.enqueue(op.upsertSet(row()));
      queue.enqueue(op.finish({ activityId: 'a1', duration: 40, notes: null, structuredMetrics: { calorieEstimate: { calories: 200 } }, planId: null }));
      await queue.flush();
    }
    expect(server.state.activities.size).toBe(1);
    expect(server.state.sets.size).toBe(1);
    expect(server.state.activities.get('a1')?.status).toBe('done');
  });

  it('drops a session discarded before it ever reached the server', async () => {
    const server = createFakeSessionServer();
    let online = false;
    const queue = createSyncQueue({ execute: server.execute, isOnline: () => online });
    queue.enqueue(start);
    queue.enqueue(op.upsertSet(row()));
    queue.enqueue(op.discard('a1'));
    expect(queue.status().pending).toBe(0);
    online = true;
    await queue.flush();
    expect(server.state.calls).toEqual([]);
  });
});
