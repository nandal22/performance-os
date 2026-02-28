import { supabase } from '@/db/supabase';
import type { StrengthSet, CreateStrengthSet, ExerciseSummary, PRRecord } from '@/types';

export const strengthSetsService = {
  // Get all sets for an activity
  getByActivity: async (activityId: string): Promise<StrengthSet[]> => {
    const { data, error } = await supabase
      .from('strength_sets')
      .select('*, exercise:exercises(*)')
      .eq('activity_id', activityId)
      .order('set_number');
    if (error) throw error;
    return data as StrengthSet[];
  },

  // Get all sets for a specific exercise (for trend analysis)
  getByExercise: async (exerciseId: string, limit = 100): Promise<StrengthSet[]> => {
    const { data, error } = await supabase
      .from('strength_sets')
      .select('*, activity:activities(date)')
      .eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as StrengthSet[];
  },

  // Bulk insert sets for an activity
  createMany: async (sets: CreateStrengthSet[]): Promise<StrengthSet[]> => {
    const { data, error } = await supabase
      .from('strength_sets')
      .insert(sets)
      .select();
    if (error) throw error;
    return data as StrengthSet[];
  },

  // Update a single set
  update: async (id: string, updates: Partial<CreateStrengthSet>): Promise<StrengthSet> => {
    const { data, error } = await supabase
      .from('strength_sets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as StrengthSet;
  },

  // Delete all sets for an activity (used when editing a session)
  deleteByActivity: async (activityId: string): Promise<void> => {
    const { error } = await supabase
      .from('strength_sets')
      .delete()
      .eq('activity_id', activityId);
    if (error) throw error;
  },

  // Get exercise summary stats for current user
  // SQL does the heavy lifting: total volume, max weight, estimated 1RM
  getExerciseSummaries: async (): Promise<ExerciseSummary[]> => {
    const { data, error } = await supabase.rpc('get_exercise_summaries');
    if (error) throw error;
    return data as ExerciseSummary[];
  },

  // Get all-time PRs per exercise
  getPRs: async (): Promise<PRRecord[]> => {
    const { data, error } = await supabase.rpc('get_personal_records');
    if (error) throw error;
    return data as PRRecord[];
  },

  // Get the most recent session's sets for a given exercise (for progressive overload hints)
  getLastSession: async (exerciseId: string): Promise<{ date: string; sets: { reps: number; weight: number; set_number: number }[] } | null> => {
    const { data, error } = await supabase
      .from('strength_sets')
      .select('reps, weight, set_number, activity:activities!inner(date)')
      .eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    if (!data || data.length === 0) return null;

    // Group by activity date and take the most recent date
    const byDate: Record<string, { reps: number; weight: number; set_number: number }[]> = {};
    for (const s of data) {
      const date = ((s.activity as unknown) as { date: string } | null)?.date ?? '';
      if (!date) continue;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({ reps: s.reps ?? 0, weight: s.weight ?? 0, set_number: s.set_number ?? 0 });
    }

    const dates = Object.keys(byDate).sort().reverse();
    if (dates.length === 0) return null;

    return {
      date: dates[0],
      sets: byDate[dates[0]].sort((a, b) => a.set_number - b.set_number),
    };
  },
};
