import { toISODate } from '@/lib/utils';

const STORAGE_KEY = 'perf-os-daily-steps';

export interface DailyStepsLog {
  date: string;
  steps: number;
  updatedAt: string;
}

function readAll(): DailyStepsLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DailyStepsLog =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.date === 'string' &&
      typeof item.steps === 'number' &&
      typeof item.updatedAt === 'string',
    );
  } catch {
    return [];
  }
}

function writeAll(logs: DailyStepsLog[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export const dailyStepsService = {
  get(date = toISODate(new Date())): DailyStepsLog | null {
    return readAll().find(log => log.date === date) ?? null;
  },

  upsert(date: string, steps: number): DailyStepsLog {
    const next: DailyStepsLog = {
      date,
      steps: Math.max(0, Math.round(steps)),
      updatedAt: new Date().toISOString(),
    };
    writeAll([...readAll().filter(log => log.date !== date), next]);
    return next;
  },
};
