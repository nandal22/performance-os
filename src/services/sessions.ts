import { supabase } from '@/db/supabase';
import { invalidateQueries } from '@/lib/queryCache';
import { createSyncQueue, type SyncOp } from '@/lib/syncQueue';
import { createSessionStore, wasEnded, type WorkoutSession } from '@/lib/workoutSession';

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function executeSessionOp(next: SyncOp): Promise<void> {
  switch (next.kind) {
    case 'start': {
      const { error } = await supabase.rpc('start_workout_session', {
        p_activity_id: next.args.activityId,
        p_date: next.args.date,
        p_type: next.args.type,
        p_sub_type: next.args.subType,
        p_notes: next.args.notes,
        p_tags: next.args.tags,
        p_plan_id: next.args.planId,
      });
      check(error);
      invalidateQueries('plans:');
      invalidateQueries('activities:');
      return;
    }
    case 'meta': {
      const { error } = await supabase
        .from('activities')
        .update({ date: next.args.date, type: next.args.type, sub_type: next.args.subType, updated_at: new Date().toISOString() })
        .eq('id', next.activityId);
      check(error);
      return;
    }
    case 'upsertSet': {
      const { error } = await supabase.from('strength_sets').upsert(next.row, { onConflict: 'id' });
      check(error);
      return;
    }
    case 'deleteSet': {
      const { error } = await supabase.from('strength_sets').delete().eq('id', next.id);
      check(error);
      return;
    }
    case 'upsertCardio': {
      const { error } = await supabase.from('cardio_entries').upsert(next.row, { onConflict: 'id' });
      check(error);
      return;
    }
    case 'deleteCardio': {
      const { error } = await supabase.from('cardio_entries').delete().eq('id', next.id);
      check(error);
      return;
    }
    case 'finish': {
      const { error } = await supabase.rpc('finish_workout_session', {
        p_activity_id: next.args.activityId,
        p_duration: next.args.duration,
        p_notes: next.args.notes,
        p_structured_metrics: next.args.structuredMetrics,
        p_plan_id: next.args.planId,
      });
      check(error);
      break;
    }
    case 'discard': {
      const { error } = await supabase.rpc('discard_workout_session', { p_activity_id: next.activityId });
      check(error);
      break;
    }
  }
  invalidateQueries('activities:');
  invalidateQueries('sets:');
  invalidateQueries('progress:');
  invalidateQueries('plans:');
}

export const syncQueue = createSyncQueue({ execute: executeSessionOp });
export const sessionStore = createSessionStore(syncQueue);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void syncQueue.flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncQueue.flush();
  });
}

interface RemoteActivity {
  id: string;
  date: string;
  type: string;
  sub_type: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  strength_sets: Array<{
    id: string; exercise_id: string; set_number: number; reps: number | null; weight: number | null;
    rpe: number | null; plan_set_id: string | null; created_at: string; exercise: { name: string } | null;
    added_weight_kg?: number | null; bodyweight_kg?: number | null; duration_sec?: number | null;
  }> | null;
  cardio_entries: Array<{
    id: string; exercise_id: string | null; position: number; duration_minutes: number | null;
    calories: number | null; label: string | null; plan_exercise_id: string | null;
  }> | null;
}

const REMOTE_COLUMNS = `
  id, date, type, sub_type, notes, tags, created_at,
  strength_sets (
    id, exercise_id, set_number, reps, weight, rpe, plan_set_id, created_at,
    added_weight_kg, bodyweight_kg, duration_sec, exercise:exercises (name)
  ),
  cardio_entries (id, exercise_id, position, duration_minutes, calories, label, plan_exercise_id)
`;

function toSession(row: RemoteActivity, planId: string | null): WorkoutSession {
  return {
    version: 1,
    activityId: row.id,
    planId,
    type: row.type,
    subType: row.sub_type,
    date: row.date,
    notes: row.notes ?? '',
    tags: row.tags ?? [],
    startedAt: Date.parse(row.created_at) || Date.now(),
    sets: (row.strength_sets ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.set_number - b.set_number)
      .map(set => ({
        id: set.id,
        exercise_id: set.exercise_id,
        exercise_name: set.exercise?.name ?? 'Exercise',
        set_number: set.set_number,
        reps: set.reps == null && set.duration_sec != null ? null : Number(set.reps ?? 0),
        weight: set.weight == null ? null : Number(set.weight),
        rpe: set.rpe == null ? null : Number(set.rpe),
        plan_set_id: set.plan_set_id,
        ...(set.added_weight_kg != null ? {
          added_weight_kg: Number(set.added_weight_kg),
          bodyweight_kg: set.bodyweight_kg == null ? null : Number(set.bodyweight_kg),
          load_mode: 'bodyweight' as const,
        } : {}),
        ...(set.duration_sec != null ? { duration_sec: Number(set.duration_sec) } : {}),
      })),
    cardio: (row.cardio_entries ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(entry => ({
        id: entry.id,
        exercise_id: entry.exercise_id,
        exercise_name: 'Cardio',
        position: entry.position,
        minutes: Number(entry.duration_minutes ?? 0),
        calories: entry.calories == null ? null : Number(entry.calories),
        label: entry.label ?? '',
        plan_exercise_id: entry.plan_exercise_id,
      })),
    skipped: [],
    extras: [],
  };
}

export const sessionsService = {
  // Rebuilds a session from the database when this device has no local copy.
  load: async (activityId: string, planId: string | null): Promise<WorkoutSession | null> => {
    if (wasEnded(activityId)) return null;
    const { data, error } = await supabase
      .from('activities')
      .select(REMOTE_COLUMNS)
      .eq('id', activityId)
      .eq('status', 'in_progress')
      .maybeSingle();
    if (error || !data) return null;
    return toSession(data as unknown as RemoteActivity, planId);
  },

  // Latest unfinished workout that is not tied to a plan.
  findFree: async (): Promise<WorkoutSession | null> => {
    const { data, error } = await supabase
      .from('activities')
      .select(`${REMOTE_COLUMNS}, workout_plans!workout_plans_activity_id_fkey (id)`)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error || !data) return null;
    const row = (data as unknown as Array<RemoteActivity & { workout_plans: { id: string }[] | null }>)
      .find(item => !item.workout_plans?.length && !wasEnded(item.id));
    return row ? toSession(row, null) : null;
  },
};
