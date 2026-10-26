// A workout session lives in three places at once: React state, localStorage
// (so a reload resumes it), and the outbox (so every logged set reaches the
// database as soon as it is logged). Each change writes all three.

import { op, type SetRow, type SyncQueue } from '@/lib/syncQueue';

export type LoadMode = 'total' | 'dumbbell_pair' | 'barbell_plates' | 'bodyweight';

export interface SessionSet {
  id: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  /** Null for a timed set (duration_sec holds its seconds). */
  reps: number | null;
  /** The total load: body weight + added for bodyweight sets, the pair for dumbbells. */
  weight: number | null;
  rpe: number | null;
  plan_set_id: string | null;
  /** Load added on top of body weight (0 = BW only). Set for bodyweight exercises. */
  added_weight_kg?: number | null;
  /** Seconds held or carried. Set for timed exercises. */
  duration_sec?: number | null;
  load_mode?: LoadMode;
  input_weight?: number;
  bar_weight?: number;
  bodyweight_factor?: number;
  bodyweight_kg?: number | null;
  load_label?: string;
}

export interface SessionCardio {
  id: string;
  exercise_id: string | null;
  exercise_name: string;
  position: number;
  minutes: number;
  calories: number | null;
  label: string;
  plan_exercise_id: string | null;
}

export interface SessionExtra {
  id: string;
  exercise_id: string;
  exercise_name: string;
}

export interface WorkoutSession {
  version: 1;
  activityId: string;
  planId: string | null;
  type: string;
  subType: string | null;
  date: string;
  notes: string;
  tags: string[];
  startedAt: number;
  sets: SessionSet[];
  cardio: SessionCardio[];
  skipped: string[];
  extras: SessionExtra[];
}

const PREFIX = 'perf-os-session:';
const ENDED_PREFIX = 'perf-os-ended:';
const MAX_AGE_MS = 3 * 86_400_000;

/** The id a plan session is started with: the linked activity, or the plan id before one exists. */
export function planActivityId(plan: { id: string; activity_id: string | null }) {
  return plan.activity_id ?? plan.id;
}

/** Remember a session that was finished on this device, so a stale in-progress read cannot resume it. */
export function rememberEnded(activityId: string, storage: Storage = localStorage) {
  storage.setItem(`${ENDED_PREFIX}${activityId}`, String(Date.now()));
}

export function wasEnded(activityId: string, storage: Storage = localStorage) {
  const raw = storage.getItem(`${ENDED_PREFIX}${activityId}`);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) {
    storage.removeItem(`${ENDED_PREFIX}${activityId}`);
    return false;
  }
  return true;
}

/** Whether the home card should offer Start, Continue, or neither. */
export function planLogAction(plan: { id: string; status: string; activity_id: string | null }): 'start' | 'continue' | 'closed' {
  if (plan.status === 'done' || plan.status === 'skipped' || wasEnded(planActivityId(plan))) return 'closed';
  if (plan.status === 'in_progress') return 'continue';
  return plan.status === 'planned' ? 'start' : 'closed';
}

export function sessionStorageKey(planId: string | null) {
  return `${PREFIX}${planId ? `plan:${planId}` : 'free'}`;
}

export function newId() {
  return crypto.randomUUID();
}

