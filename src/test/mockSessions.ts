// Stand-in for '@/services/sessions': the real queue and session store over an in-memory server.
import { vi } from 'vitest';
import { createSyncQueue } from '@/lib/syncQueue';
import { createSessionStore } from '@/lib/workoutSession';
import { createFakeSessionServer } from './fakeSessionServer';

export const server = createFakeSessionServer();
export const network = { online: true };

export const syncQueue = createSyncQueue({
  execute: op => server.execute(op),
  isOnline: () => network.online,
  retryDelayMs: () => 5,
});

export const sessionStore = createSessionStore(syncQueue);

export const sessionsService = {
  load: vi.fn(async () => null),
  findFree: vi.fn(async () => null),
};

export function resetSessions() {
  localStorage.clear();
  network.online = true;
  server.state.activities.clear();
  server.state.sets.clear();
  server.state.cardio.clear();
  server.state.plans.clear();
  server.state.calls.length = 0;
  server.state.failNext = 0;
}
