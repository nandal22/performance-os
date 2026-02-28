import { supabase } from '@/db/supabase';
import type { Exercise, CreateExercise } from '@/types';

export const exercisesService = {
  // Get all exercises (system + user's custom)
  getAll: async (): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('name');
    if (error) throw error;
    return data as Exercise[];
  },

  // Get exercises by category
  getByCategory: async (category: Exercise['category']): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .eq('category', category)
      .order('name');
    if (error) throw error;
    return data as Exercise[];
  },

  // Search exercises by name
  search: async (query: string): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(20);
    if (error) throw error;
    return data as Exercise[];
  },

  // Create a custom exercise (user_id set automatically)
  createCustom: async (exercise: Omit<CreateExercise, 'is_custom' | 'user_id'>): Promise<Exercise> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('exercises')
      .insert({ ...exercise, is_custom: true, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Exercise;
  },

  // Delete a custom exercise (only user's own)
  deleteCustom: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', id)
      .eq('is_custom', true);
    if (error) throw error;
  },
};
