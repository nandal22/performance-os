import { supabase } from '@/db/supabase';
import type { CreateSpeechPracticeSession, SpeechPracticeSession } from '@/types';
import { toISODate } from '@/lib/utils';

interface SpeechPracticeRow {
  id: string;
  user_id: string;
  date: string;
  completed_drills: string[] | null;
  minutes: number | string | null;
  clarity_rating?: number | string | null;
  pace_rating?: number | string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSession(row: SpeechPracticeRow): SpeechPracticeSession {
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    completed_drills: Array.isArray(row.completed_drills) ? row.completed_drills : [],
    minutes: toNumber(row.minutes, 8),
    clarity_rating: row.clarity_rating == null ? undefined : toNumber(row.clarity_rating),
    pace_rating: row.pace_rating == null ? undefined : toNumber(row.pace_rating),
    note: row.note ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

export const speechPracticeService = {
  async getRecent(limit = 30): Promise<SpeechPracticeSession[]> {
    const { data, error } = await supabase
      .from('speech_practice_sessions')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as SpeechPracticeRow[]).map(toSession);
  },

  async getByDate(date = toISODate(new Date())): Promise<SpeechPracticeSession | null> {
    const { data, error } = await supabase
      .from('speech_practice_sessions')
      .select('*')
      .eq('date', date)
      .maybeSingle();
    if (error) throw error;
    return data ? toSession(data as SpeechPracticeRow) : null;
  },

  async upsert(input: CreateSpeechPracticeSession): Promise<SpeechPracticeSession> {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('speech_practice_sessions')
      .upsert({
        ...input,
        user_id: userId,
        completed_drills: input.completed_drills ?? [],
        note: input.note?.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' })
      .select()
      .single();
    if (error) throw error;
    return toSession(data as SpeechPracticeRow);
  },
};
