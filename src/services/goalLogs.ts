import { supabase } from '@/db/supabase';
import type { GoalLog, CreateGoalLog } from '@/types';

export const goalLogsService = {
  getByGoal: async (goalId: string): Promise<GoalLog[]> => {
    const { data, error } = await supabase
      .from('goal_logs')
      .select('*')
      .eq('goal_id', goalId)
      .order('date', { ascending: false });
    if (error) throw error;
    return data as GoalLog[];
  },

  create: async (log: CreateGoalLog): Promise<GoalLog> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('goal_logs')
      .insert({ ...log, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as GoalLog;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from('goal_logs').delete().eq('id', id);
    if (error) throw error;
  },
};
