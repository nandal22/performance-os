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

  // Check whether any strength sets reference this exercise
  hasUsedSets: async (id: string): Promise<boolean> => {
    const { count, error } = await supabase
      .from('strength_sets')
      .select('id', { count: 'exact', head: true })
      .eq('exercise_id', id);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  // Tracked exercises (stored in localStorage — client-side preference)
  getTrackedIds: (): string[] => {
    try { return JSON.parse(localStorage.getItem('perf-os-tracked') || '[]'); }
    catch { return []; }
  },

  isTracked: (id: string): boolean => {
    return exercisesService.getTrackedIds().includes(id);
  },

  toggleTracked: (id: string): boolean => {
    const ids = new Set(exercisesService.getTrackedIds());
    const wasTracked = ids.has(id);
    wasTracked ? ids.delete(id) : ids.add(id);
    localStorage.setItem('perf-os-tracked', JSON.stringify([...ids]));
    return !wasTracked;
  },
};
