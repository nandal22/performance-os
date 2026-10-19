import { supabase } from '@/db/supabase';
import { peekQuery, readQuery } from '@/lib/queryCache';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import type { StrengthSet } from '@/types';

export const PROGRESS_CARDS_KEY = 'progress:cards';

export interface ProgressSet {
  weight: number;
  reps: number;
  set_number: number;
}

export interface ProgressCard {
  exercise_id: string;
  exercise_name: string;
  last_date: string | null;
  previous_max: number | null;
  pr_weight: number | null;
  pr_reps: number | null;
  last_sets: ProgressSet[];
  sparkline: { date: string; weight: number }[];
}

const MAIN_LIFTS = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Dumbbell Overhead Press',
  'Barbell Row',
  'Romanian Deadlift',
  'Incline Bench Press',
  'Pull-up',
  'Leg Press',
  'Hip Thrust',
];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function asCards(value: unknown): ProgressCard[] {
  if (!Array.isArray(value)) return [];
  return value.map(row => {
    const card = row as ProgressCard;
    return {
      ...card,
      previous_max: card.previous_max == null ? null : Number(card.previous_max),
      pr_weight: card.pr_weight == null ? null : Number(card.pr_weight),
      pr_reps: card.pr_reps == null ? null : Number(card.pr_reps),
      last_sets: (card.last_sets ?? []).map(set => ({
        weight: Number(set.weight ?? 0),
        reps: Number(set.reps ?? 0),
        set_number: Number(set.set_number ?? 0),
      })),
      sparkline: (card.sparkline ?? []).map(point => ({
        date: point.date,
        weight: Number(point.weight ?? 0),
      })),
    };
  });
}

function missingRpc(error: { code?: string; message?: string }) {
  return error.code === 'PGRST202'
    || /get_progress_cards/.test(error.message ?? '')
    || /could not find the function/i.test(error.message ?? '');
}

async function fallbackCards(): Promise<ProgressCard[]> {
  const exercises = await exercisesService.getAll();
  const matched = MAIN_LIFTS
    .map(name => exercises.find(exercise => normalizeName(exercise.name) === normalizeName(name)))
    .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));
  const rawSets = await strengthSetsService.getByExercises(matched.map(exercise => exercise.id), 2000);
  const byExercise = new Map<string, StrengthSet[]>();
  for (const set of rawSets) {
    const group = byExercise.get(set.exercise_id) ?? [];
    group.push(set);
    byExercise.set(set.exercise_id, group);
  }

  return matched.map(exercise => {
    const sets = (byExercise.get(exercise.id) ?? []).filter(set => (set.weight ?? 0) > 0);
    const byDate = new Map<string, ProgressSet[]>();
    for (const set of sets) {
      const date = (set as StrengthSet & { activity?: { date?: string } }).activity?.date ?? '';
      if (!date) continue;
      const group = byDate.get(date) ?? [];
      group.push({
        weight: Number(set.weight ?? 0),
        reps: Number(set.reps ?? 0),
        set_number: Number(set.set_number ?? 0),
      });
      byDate.set(date, group);
    }
    const dates = [...byDate.keys()].sort();
    const lastDate = dates.at(-1) ?? null;
    const previousDate = dates.at(-2) ?? null;
    const lastSets = lastDate ? (byDate.get(lastDate) ?? []).sort((a, b) => a.set_number - b.set_number) : [];
    const previousSets = previousDate ? byDate.get(previousDate) ?? [] : [];
    let prWeight = 0;
    let prReps = 0;
    for (const date of [...dates].reverse()) {
      for (const set of byDate.get(date) ?? []) {
        if (set.weight > prWeight) {
          prWeight = set.weight;
          prReps = set.reps;
        }
      }
    }
    return {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      last_date: lastDate,
      previous_max: previousSets.length ? Math.max(...previousSets.map(set => set.weight)) : null,
      pr_weight: prWeight > 0 ? prWeight : null,
      pr_reps: prWeight > 0 ? prReps : null,
      last_sets: lastSets,
      sparkline: dates.slice(-8).map(date => ({
        date,
        weight: Math.max(...(byDate.get(date) ?? []).map(set => set.weight)),
      })),
    };
  });
}

export function peekProgressCards(): ProgressCard[] | undefined {
  return peekQuery<ProgressCard[]>(PROGRESS_CARDS_KEY);
}

export function loadProgressCards(): Promise<ProgressCard[]> {
  return readQuery(PROGRESS_CARDS_KEY, 60_000, async () => {
    const { data, error } = await supabase.rpc('get_progress_cards');
    if (error) {
      if (missingRpc(error)) return fallbackCards();
      throw error;
    }
    return asCards(data);
  });
}
