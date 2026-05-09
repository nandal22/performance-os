import { supabase } from '@/db/supabase';

export const SUPABASE_FREE_DB_BYTES = 500 * 1024 * 1024;
export const SUPABASE_FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

export const TRACKER_TABLES = [
  { name: 'activities', label: 'Activities', estimatedBytesPerRow: 900 },
  { name: 'strength_sets', label: 'Strength sets', estimatedBytesPerRow: 700 },
  { name: 'exercises', label: 'Exercises', estimatedBytesPerRow: 900 },
  { name: 'cardio_metrics', label: 'Cardio metrics', estimatedBytesPerRow: 600 },
  { name: 'body_metrics', label: 'Body metrics', estimatedBytesPerRow: 700 },
  { name: 'calorie_logs', label: 'Calorie logs', estimatedBytesPerRow: 700 },
  { name: 'daily_steps', label: 'Daily steps', estimatedBytesPerRow: 400 },
  { name: 'quick_foods', label: 'Quick foods', estimatedBytesPerRow: 650 },
  { name: 'guided_workout_drafts', label: 'Guided drafts', estimatedBytesPerRow: 1800 },
] as const;

export type TrackerTableName = (typeof TRACKER_TABLES)[number]['name'];

export interface TrackerTableHealth {
  name: TrackerTableName;
  label: string;
  rowCount: number | null;
  estimatedBytes: number;
  error?: string;
}

export interface TrackerRunwayEstimate {
  dbLimitBytes: number;
  estimatedDbBytes: number;
  estimatedDbPercent: number;
  estimatedDbRemainingBytes: number;
  storageLimitBytes: number;
  estimatedStorageBytes: number;
  estimatedStoragePercent: number;
  estimatedStorageRemainingBytes: number;
  note: string;
}

export interface TrackerDataHealthSnapshot {
  generatedAt: string;
  tables: TrackerTableHealth[];
  totalRows: number;
  failedTables: number;
  runway: TrackerRunwayEstimate;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Unable to load');
  }
  return 'Unable to load';
}

async function getTableHealth(table: (typeof TRACKER_TABLES)[number]): Promise<TrackerTableHealth> {
  try {
    const { count, error } = await supabase
      .from(table.name)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;

    const rowCount = count ?? 0;
    return {
      name: table.name,
      label: table.label,
      rowCount,
      estimatedBytes: rowCount * table.estimatedBytesPerRow,
    };
  } catch (error) {
    return {
      name: table.name,
      label: table.label,
      rowCount: null,
      estimatedBytes: 0,
      error: errorMessage(error),
    };
  }
}

function percentOfLimit(bytes: number, limitBytes: number): number {
  if (limitBytes <= 0) return 0;
  return Math.min(100, (bytes / limitBytes) * 100);
}

function buildRunway(estimatedDbBytes: number): TrackerRunwayEstimate {
  const estimatedStorageBytes = 0;

  return {
    dbLimitBytes: SUPABASE_FREE_DB_BYTES,
    estimatedDbBytes,
    estimatedDbPercent: percentOfLimit(estimatedDbBytes, SUPABASE_FREE_DB_BYTES),
    estimatedDbRemainingBytes: Math.max(0, SUPABASE_FREE_DB_BYTES - estimatedDbBytes),
    storageLimitBytes: SUPABASE_FREE_STORAGE_BYTES,
    estimatedStorageBytes,
    estimatedStoragePercent: percentOfLimit(estimatedStorageBytes, SUPABASE_FREE_STORAGE_BYTES),
    estimatedStorageRemainingBytes: SUPABASE_FREE_STORAGE_BYTES,
    note: 'Approximate from visible tracker row counts. Run the admin SQL in docs/SUPABASE_HEALTH.md for exact database and storage usage.',
  };
}

export const trackerDataHealthService = {
  async getSnapshot(): Promise<TrackerDataHealthSnapshot> {
    const tables = await Promise.all(TRACKER_TABLES.map(getTableHealth));
    const totalRows = tables.reduce((sum, table) => sum + (table.rowCount ?? 0), 0);
    const estimatedDbBytes = tables.reduce((sum, table) => sum + table.estimatedBytes, 0);

    return {
      generatedAt: new Date().toISOString(),
      tables,
      totalRows,
      failedTables: tables.filter(table => table.error).length,
      runway: buildRunway(estimatedDbBytes),
    };
  },
};
