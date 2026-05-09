import { toISODate } from '@/lib/utils';

const STORAGE_KEY = 'perf-os-calorie-logs';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

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

export interface CalorieSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type CreateCalorieLog = Omit<CalorieLog, 'id' | 'createdAt'>;

function readAll(): CalorieLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CalorieLog =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.date === 'string' &&
      typeof item.meal === 'string' &&
      typeof item.name === 'string' &&
      typeof item.calories === 'number'
    );
  } catch {
    return [];
  }
}

function writeAll(logs: CalorieLog[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
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

export const calorieLogsService = {
  getByDate(date = toISODate(new Date())): CalorieLog[] {
    return readAll()
      .filter(log => log.date === date)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  getSummary(date = toISODate(new Date())): CalorieSummary {
    return summarize(calorieLogsService.getByDate(date));
  },

  create(input: CreateCalorieLog): CalorieLog {
    const next: CalorieLog = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    writeAll([...readAll(), next]);
    return next;
  },

  delete(id: string) {
    writeAll(readAll().filter(log => log.id !== id));
  },
};
