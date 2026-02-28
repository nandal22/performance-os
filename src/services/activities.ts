import { supabase } from '@/db/supabase';
import type { Activity, ActivityWithSets, CreateActivity } from '@/types';

export const activitiesService = {
  // Get all activities for the current user, newest first
  getAll: async (limit = 50): Promise<Activity[]> => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as Activity[];
  },

  // Get a single activity with its sets and cardio metrics
  getById: async (id: string): Promise<ActivityWithSets | null> => {
    const { data, error } = await supabase
      .from('activities')
      .select(`
        *,
        strength_sets (
          *,
          exercise:exercises (*)
        ),
        cardio_metrics (*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as ActivityWithSets;
  },

  // Get activities by month (YYYY-MM)
  getByMonth: async (month: string): Promise<Activity[]> => {
    const start = `${month}-01`;
    const end = `${month}-31`;
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });
    if (error) throw error;
    return data as Activity[];
  },

  // Get activities by type
  getByType: async (type: Activity['type']): Promise<Activity[]> => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('type', type)
      .order('date', { ascending: false });
    if (error) throw error;
    return data as Activity[];
  },

  // Create a new activity
  create: async (activity: CreateActivity): Promise<Activity> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('activities')
      .insert({ ...activity, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Activity;
  },

  // Update an activity
  update: async (id: string, updates: Partial<CreateActivity>): Promise<Activity> => {
    const { data, error } = await supabase
      .from('activities')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Activity;
  },

  // Delete an activity (cascades to strength_sets and cardio_metrics)
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) throw error;
  },
};
