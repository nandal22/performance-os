import { supabase } from '@/db/supabase';
import { invalidateQueries, readQuery } from '@/lib/queryCache';
import type { Activity, ActivityListItem, ActivityWithSets, CardioEntry, CreateActivity } from '@/types';

const LIST_COLUMNS = 'id, date, type, sub_type, duration, tags, notes, calories:structured_metrics->calorieEstimate->>calories';
const LIST_TTL_MS = 60_000;

export interface WorkoutSetInput {
  exercise_id: string;
  set_number: number;
  reps: number;
  weight?: number;
}

export interface WorkoutCardioInput {
  exercise_id: string | null;
  position: number;
  duration_minutes: number;
  calories: number | null;
  label: string;
}

function missingRelation(error: { message?: string; code?: string } | null, name: string) {
  const message = error?.message ?? '';
  return error?.code === 'PGRST200' || error?.code === 'PGRST205' || message.includes(name);
}

export const activitiesService = {
  listRecent: async (limit = 80): Promise<ActivityListItem[]> => {
    return readQuery(`activities:recent:${limit}`, LIST_TTL_MS, async () => {
      const { data, error } = await supabase
        .from('activities')
        .select(LIST_COLUMNS)
        .order('date', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(row => ({
        ...row,
        calories: row.calories == null || row.calories === '' ? null : Number(row.calories),
      })) as ActivityListItem[];
    });
  },

  getAll: async (limit = 50): Promise<Activity[]> => {
    const { data, error } = await supabase
      .from('activities')
      .select('id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics, created_at, updated_at')
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as Activity[];
  },

  getById: async (id: string): Promise<ActivityWithSets | null> => {
    const withEntries = await supabase
      .from('activities')
      .select(`
        id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics, created_at, updated_at,
        strength_sets (
          id, activity_id, exercise_id, set_number, reps, weight, rpe, rest, tempo, volume, created_at,
          exercise:exercises (id, name, category, primary_muscle, secondary_muscles, equipment, is_custom, user_id, created_at)
        ),
        cardio_metrics (id, activity_id, distance, avg_heart_rate, max_heart_rate, elevation, calories, avg_pace, created_at),
        cardio_entries (id, activity_id, exercise_id, position, duration_minutes, calories, label, created_at)
      `)
      .eq('id', id)
      .single();

    if (!withEntries.error) return withEntries.data as unknown as ActivityWithSets;

    if (!missingRelation(withEntries.error, 'cardio_entries')) throw withEntries.error;

    const legacy = await supabase
      .from('activities')
      .select(`
        id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics, created_at, updated_at,
        strength_sets (
          id, activity_id, exercise_id, set_number, reps, weight, rpe, rest, tempo, volume, created_at,
          exercise:exercises (id, name, category, primary_muscle, secondary_muscles, equipment, is_custom, user_id, created_at)
        ),
        cardio_metrics (id, activity_id, distance, avg_heart_rate, max_heart_rate, elevation, calories, avg_pace, created_at)
      `)
      .eq('id', id)
      .single();
    if (legacy.error) throw legacy.error;
    const activity = legacy.data as unknown as ActivityWithSets;
    const embedded = (activity.structured_metrics as { cardioEntries?: CardioEntry[] } | null)?.cardioEntries;
    activity.cardio_entries = embedded ?? [];
    return activity;
  },

  getByMonth: async (month: string): Promise<Activity[]> => {
    const start = `${month}-01`;
    const end = `${month}-31`;
    const { data, error } = await supabase
      .from('activities')
      .select('id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics, created_at, updated_at')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });
    if (error) throw error;
    return data as Activity[];
  },

  getByType: async (type: Activity['type']): Promise<Activity[]> => {
    const { data, error } = await supabase
      .from('activities')
      .select('id, user_id, date, type, sub_type, duration, notes, tags, structured_metrics, created_at, updated_at')
      .eq('type', type)
      .order('date', { ascending: false });
    if (error) throw error;
    return data as Activity[];
  },

  create: async (activity: CreateActivity, userId: string): Promise<Activity> => {
    const { data, error } = await supabase
      .from('activities')
      .insert({ ...activity, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    invalidateQueries('activities:');
    return data as Activity;
  },

  update: async (id: string, updates: Partial<CreateActivity>): Promise<Activity> => {
    const { data, error } = await supabase
      .from('activities')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    invalidateQueries('activities:');
    return data as Activity;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) throw error;
    invalidateQueries('activities:');
  },

  saveWorkout: async (input: {
    userId: string;
    activity: CreateActivity;
    sets: WorkoutSetInput[];
    cardio: WorkoutCardioInput[];
    legacyCardio?: { distance?: number; avg_heart_rate?: number; calories?: number } | null;
  }): Promise<string> => {
    const rpc = await supabase.rpc('save_workout', {
      p_date: input.activity.date,
      p_type: input.activity.type,
      p_sub_type: input.activity.sub_type ?? null,
      p_duration: input.activity.duration ?? null,
      p_notes: input.activity.notes ?? null,
      p_tags: input.activity.tags ?? [],
      p_structured_metrics: input.activity.structured_metrics ?? {},
      p_sets: input.sets,
      p_cardio: input.cardio,
      p_legacy_cardio: input.legacyCardio ?? null,
    });

    if (!rpc.error && rpc.data) {
      invalidateQueries('activities:');
      invalidateQueries('sets:');
      return rpc.data as string;
    }

    const rpcMissing = rpc.error && (
      rpc.error.code === 'PGRST202'
      || /save_workout/.test(rpc.error.message)
      || /could not find the function/i.test(rpc.error.message)
    );
    if (!rpcMissing) throw rpc.error;

    const activity = await activitiesService.create(input.activity, input.userId);
    try {
      if (input.sets.length > 0) {
        const { error } = await supabase.from('strength_sets').insert(
          input.sets
            .filter(set => set.exercise_id && !set.exercise_id.startsWith('pending-'))
            .map(set => ({
              activity_id: activity.id,
              exercise_id: set.exercise_id,
              set_number: set.set_number,
              reps: set.reps,
              weight: set.weight,
            })),
        );
        if (error) throw error;
      }

      if (input.legacyCardio) {
        const { error } = await supabase.from('cardio_metrics').insert({
          activity_id: activity.id,
          distance: input.legacyCardio.distance,
          avg_heart_rate: input.legacyCardio.avg_heart_rate,
          calories: input.legacyCardio.calories,
        });
        if (error) throw error;
      }

      if (input.cardio.length > 0) {
        const rows = input.cardio.map(entry => ({
          activity_id: activity.id,
          exercise_id: entry.exercise_id && !entry.exercise_id.startsWith('pending-') ? entry.exercise_id : null,
          position: entry.position,
          duration_minutes: entry.duration_minutes,
          calories: entry.calories,
          label: entry.label,
        }));
        const inserted = await supabase.from('cardio_entries').insert(rows);
        if (inserted.error) {
          if (!missingRelation(inserted.error, 'cardio_entries')) throw inserted.error;
          await activitiesService.update(activity.id, {
            structured_metrics: {
              ...input.activity.structured_metrics,
              cardioEntries: rows,
            },
          });
        }
      }
    } catch (error) {
      await supabase.from('activities').delete().eq('id', activity.id);
      throw error;
    }

    invalidateQueries('activities:');
    invalidateQueries('sets:');
    return activity.id;
  },
};
