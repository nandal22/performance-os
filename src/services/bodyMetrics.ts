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

  // Get the single most recent entry (for dashboard / engine seed)
  getLatest: async (): Promise<BodyMetric | null> => {
    const { data, error } = await supabase
      .from('body_metrics')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as BodyMetric | null;
  },

  // Build the best available MetricsProfile by scanning history for
  // the latest non-null value of each rarely-changing field (height, age, gender).
  // Always takes weight from the most recent entry.
  getLatestProfile: async (): Promise<{
    weight: number | null;
    height: number | null;
    age:    number | null;
    gender: 'male' | 'female' | null;
    lastWeightDate: string | null;
  }> => {
    const { data, error } = await supabase
      .from('body_metrics')
      .select('date, weight, height, age, gender')
      .order('date', { ascending: false })
      .limit(90);
    if (error) throw error;

    const rows = (data ?? []) as Pick<BodyMetric, 'date' | 'weight' | 'height' | 'age' | 'gender'>[];

    const latestWeight = rows.find(r => r.weight)?.weight ?? null;
    const lastWeightDate = rows.find(r => r.weight)?.date ?? null;
    const latestHeight = rows.find(r => r.height)?.height ?? null;
    const latestAge    = rows.find(r => r.age)?.age ?? null;
    const latestGender = (rows.find(r => r.gender)?.gender ?? null) as 'male' | 'female' | null;

    return {
      weight: latestWeight,
      height: latestHeight,
      age:    latestAge,
      gender: latestGender,
      lastWeightDate,
    };
  },
};
