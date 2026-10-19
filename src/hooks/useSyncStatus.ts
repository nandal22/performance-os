import { useSyncExternalStore } from 'react';
import { syncQueue } from '@/services/sessions';

export function useSyncStatus(activityId: string | null) {
  const pending = useSyncExternalStore(
    syncQueue.subscribe,
    () => (activityId ? syncQueue.pendingFor(activityId) : 0),
  );
  const lastError = useSyncExternalStore(syncQueue.subscribe, () => syncQueue.status().lastError);
  return { pending, lastError };
}
