import { supabase } from '@/db/supabase';
import type { BodyMetric, CreateBodyMetric } from '@/types';

export const bodyMetricsService = {
  // Get all body metric entries, newest first
  getAll: async (limit = 90): Promise<BodyMetric[]> => {
    const { data, error } = await supabase
      .from('body_metrics')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as BodyMetric[];
  },

  // Get entry for a specific date
  getByDate: async (date: string): Promise<BodyMetric | null> => {
    const { data, error } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('date', date)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data as BodyMetric | null;
  },

  // Get entries for a date range (for trend charts)
  getRange: async (from: string, to: string): Promise<BodyMetric[]> => {
    const { data, error } = await supabase
      .from('body_metrics')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });
    if (error) throw error;
    return data as BodyMetric[];
  },

  // Upsert (insert or update) for a date
  upsert: async (metric: CreateBodyMetric): Promise<BodyMetric> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('body_metrics')
      .upsert({ ...metric, user_id: user.id }, { onConflict: 'user_id,date' })
      .select()
      .single();
    if (error) throw error;
    return data as BodyMetric;
  },

  // Delete an entry
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from('body_metrics').delete().eq('id', id);
    if (error) throw error;
  },
};
