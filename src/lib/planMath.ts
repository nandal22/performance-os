import { calcCardioCalories, calcStrengthCalories } from '@/engines/calorieEngine';
import type { CardioTarget, LoadType, PlannedLoad } from '@/services/plans';

export interface PlanTarget {
  target_reps_min: number;
  target_reps_max: number;
  target_weight_kg: number | null;
  target_rir_max: number | null;
}

export interface LoggedSet {
  reps: number;
  weight: number | null;
}

/** Plan targets for per_dumbbell exercises are one dumbbell; the log stores the pair. */
export function loggedWeightFor(target: number, loadType: LoadType) {
  return loadType === 'per_dumbbell' ? target * 2 : target;
}

export function perDumbbell(weight: number) {
  return Math.round((weight / 2) * 100) / 100;
}

export function targetWeightLabel(target: number | null, loadType: LoadType) {
  if (target == null) return '';
  return loadType === 'per_dumbbell' ? `${Number(target)} kg / DB` : `${Number(target)} kg`;
}

export function prefillFromTarget(target: PlanTarget, loadType: LoadType = 'total') {
  const rpe = target.target_rir_max == null ? '' : String(Math.round((10 - Number(target.target_rir_max)) * 10) / 10);
  return {
    reps: String(target.target_reps_max),
    weight: target.target_weight_kg == null ? '' : String(loggedWeightFor(Number(target.target_weight_kg), loadType)),
    rpe,
  };
}

export function setOutcome(target: PlanTarget, actual: LoggedSet | null, loadType: LoadType = 'total'): 'hit' | 'miss' | 'skipped' {
  if (!actual) return 'skipped';
  const reps = Number(actual.reps);
  const repsOk = reps >= Number(target.target_reps_min) && reps <= Number(target.target_reps_max);
  const weightOk = target.target_weight_kg == null
    || Math.abs(Number(actual.weight ?? 0) - loggedWeightFor(Number(target.target_weight_kg), loadType)) < 0.05;
  return repsOk && weightOk ? 'hit' : 'miss';
}

export function repsLabel(target: PlanTarget) {
  if (Number(target.target_reps_min) === Number(target.target_reps_max)) return `${target.target_reps_max} reps`;
  return `${target.target_reps_min}–${target.target_reps_max} reps`;
}

export function cardioTargetLabel(target: CardioTarget) {
  return [
    target.target_duration_min != null ? `${Number(target.target_duration_min)} min` : null,
    target.target_incline_pct != null ? `${Number(target.target_incline_pct)}% incline` : null,
    target.target_speed_kmh != null ? `${Number(target.target_speed_kmh)} km/h` : null,
    target.target_kcal != null ? `${target.target_kcal} kcal` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Cardio kcal: the coach's target_kcal when given, otherwise the app's cardio
 * estimate (speed-based MET when a speed is planned). Incline is not modelled.
 */
export function cardioTargetCalories(target: CardioTarget, bodyWeightKg: number | null, label = '') {
  if (target.target_kcal != null) return Number(target.target_kcal);
  const minutes = Number(target.target_duration_min ?? 0);
  if (!bodyWeightKg || minutes <= 0) return null;
  const distance = target.target_speed_kmh != null ? (Number(target.target_speed_kmh) * minutes) / 60 : undefined;
  return calcCardioCalories({ duration: minutes, distance, notes: label }, bodyWeightKg).calories;
}

/**
 * Planned burn, using the same strength estimate as a logged workout: every
 * planned set at its top rep target and its target load (the pair for dumbbells).
 */
export function estimatePlanCalories(planned: PlannedLoad[], bodyWeightKg: number | null): number | null {
  if (!bodyWeightKg || bodyWeightKg <= 0) return null;
  const sets = planned
    .filter(exercise => !exercise.is_cardio)
    .flatMap(exercise => exercise.sets.map(set => ({
      reps: Number(set.target_reps_max),
      weight: set.target_weight_kg == null ? 0 : loggedWeightFor(Number(set.target_weight_kg), exercise.load_type),
    })));
  const strength = sets.length > 0 ? calcStrengthCalories({ sets }, bodyWeightKg).calories : 0;
  const cardio = planned
    .filter(exercise => exercise.is_cardio)
    .reduce((sum, exercise) => sum + (cardioTargetCalories(exercise, bodyWeightKg) ?? 0), 0);
  const total = strength + cardio;
  return total > 0 ? Math.round(total) : null;
}
