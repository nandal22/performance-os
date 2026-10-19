import { supabase } from '@/db/supabase';
import { invalidateQueries, readQuery } from '@/lib/queryCache';

export type PlanStatus = 'planned' | 'in_progress' | 'done' | 'skipped';

export interface PlanSummary {
  id: string;
  plan_date: string;
  day_type: string;
  title: string | null;
  notes: string | null;
  status: PlanStatus;
  activity_id: string | null;
  exercise_count: number;
}

export interface PlanSet {
  id: string;
  set_number: number;
  set_type: 'warmup' | 'top' | 'backoff' | 'straight';
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: number | null;
  target_rir_min: number | null;
  target_rir_max: number | null;
  rest_seconds: number | null;
  note: string | null;
}

export interface PlanExercise {
  id: string;
  position: number;
  exercise_id: string;
  exercise_name: string;
  superset_group: string | null;
  note: string | null;
  sets: PlanSet[];
}

export interface WorkoutPlan extends PlanSummary {
  exercises: PlanExercise[];
}

export interface Guidance {
  exercise_id: string;
  setup: string | null;
  movement: string | null;
  common_mistakes: string | null;
  image_urls: string[];
  video_url: string | null;
  source: string | null;
  license: string | null;
}

export interface ComparedSet {
  id: string;
  set_number: number;
  set_type: PlanSet['set_type'];
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: number | null;
  target_rir_min: number | null;
  target_rir_max: number | null;
  actual: { reps: number; weight: number | null; rpe: number | null } | null;
}

export interface ComparedExercise {
  name: string;
  position: number;
  sets: ComparedSet[];
}

export interface PlanComparison {
  day_type: string;
  plan_date: string;
  exercises: ComparedExercise[];
}

const PLANS_KEY = 'plans:list';

function missingTable(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? '';
  return error?.code === 'PGRST205' || error?.code === 'PGRST200' || /workout_plans|plan_exercises|exercise_guidance/.test(message);
}

function asNumber(value: unknown) {
  if (value == null || value === '') return null;
  return Number(value);
}

function mapSummary(row: {
  id: string;
  plan_date: string;
  day_type: string;
  title: string | null;
  notes: string | null;
  status: PlanStatus;
  activity_id: string | null;
  plan_exercises?: { id: string }[] | null;
}): PlanSummary {
  return {
    id: row.id,
    plan_date: row.plan_date,
    day_type: row.day_type,
    title: row.title,
    notes: row.notes,
    status: row.status,
    activity_id: row.activity_id,
    exercise_count: row.plan_exercises?.length ?? 0,
  };
}

async function loadPlans(): Promise<PlanSummary[]> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, plan_date, day_type, title, notes, status, activity_id, plan_exercises(id)')
    .order('plan_date', { ascending: true });
  if (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map(row => mapSummary(row as Parameters<typeof mapSummary>[0]));
}

function mapPlan(row: Record<string, unknown>): WorkoutPlan {
  const exercises = ((row.plan_exercises as Record<string, unknown>[]) ?? [])
    .slice()
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(exercise => ({
      id: String(exercise.id),
      position: Number(exercise.position),
      exercise_id: String(exercise.exercise_id),
      exercise_name: ((exercise.exercise as { name?: string } | null)?.name) ?? 'Exercise',
      superset_group: (exercise.superset_group as string | null) ?? null,
      note: (exercise.note as string | null) ?? null,
      sets: ((exercise.plan_sets as Record<string, unknown>[]) ?? [])
        .slice()
        .sort((a, b) => Number(a.set_number) - Number(b.set_number))
        .map(set => ({
          id: String(set.id),
          set_number: Number(set.set_number),
          set_type: set.set_type as PlanSet['set_type'],
          target_reps_min: Number(set.target_reps_min),
          target_reps_max: Number(set.target_reps_max),
          target_weight_kg: asNumber(set.target_weight_kg),
          target_rir_min: asNumber(set.target_rir_min),
          target_rir_max: asNumber(set.target_rir_max),
          rest_seconds: asNumber(set.rest_seconds),
          note: (set.note as string | null) ?? null,
        })),
    }));
  return {
    ...mapSummary(row as Parameters<typeof mapSummary>[0]),
    exercises,
  };
}

