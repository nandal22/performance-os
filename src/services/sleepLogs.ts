import { supabase } from '@/db/supabase';
import type { SleepLog, CreateSleepLog } from '@/types';

export const sleepLogsService = {
  getAll: async (limit = 30): Promise<SleepLog[]> => {
    const { data, error } = await supabase
      .from('sleep_logs')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as SleepLog[];
  },

  // Insert or update for the given date (enforces 1 entry per day)
  upsert: async (log: CreateSleepLog): Promise<SleepLog> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('sleep_logs')
      .upsert({ ...log, user_id: user.id }, { onConflict: 'user_id,date' })
      .select()
      .single();
    if (error) throw error;
    return data as SleepLog;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from('sleep_logs').delete().eq('id', id);
    if (error) throw error;
  },
};
