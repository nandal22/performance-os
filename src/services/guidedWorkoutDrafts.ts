import { supabase } from '@/db/supabase';

export type GuidedWorkoutDraftStorageMode = 'database' | 'local';

export interface GuidedWorkoutDraft<TProgress = unknown> {
  id: string;
  date: string;
  day: number;
  progress: TProgress;
  createdAt: string;
  updatedAt: string;
}

interface GuidedWorkoutDraftRow {
  id: string;
  user_id: string;
  date: string;
  plan_day: number | string;
  progress: unknown;
  created_at: string;
  updated_at: string;
}

let storageMode: GuidedWorkoutDraftStorageMode = 'database';

function toDraft<TProgress>(row: GuidedWorkoutDraftRow): GuidedWorkoutDraft<TProgress> {
  return {
    id: row.id,
    date: row.date,
    day: Number(row.plan_day),
    progress: row.progress as TProgress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export const guidedWorkoutDraftsService = {
  getStorageMode(): GuidedWorkoutDraftStorageMode {
    return storageMode;
  },

  async get<TProgress>(date: string, day: number): Promise<GuidedWorkoutDraft<TProgress> | null> {
    try {
      const { data, error } = await supabase
        .from('guided_workout_drafts')
        .select('*')
        .eq('date', date)
        .eq('plan_day', day)
        .maybeSingle();
      if (error) throw error;

      storageMode = 'database';
      return data ? toDraft<TProgress>(data as GuidedWorkoutDraftRow) : null;
    } catch {
      storageMode = 'local';
      return null;
    }
  },

  async upsert<TProgress>(date: string, day: number, progress: TProgress): Promise<boolean> {
    try {
      const userId = await getUserId();
      const { error } = await supabase
        .from('guided_workout_drafts')
        .upsert({
          user_id: userId,
          date,
          plan_day: day,
          progress,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,date,plan_day' });
      if (error) throw error;

      storageMode = 'database';
      return true;
    } catch {
      storageMode = 'local';
      return false;
    }
  },

  async remove(date: string, day: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('guided_workout_drafts')
        .delete()
        .eq('date', date)
        .eq('plan_day', day);
      if (error) throw error;

      storageMode = 'database';
      return true;
    } catch {
      storageMode = 'local';
      return false;
    }
  },
};
