import type { StrengthSet, ExerciseSummary, PRRecord } from '@/types';
import { epley1RM } from '@/lib/utils';

// StrengthSet with the parent activity's date attached
export interface SetWithDate extends StrengthSet {
  activity_date?: string;
}

/**
 * Aggregate per-exercise stats from a flat array of sets.
 * exerciseMap: { [exercise_id]: exercise_name }
 */
export function calcExerciseSummaries(
  sets: SetWithDate[],
  exerciseMap: Record<string, string>,
): ExerciseSummary[] {
  const byExercise = new Map<string, SetWithDate[]>();

  for (const set of sets) {
    const group = byExercise.get(set.exercise_id) ?? [];
    group.push(set);
    byExercise.set(set.exercise_id, group);
  }

  const summaries: ExerciseSummary[] = [];

  for (const [exerciseId, exSets] of byExercise) {
    const totalVolume = exSets.reduce((sum, s) => sum + (s.volume ?? 0), 0);
    const maxWeight   = Math.max(0, ...exSets.map(s => s.weight ?? 0));
    const best1RM     = Math.max(0, ...exSets.map(s =>
      s.weight && s.reps ? epley1RM(s.weight, s.reps) : 0,
    ));
    const dates = exSets
      .map(s => s.activity_date ?? '')
      .filter(Boolean)
      .sort();

    summaries.push({
      exercise_id:   exerciseId,
      exercise_name: exerciseMap[exerciseId] ?? 'Unknown',
      total_volume:  totalVolume,
      max_weight:    maxWeight,
      estimated_1rm: best1RM,
      set_count:     exSets.length,
      last_performed: dates[dates.length - 1] ?? '',
    });
  }

  return summaries.sort((a, b) => b.total_volume - a.total_volume);
}

/**
 * Find the all-time best set (highest estimated 1RM) per exercise.
 */
export function findPersonalRecords(
  sets: SetWithDate[],
  exerciseMap: Record<string, string>,
): PRRecord[] {
  const best = new Map<string, { set: SetWithDate; oneRM: number }>();

  for (const set of sets) {
    if (!set.weight || !set.reps) continue;
    const oneRM = epley1RM(set.weight, set.reps);
    const current = best.get(set.exercise_id);
    if (!current || oneRM > current.oneRM) {
      best.set(set.exercise_id, { set, oneRM });
    }
  }

  return Array.from(best.entries())
    .map(([exerciseId, { set, oneRM }]) => ({
      exercise_id:   exerciseId,
      exercise_name: exerciseMap[exerciseId] ?? 'Unknown',
      weight:        set.weight!,
      reps:          set.reps!,
      estimated_1rm: oneRM,
      achieved_on:   set.activity_date ?? '',
    }))
    .sort((a, b) => b.estimated_1rm - a.estimated_1rm);
}

/**
 * Plateau detection: returns true if the estimated 1RM for this exercise
 * hasn't improved more than 3% across the last 3 sessions.
 */
export function detectPlateau(sets: SetWithDate[], exerciseId: string): boolean {
  const exSets = sets
    .filter(s => s.exercise_id === exerciseId && s.activity_date)
    .sort((a, b) => (a.activity_date ?? '').localeCompare(b.activity_date ?? ''));

  if (exSets.length < 6) return false;

  // Best 1RM per session date
  const sessionBest = new Map<string, number>();
  for (const set of exSets) {
    if (!set.weight || !set.reps || !set.activity_date) continue;
    const oneRM = epley1RM(set.weight, set.reps);
    const prev  = sessionBest.get(set.activity_date) ?? 0;
    if (oneRM > prev) sessionBest.set(set.activity_date, oneRM);
  }

  const sessions = Array.from(sessionBest.values());
  if (sessions.length < 3) return false;

  const last3 = sessions.slice(-3);
  const max   = Math.max(...last3);
  const min   = Math.min(...last3);
  return max > 0 && (max - min) / max < 0.03;
}

/**
 * Weekly volume for a single exercise (for trend charting).
 * Returns an array sorted by week start date.
 */
export function weeklyVolumeForExercise(
  sets: SetWithDate[],
  exerciseId: string,
): { week: string; volume: number }[] {
  const filtered = sets.filter(s => s.exercise_id === exerciseId && s.activity_date);

  const weekMap = new Map<string, number>();
  for (const set of filtered) {
    const d    = new Date(set.activity_date!);
    const day  = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const week = d.toISOString().slice(0, 10);
    weekMap.set(week, (weekMap.get(week) ?? 0) + (set.volume ?? 0));
  }

  return Array.from(weekMap.entries())
    .map(([week, volume]) => ({ week, volume }))
    .sort((a, b) => a.week.localeCompare(b.week));
}
