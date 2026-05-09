import { supabase } from '@/db/supabase';
import { toISODate } from '@/lib/utils';

const STORAGE_KEY = 'perf-os-daily-steps';

export type DailyStepsStorageMode = 'database' | 'local';

export interface DailyStepsLog {
  id?: string;
  date: string;
  steps: number;
  updatedAt: string;
}

interface DailyStepsRow {
  id: string;
  user_id: string;
  date: string;
  steps: number | string | null;
  updated_at: string;
}

let storageMode: DailyStepsStorageMode = 'database';

function toNumber(value: unknown) {
  return Math.max(0, Math.round(Number.parseFloat(String(value ?? 0)) || 0));
}

function toDailyStepsLog(row: DailyStepsRow): DailyStepsLog {
  return {
    id: row.id,
    date: row.date,
    steps: toNumber(row.steps),
    updatedAt: row.updated_at,
  };
}

function sanitizeLocal(item: unknown): DailyStepsLog | null {
  if (typeof item !== 'object' || item === null) return null;
  const log = item as Partial<DailyStepsLog> & { updated_at?: string };
  const date = typeof log.date === 'string' ? log.date : '';
  if (!date) return null;

  return {
    id: typeof log.id === 'string' ? log.id : undefined,
    date,
    steps: toNumber(log.steps),
    updatedAt: typeof log.updatedAt === 'string' ? log.updatedAt : log.updated_at ?? new Date().toISOString(),
  };
}

function readAllLocal(): DailyStepsLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeLocal)
      .filter((item): item is DailyStepsLog => Boolean(item));
  } catch {
    return [];
  }
}

function writeAllLocal(logs: DailyStepsLog[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

function cacheLog(log: DailyStepsLog) {
  writeAllLocal([...readAllLocal().filter(item => item.date !== log.date), log]);
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

async function upsertRemote(userId: string, log: DailyStepsLog): Promise<DailyStepsLog> {
  const { data, error } = await supabase
    .from('daily_steps')
    .upsert({
      user_id: userId,
      date: log.date,
      steps: log.steps,
      updated_at: log.updatedAt,
    }, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (error) throw error;

  return toDailyStepsLog(data as DailyStepsRow);
}

export const dailyStepsService = {
  getStorageMode(): DailyStepsStorageMode {
    return storageMode;
  },

  async get(date = toISODate(new Date())): Promise<DailyStepsLog | null> {
    try {
      const { data, error } = await supabase
        .from('daily_steps')
        .select('*')
        .eq('date', date)
        .maybeSingle();
      if (error) throw error;

      let log = data ? toDailyStepsLog(data as DailyStepsRow) : null;
      const local = readAllLocal().find(item => item.date === date);
      if (!log && local) {
        const userId = await getUserId();
        log = await upsertRemote(userId, local);
      }

      storageMode = 'database';
      if (log) cacheLog(log);
      return log;
    } catch {
      storageMode = 'local';
      return readAllLocal().find(log => log.date === date) ?? null;
    }
  },

  async upsert(date: string, steps: number): Promise<DailyStepsLog> {
    const next: DailyStepsLog = {
      date,
      steps: toNumber(steps),
      updatedAt: new Date().toISOString(),
    };

    try {
      const userId = await getUserId();
      const saved = await upsertRemote(userId, next);
      storageMode = 'database';
      cacheLog(saved);
      return saved;
    } catch {
      storageMode = 'local';
      cacheLog(next);
      return next;
    }
  },
};