const PLAN_COLUMNS = `
  id, plan_date, day_type, title, notes, status, activity_id,
  plan_exercises (
    id, position, exercise_id, superset_group, note,
    exercise:exercises (name),
    plan_sets (
      id, set_number, set_type, target_reps_min, target_reps_max,
      target_weight_kg, target_rir_min, target_rir_max, rest_seconds, note
    )
  )
`;

export function featuredPlan(plans: PlanSummary[], today: string) {
  return plans.find(plan => plan.plan_date === today)
    ?? plans.find(plan => plan.plan_date > today && plan.status !== 'skipped')
    ?? null;
}

export const plansService = {
  list: () => readQuery(PLANS_KEY, 60_000, loadPlans),

  featured: async (today = new Date().toISOString().slice(0, 10)) => {
    const plans = await plansService.list();
    return featuredPlan(plans, today);
  },

  get: async (id: string): Promise<WorkoutPlan | null> => {
    const { data, error } = await supabase
      .from('workout_plans')
      .select(PLAN_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      if (missingTable(error)) return null;
      throw error;
    }
    if (!data) return null;
    return mapPlan(data as unknown as Record<string, unknown>);
  },

  start: async (id: string) => {
    const { error } = await supabase
      .from('workout_plans')
      .update({ status: 'in_progress' })
      .eq('id', id)
      .eq('status', 'planned');
    if (error && !missingTable(error)) throw error;
    invalidateQueries('plans:');
  },

  guidance: async (exerciseId: string): Promise<Guidance | null> => {
    const { data, error } = await supabase
      .from('exercise_guidance')
      .select('exercise_id, setup, movement, common_mistakes, image_urls, video_url, source, license')
      .eq('exercise_id', exerciseId)
      .maybeSingle();
    if (error) {
      if (missingTable(error)) return null;
      throw error;
    }
    return (data as Guidance | null) ?? null;
  },

  comparison: async (activityId: string): Promise<PlanComparison | null> => {
    const { data, error } = await supabase
      .from('workout_plans')
      .select(`
        day_type, plan_date,
        plan_exercises (
          position,
          exercise:exercises (name),
          plan_sets (
            id, set_number, set_type, target_reps_min, target_reps_max,
            target_weight_kg, target_rir_min, target_rir_max,
            strength_sets (reps, weight, rpe)
          )
        )
      `)
      .eq('activity_id', activityId)
      .maybeSingle();
    if (error) {
      if (missingTable(error)) return null;
      throw error;
    }
    if (!data) return null;
    const row = data as unknown as {
      day_type: string;
      plan_date: string;
      plan_exercises: Array<{
        position: number;
        exercise: { name: string } | null;
        plan_sets: Array<Record<string, unknown>>;
      }>;
    };
    return {
      day_type: row.day_type,
      plan_date: row.plan_date,
      exercises: (row.plan_exercises ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map(exercise => ({
          name: exercise.exercise?.name ?? 'Exercise',
          position: exercise.position,
          sets: (exercise.plan_sets ?? [])
            .slice()
            .sort((a, b) => Number(a.set_number) - Number(b.set_number))
            .map(set => {
              const actuals = (set.strength_sets as Array<{ reps: number; weight: number | null; rpe: number | null }> | null) ?? [];
              const actual = actuals[0];
              return {
                id: String(set.id),
                set_number: Number(set.set_number),
                set_type: set.set_type as ComparedSet['set_type'],
                target_reps_min: Number(set.target_reps_min),
                target_reps_max: Number(set.target_reps_max),
                target_weight_kg: asNumber(set.target_weight_kg),
                target_rir_min: asNumber(set.target_rir_min),
                target_rir_max: asNumber(set.target_rir_max),
                actual: actual ? { reps: Number(actual.reps), weight: asNumber(actual.weight), rpe: asNumber(actual.rpe) } : null,
              };
            }),
        })),
    };
  },
};
