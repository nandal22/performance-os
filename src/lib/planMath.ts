import { calcCardioCalories, calcStrengthCalories, type StrengthSetInput } from '@/engines/calorieEngine';
import type { CardioTarget, LoadType, Measure, PlannedLoad } from '@/services/plans';

export interface PlanTarget {
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_duration_sec_min?: number | null;
  target_duration_sec_max?: number | null;
  target_weight_kg: number | null;
  target_rir_max: number | null;
}

/** A logged set. weight is always the total load (body weight + added for bodyweight moves). */
export interface LoggedSet {
  reps: number | null;
  weight: number | null;
  added_weight_kg?: number | null;
  bodyweight_kg?: number | null;
  duration_sec?: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Seconds range of a timed target. Plans written before seconds existed carried the
 * seconds in the reps fields, so those are read as seconds for a timed exercise.
 */
export function targetSeconds(target: PlanTarget, measure: Measure = 'reps'): { min: number; max: number } | null {
  const min = target.target_duration_sec_min ?? target.target_duration_sec_max;
  const max = target.target_duration_sec_max ?? target.target_duration_sec_min;
  if (min != null && max != null) return { min: Number(min), max: Number(max) };
  if (measure === 'time' && target.target_reps_min != null && target.target_reps_max != null) {
    return { min: Number(target.target_reps_min), max: Number(target.target_reps_max) };
  }
  return null;
}

export function isTimedTarget(target: PlanTarget, measure: Measure = 'reps') {
  return targetSeconds(target, measure) != null;
}

/**
 * Total load the log stores for a plan target: the pair for per_dumbbell (target is one
 * dumbbell), body weight + added for bodyweight (target is the added load, null = BW).
 */
export function loggedWeightFor(target: number | null, loadType: LoadType, bodyweightKg: number | null = null) {
  if (loadType === 'bodyweight') return round2((bodyweightKg ?? 0) + Number(target ?? 0));
  return loadType === 'per_dumbbell' ? Number(target) * 2 : Number(target);
}

export function perDumbbell(weight: number) {
  return Math.round((weight / 2) * 100) / 100;
}

/** 'BW' or 'BW + 15 kg' for bodyweight moves; 'X kg / DB' per dumbbell; 'X kg' otherwise. */
export function bodyweightLabel(added: number | null | undefined) {
  const kg = Number(added ?? 0);
  return kg >= 0.05 ? `BW + ${round2(kg)} kg` : 'BW';
}

export function targetWeightLabel(target: number | null, loadType: LoadType) {
  if (loadType === 'bodyweight') return bodyweightLabel(target);
  if (target == null) return '';
  return loadType === 'per_dumbbell' ? `${Number(target)} kg / DB` : `${Number(target)} kg`;
}

/** Added load of a logged bodyweight set, from the split columns or derived from the total. */
export function addedLoadOf(actual: LoggedSet): number | null {
  if (actual.added_weight_kg != null) return Number(actual.added_weight_kg);
  if (actual.bodyweight_kg != null && actual.weight != null) {
    const added = Number(actual.weight) - Number(actual.bodyweight_kg);
    return added < 0.5 ? 0 : round2(added);
  }
  return null;
}

export function secondsLabel(min: number, max: number) {
  return min === max ? `${max} s` : `${min}–${max} s`;
}

export function prefillFromTarget(target: PlanTarget, loadType: LoadType = 'total', measure: Measure = 'reps') {
  const rpe = target.target_rir_max == null ? '' : String(Math.round((10 - Number(target.target_rir_max)) * 10) / 10);
  const seconds = targetSeconds(target, measure);
  const weight = target.target_weight_kg == null
    ? ''
    : loadType === 'bodyweight'
      // The field holds the added load; BW alone stays empty.
      ? (Number(target.target_weight_kg) >= 0.05 ? String(Number(target.target_weight_kg)) : '')
      : String(loggedWeightFor(Number(target.target_weight_kg), loadType));
  return {
    reps: seconds || target.target_reps_max == null ? '' : String(target.target_reps_max),
    seconds: seconds ? String(seconds.max) : '',
    weight,
    rpe,
  };
}

export function setOutcome(
  target: PlanTarget,
  actual: LoggedSet | null,
  loadType: LoadType = 'total',
  measure: Measure = 'reps',
): 'hit' | 'miss' | 'skipped' {
  if (!actual) return 'skipped';
  const seconds = targetSeconds(target, measure);
  let countOk: boolean;
  if (seconds) {
    // Holding longer than planned is still a hit.
    const held = Number(actual.duration_sec ?? actual.reps ?? 0);
    countOk = held >= seconds.min;
  } else {
    const reps = Number(actual.reps ?? 0);
    countOk = reps >= Number(target.target_reps_min) && reps <= Number(target.target_reps_max);
  }
  let weightOk: boolean;
  if (loadType === 'bodyweight') {
    const added = addedLoadOf(actual) ?? 0;
    weightOk = target.target_weight_kg == null
      ? added < 0.05
      : Math.abs(added - Number(target.target_weight_kg)) < 0.05;
  } else {
    weightOk = target.target_weight_kg == null
      || Math.abs(Number(actual.weight ?? 0) - loggedWeightFor(Number(target.target_weight_kg), loadType)) < 0.05;
  }
  return countOk && weightOk ? 'hit' : 'miss';
}

/** '8–10 reps' or '45–60 s'. */
export function repsLabel(target: PlanTarget, measure: Measure = 'reps') {
  const seconds = targetSeconds(target, measure);
  if (seconds) return secondsLabel(seconds.min, seconds.max);
  if (Number(target.target_reps_min) === Number(target.target_reps_max)) return `${target.target_reps_max} reps`;
  return `${target.target_reps_min}–${target.target_reps_max} reps`;
}

/** '8 reps', '60 s', with 'BW + 15 kg' / '24 kg / DB' / '80 kg' load. */
export function loggedSetLabel(actual: LoggedSet, loadType: LoadType = 'total') {
  const count = actual.duration_sec != null && !(actual.reps && actual.reps > 0)
    ? `${actual.duration_sec} s`
    : `${actual.reps ?? 0} reps`;
  if (loadType === 'bodyweight') {
    const added = addedLoadOf(actual);
    return `${count} · ${added == null && actual.weight != null ? `${Number(actual.weight)} kg` : bodyweightLabel(added)}`;
  }
  if (actual.weight == null) return count;
  return `${count} · ${Number(actual.weight)} kg${loadType === 'per_dumbbell' ? ` (${perDumbbell(Number(actual.weight))} / DB)` : ''}`;
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
 * planned set at its top rep (or seconds) target and its total load (the pair for
 * dumbbells, body weight + added for bodyweight moves).
 */
export function estimatePlanCalories(planned: PlannedLoad[], bodyWeightKg: number | null): number | null {
  if (!bodyWeightKg || bodyWeightKg <= 0) return null;
  const sets: StrengthSetInput[] = planned
    .filter(exercise => !exercise.is_cardio)
    .flatMap(exercise => exercise.sets.map(set => {
      const seconds = targetSeconds({ ...set, target_rir_max: null }, exercise.measure ?? 'reps');
      const weight = exercise.load_type === 'bodyweight'
        ? loggedWeightFor(set.target_weight_kg, 'bodyweight', bodyWeightKg)
        : set.target_weight_kg == null ? 0 : loggedWeightFor(Number(set.target_weight_kg), exercise.load_type);
      return seconds
        ? { reps: null, durationSec: seconds.max, weight }
        : { reps: Number(set.target_reps_max), weight };
    }));
  const strength = sets.length > 0 ? calcStrengthCalories({ sets }, bodyWeightKg).calories : 0;
  const cardio = planned
    .filter(exercise => exercise.is_cardio)
    .reduce((sum, exercise) => sum + (cardioTargetCalories(exercise, bodyWeightKg) ?? 0), 0);
  const total = strength + cardio;
  return total > 0 ? Math.round(total) : null;
}