export function readSession(planId: string | null, storage: Storage = localStorage): WorkoutSession | null {
  try {
    const raw = storage.getItem(sessionStorageKey(planId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkoutSession;
    if (parsed?.version !== 1 || typeof parsed.activityId !== 'string') return null;
    if (Date.now() - parsed.startedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(session: WorkoutSession, storage: Storage) {
  storage.setItem(sessionStorageKey(session.planId), JSON.stringify(session));
  return session;
}

export function clearSession(planId: string | null, storage: Storage = localStorage) {
  storage.removeItem(sessionStorageKey(planId));
}

/**
 * The strength_sets row for a set. The bodyweight split and seconds are only sent when the
 * set carries them, so rows from sessions started before they existed stay the same shape.
 */
export function setRow(session: WorkoutSession, set: SessionSet): SetRow {
  const row: SetRow = {
    id: set.id,
    activity_id: session.activityId,
    exercise_id: set.exercise_id,
    set_number: set.set_number,
    reps: set.reps,
    weight: set.weight,
    rpe: set.rpe,
    plan_set_id: set.plan_set_id,
  };
  if (set.added_weight_kg !== undefined) {
    row.added_weight_kg = set.added_weight_kg;
    row.bodyweight_kg = set.bodyweight_kg ?? null;
  }
  if (set.duration_sec !== undefined) row.duration_sec = set.duration_sec;
  return row;
}

function cardioRow(session: WorkoutSession, entry: SessionCardio) {
  return {
    id: entry.id,
    activity_id: session.activityId,
    exercise_id: entry.exercise_id && !entry.exercise_id.startsWith('pending-') ? entry.exercise_id : null,
    position: entry.position,
    duration_minutes: entry.minutes,
    calories: entry.calories,
    label: entry.label,
    plan_exercise_id: entry.plan_exercise_id,
  };
}

export function createSessionStore(queue: SyncQueue, storage: Storage = localStorage) {
  return {
    read: (planId: string | null) => readSession(planId, storage),

    adopt(session: WorkoutSession) {
      return persist(session, storage);
    },

    begin(init: {
      activityId?: string;
      planId: string | null;
      type: string;
      subType?: string | null;
      date: string;
      notes?: string;
      tags?: string[];
    }): WorkoutSession {
      const session: WorkoutSession = {
        version: 1,
        activityId: init.activityId ?? newId(),
        planId: init.planId,
        type: init.type,
        subType: init.subType ?? null,
        date: init.date,
        notes: init.notes ?? '',
        tags: init.tags ?? [],
        startedAt: Date.now(),
        sets: [],
        cardio: [],
        skipped: [],
        extras: [],
      };
      persist(session, storage);
      queue.enqueue(op.start({
        activityId: session.activityId,
        date: session.date,
        type: session.type,
        subType: session.subType,
        notes: session.notes || null,
        tags: session.tags,
        planId: session.planId,
      }));
      return session;
    },

    saveSet(session: WorkoutSession, set: SessionSet): WorkoutSession {
      const exists = session.sets.some(item => item.id === set.id);
      const sets = exists
        ? session.sets.map(item => (item.id === set.id ? set : item))
        : [...session.sets, set];
      const next = persist({ ...session, sets, skipped: session.skipped.filter(key => key !== set.plan_set_id) }, storage);
      queue.enqueue(op.upsertSet(setRow(next, set)));
      return next;
    },

    deleteSet(session: WorkoutSession, id: string): WorkoutSession {
      const next = persist({ ...session, sets: session.sets.filter(item => item.id !== id) }, storage);
      queue.enqueue(op.deleteSet(session.activityId, id));
      return next;
    },

    saveCardio(session: WorkoutSession, entry: SessionCardio): WorkoutSession {
      const exists = session.cardio.some(item => item.id === entry.id);
      const cardio = exists
        ? session.cardio.map(item => (item.id === entry.id ? entry : item))
        : [...session.cardio, entry];
      const next = persist({ ...session, cardio }, storage);
      queue.enqueue(op.upsertCardio(cardioRow(next, entry)));
      return next;
    },

    deleteCardio(session: WorkoutSession, id: string): WorkoutSession {
      const next = persist({ ...session, cardio: session.cardio.filter(item => item.id !== id) }, storage);
      queue.enqueue(op.deleteCardio(session.activityId, id));
      return next;
    },

    // Local-only fields: notes typed so far, skipped plan sets, added exercises.
    patch(session: WorkoutSession, patch: Partial<Pick<WorkoutSession, 'notes' | 'skipped' | 'extras'>>): WorkoutSession {
      return persist({ ...session, ...patch }, storage);
    },

    updateMeta(session: WorkoutSession, meta: { date: string; type: string; subType: string | null }): WorkoutSession {
      if (meta.date === session.date && meta.type === session.type && meta.subType === session.subType) return session;
      const next = persist({ ...session, ...meta }, storage);
      queue.enqueue(op.meta({ activityId: next.activityId, ...meta }));
      return next;
    },

    // Rewrites set numbers and cardio positions to the order on screen, then closes the session.
    finish(session: WorkoutSession, summary: {
      duration: number | null;
      notes: string | null;
      structuredMetrics: Record<string, unknown>;
      numberSet: (set: SessionSet, index: number, all: SessionSet[]) => number;
    }) {
      session.sets.forEach((set, index, all) => {
        const number = summary.numberSet(set, index, all);
        if (number !== set.set_number) queue.enqueue(op.upsertSet(setRow(session, { ...set, set_number: number })));
      });
      session.cardio.forEach((entry, index) => {
        if (entry.position !== index + 1) queue.enqueue(op.upsertCardio(cardioRow(session, { ...entry, position: index + 1 })));
      });
      queue.enqueue(op.finish({
        activityId: session.activityId,
        duration: summary.duration,
        notes: summary.notes,
        structuredMetrics: summary.structuredMetrics,
        planId: session.planId,
      }));
      // Recorded before the local copy is dropped, so a refresh that still says
      // in_progress cannot offer Continue or open the logger again.
      rememberEnded(session.activityId, storage);
      clearSession(session.planId, storage);
    },

    discard(session: WorkoutSession) {
      queue.enqueue(op.discard(session.activityId));
      clearSession(session.planId, storage);
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

export function globalSetNumber(_set: SessionSet, index: number) {
  return index + 1;
}

export function perExerciseSetNumber(set: SessionSet, index: number, all: SessionSet[]) {
  return all.slice(0, index + 1).filter(item => item.exercise_id === set.exercise_id).length;
}
