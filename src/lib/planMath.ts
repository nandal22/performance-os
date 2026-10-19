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

export function prefillFromTarget(target: PlanTarget) {
  const rpe = target.target_rir_max == null ? '' : String(Math.round((10 - Number(target.target_rir_max)) * 10) / 10);
  return {
    reps: String(target.target_reps_max),
    weight: target.target_weight_kg == null ? '' : String(Number(target.target_weight_kg)),
    rpe,
  };
}

export function setOutcome(target: PlanTarget, actual: LoggedSet | null): 'hit' | 'miss' | 'skipped' {
  if (!actual) return 'skipped';
  const reps = Number(actual.reps);
  const repsOk = reps >= Number(target.target_reps_min) && reps <= Number(target.target_reps_max);
  const weightOk = target.target_weight_kg == null
    || Math.abs(Number(actual.weight ?? 0) - Number(target.target_weight_kg)) < 0.05;
  return repsOk && weightOk ? 'hit' : 'miss';
}

export function repsLabel(target: PlanTarget) {
  if (Number(target.target_reps_min) === Number(target.target_reps_max)) return `${target.target_reps_max} reps`;
  return `${target.target_reps_min}–${target.target_reps_max} reps`;
}
