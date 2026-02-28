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
};
