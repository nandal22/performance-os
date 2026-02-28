import { supabase } from '@/db/supabase';
import type { CardioMetrics, CreateCardioMetrics } from '@/types';

export const cardioMetricsService = {
  // Get cardio metrics for an activity
  getByActivity: async (activityId: string): Promise<CardioMetrics | null> => {
    const { data, error } = await supabase
      .from('cardio_metrics')
      .select('*')
      .eq('activity_id', activityId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as CardioMetrics | null;
  },

  // Create cardio metrics for an activity
  create: async (metrics: CreateCardioMetrics): Promise<CardioMetrics> => {
    const { data, error } = await supabase
      .from('cardio_metrics')
      .insert(metrics)
      .select()
      .single();
    if (error) throw error;
    return data as CardioMetrics;
  },

  // Update cardio metrics
  update: async (id: string, updates: Partial<CreateCardioMetrics>): Promise<CardioMetrics> => {
    const { data, error } = await supabase
      .from('cardio_metrics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CardioMetrics;
  },
};
