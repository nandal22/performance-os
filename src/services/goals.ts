import { supabase } from '@/db/supabase';
import type { Goal, CreateGoal } from '@/types';

export const goalsService = {
  getAll: async (): Promise<Goal[]> => {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Goal[];
  },

  create: async (goal: CreateGoal): Promise<Goal> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('goals')
      .insert({ ...goal, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Goal;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) throw error;
  },
};
