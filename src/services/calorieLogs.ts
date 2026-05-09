import { supabase } from '@/db/supabase';
import { toISODate } from '@/lib/utils';

const STORAGE_KEY = 'perf-os-calorie-logs';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type CalorieStorageMode = 'database' | 'local';

export interface CalorieLog {
  id: string;
  date: string;
  meal: MealType;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
}

interface CalorieLogRow {
  id: string;
  user_id: string;
  date: string;
  meal: MealType;
  name: string;
  calories: number | string | null;
  protein: number | string | null;
  carbs: number | string | null;
  fat: number | string | null;
  created_at: string;
}

export interface CalorieSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type CreateCalorieLog = Omit<CalorieLog, 'id' | 'createdAt'>;

let storageMode: CalorieStorageMode = 'database';

function toNumber(value: unknown) {
  return Math.max(0, Number.parseFloat(String(value ?? 0)) || 0);
}

function toCalorieLog(row: CalorieLogRow): CalorieLog {
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    name: row.name,
    calories: toNumber(row.calories),
    protein: toNumber(row.protein),
    carbs: toNumber(row.carbs),
    fat: toNumber(row.fat),
    createdAt: row.created_at,
  };
}

function isMealType(value: unknown): value is MealType {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack';
}

function sanitizeLocal(item: unknown): CalorieLog | null {
  if (typeof item !== 'object' || item === null) return null;
  const log = item as Partial<CalorieLog> & { created_at?: string };
  const name = typeof log.name === 'string' ? log.name.trim() : '';
  const id = typeof log.id === 'string' ? log.id : '';
  const date = typeof log.date === 'string' ? log.date : '';
  if (!id || !date || !name || !isMealType(log.meal)) return null;

  return {
    id,
    date,
    meal: log.meal,
    name,
    calories: toNumber(log.calories),
    protein: toNumber(log.protein),
    carbs: toNumber(log.carbs),
    fat: toNumber(log.fat),
    createdAt: typeof log.createdAt === 'string' ? log.createdAt : log.created_at ?? new Date().toISOString(),
  };
}

function readAllLocal(): CalorieLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeLocal)
      .filter((item): item is CalorieLog => Boolean(item));
  } catch {
    return [];
  }
}

function writeAllLocal(logs: CalorieLog[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

function cacheLog(log: CalorieLog) {
  writeAllLocal([...readAllLocal().filter(item => item.id !== log.id), log]);
}

function replaceLocalDate(date: string, logs: CalorieLog[]) {
  writeAllLocal([
    ...readAllLocal().filter(log => log.date !== date),
    ...logs,
  ]);
}

function summarize(logs: CalorieLog[]): CalorieSummary {
  return logs.reduce<CalorieSummary>(
    (sum, log) => ({
      calories: sum.calories + log.calories,
      protein: sum.protein + log.protein,
      carbs: sum.carbs + log.carbs,
      fat: sum.fat + log.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

async function insertRemoteLogs(userId: string, logs: CalorieLog[]): Promise<CalorieLog[]> {
  if (logs.length === 0) return [];

  const { data, error } = await supabase
    .from('calorie_logs')
    .upsert(
      logs.map(log => ({
        id: log.id,
        user_id: userId,
        date: log.date,
        meal: log.meal,
        name: log.name,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
        created_at: log.createdAt,
      })),
      { onConflict: 'id' },
    )
    .select();
  if (error) throw error;

  return ((data ?? []) as CalorieLogRow[]).map(toCalorieLog);
}

export const calorieLogsService = {
  getStorageMode(): CalorieStorageMode {
    return storageMode;
  },

  async getByDate(date = toISODate(new Date())): Promise<CalorieLog[]> {
    try {
      const { data, error } = await supabase
        .from('calorie_logs')
        .select('*')
        .eq('date', date)
        .order('created_at', { ascending: true });
      if (error) throw error;

      let logs = ((data ?? []) as CalorieLogRow[]).map(toCalorieLog);
      const remoteIds = new Set(logs.map(log => log.id));
      const localOnly = readAllLocal().filter(log => log.date === date && !remoteIds.has(log.id));
      if (localOnly.length > 0) {
        const userId = await getUserId();
        const migrated = await insertRemoteLogs(userId, localOnly);
        logs = [...logs, ...migrated].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }

      storageMode = 'database';
      replaceLocalDate(date, logs);
      return logs;
    } catch {
      storageMode = 'local';
      return readAllLocal()
        .filter(log => log.date === date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  },

  async getSummary(date = toISODate(new Date())): Promise<CalorieSummary> {
    return summarize(await calorieLogsService.getByDate(date));
  },

  async create(input: CreateCalorieLog): Promise<CalorieLog> {
    const next: CalorieLog = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    try {
      const userId = await getUserId();
      const [saved = next] = await insertRemoteLogs(userId, [next]);
      storageMode = 'database';
      cacheLog(saved);
      return saved;
    } catch {
      storageMode = 'local';
      cacheLog(next);
      return next;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('calorie_logs').delete().eq('id', id);
      if (error) throw error;
      storageMode = 'database';
    } catch {
      storageMode = 'local';
    } finally {
      writeAllLocal(readAllLocal().filter(log => log.id !== id));
    }
  },
};
