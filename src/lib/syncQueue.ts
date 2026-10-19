// Local outbox for session writes. Every op is idempotent on the server, so a
// replay after a crash, a timeout, or a lost response converges on one row.

export interface SetRow {
  id: string;
  activity_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  plan_set_id: string | null;
}

export interface CardioRow {
  id: string;
  activity_id: string;
  exercise_id: string | null;
  position: number;
  duration_minutes: number;
  calories: number | null;
  label: string;
  plan_exercise_id: string | null;
}

export interface StartArgs {
  activityId: string;
  date: string;
  type: string;
  subType: string | null;
  notes: string | null;
  tags: string[];
  planId: string | null;
}

export interface MetaArgs {
  activityId: string;
  date: string;
  type: string;
  subType: string | null;
}

export interface FinishArgs {
  activityId: string;
  duration: number | null;
  notes: string | null;
  structuredMetrics: Record<string, unknown>;
  planId: string | null;
}

export type SyncOp =
  | { kind: 'start'; key: string; activityId: string; args: StartArgs }
  | { kind: 'meta'; key: string; activityId: string; args: MetaArgs }
  | { kind: 'upsertSet'; key: string; activityId: string; row: SetRow }
  | { kind: 'deleteSet'; key: string; activityId: string; id: string }
  | { kind: 'upsertCardio'; key: string; activityId: string; row: CardioRow }
  | { kind: 'deleteCardio'; key: string; activityId: string; id: string }
  | { kind: 'finish'; key: string; activityId: string; args: FinishArgs }
  | { kind: 'discard'; key: string; activityId: string };

interface Entry {
  seq: number;
  op: SyncOp;
  attempts: number;
}

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastError: string | null;
}

export interface SyncQueueOptions {
  execute: (op: SyncOp) => Promise<void>;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey?: string;
  isOnline?: () => boolean;
  retryDelayMs?: (attempts: number) => number;
}

export const op = {
  start: (args: StartArgs): SyncOp => ({ kind: 'start', key: `activity:${args.activityId}`, activityId: args.activityId, args }),
  meta: (args: MetaArgs): SyncOp => ({ kind: 'meta', key: `meta:${args.activityId}`, activityId: args.activityId, args }),
  upsertSet: (row: SetRow): SyncOp => ({ kind: 'upsertSet', key: `set:${row.id}`, activityId: row.activity_id, row }),
  deleteSet: (activityId: string, id: string): SyncOp => ({ kind: 'deleteSet', key: `set:${id}`, activityId, id }),
  upsertCardio: (row: CardioRow): SyncOp => ({ kind: 'upsertCardio', key: `cardio:${row.id}`, activityId: row.activity_id, row }),
  deleteCardio: (activityId: string, id: string): SyncOp => ({ kind: 'deleteCardio', key: `cardio:${id}`, activityId, id }),
  finish: (args: FinishArgs): SyncOp => ({ kind: 'finish', key: `finish:${args.activityId}`, activityId: args.activityId, args }),
  discard: (activityId: string): SyncOp => ({ kind: 'discard', key: `discard:${activityId}`, activityId }),
};

function defaultDelay(attempts: number) {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

export function createSyncQueue(options: SyncQueueOptions) {
  const storage = options.storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  const storageKey = options.storageKey ?? 'perf-os-outbox';
  const isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const retryDelay = options.retryDelayMs ?? defaultDelay;
  const listeners = new Set<(status: SyncStatus) => void>();

  let entries: Entry[] = [];
  let seq = 0;
  let flushing: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastError: string | null = null;

  try {
    const raw = storage?.getItem(storageKey);
    if (raw) entries = (JSON.parse(raw) as Entry[]).filter(entry => entry?.op?.key);
  } catch {
    entries = [];
  }
  seq = entries.reduce((max, entry) => Math.max(max, entry.seq), 0);

  const status = (): SyncStatus => ({ pending: entries.length, syncing: flushing != null, lastError });

  const persist = () => {
    storage?.setItem(storageKey, JSON.stringify(entries));
    const snapshot = status();
    for (const listener of listeners) listener(snapshot);
  };

  const scheduleRetry = (attempts: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, retryDelay(attempts));
  };

  function enqueue(next: SyncOp) {
    if (next.kind === 'discard') {
      const neverStarted = entries.some(entry => entry.op.kind === 'start' && entry.op.activityId === next.activityId && entry.attempts === 0 && !inFlight(entry));
      entries = entries.filter(entry => entry.op.activityId !== next.activityId || inFlight(entry));
      if (neverStarted && !entries.some(entry => entry.op.activityId === next.activityId)) {
        persist();
        return;
      }
    }
    const entry: Entry = { seq: ++seq, op: next, attempts: 0 };
    const index = entries.findIndex(existing => existing.op.key === next.key && !inFlight(existing));
    if (index >= 0) entries[index] = entry;
    else entries.push(entry);
    persist();
    void flush();
  }

  let sending: Entry | null = null;
  const inFlight = (entry: Entry) => sending?.seq === entry.seq;

  // Sends queued ops one at a time, oldest first. Stops at the first failure and retries later.
  async function drain(): Promise<boolean> {
    while (entries.length > 0) {
      if (!isOnline()) return true;
      const entry = entries[0];
      sending = entry;
      try {
        await options.execute(entry.op);
        entries = entries.filter(existing => existing.seq !== entry.seq);
        lastError = null;
        sending = null;
        persist();
      } catch (error) {
        sending = null;
        entry.attempts += 1;
        lastError = error instanceof Error ? error.message : String(error);
        persist();
        scheduleRetry(entry.attempts);
        return false;
      }
    }
    return true;
  }

  let again = false;

  function flush(): Promise<void> {
    if (flushing) {
      again = true;
      return flushing;
    }
    flushing = (async () => {
      let ok = true;
      do {
        again = false;
        ok = await drain();
      } while (ok && again);
    })().finally(() => {
      flushing = null;
      sending = null;
      const snapshot = status();
      for (const listener of listeners) listener(snapshot);
    });
    return flushing;
  }

  return {
    enqueue,
    flush,
    status,
    pendingFor: (activityId: string) => entries.filter(entry => entry.op.activityId === activityId).length,
    subscribe(listener: (status: SyncStatus) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type SyncQueue = ReturnType<typeof createSyncQueue>;
