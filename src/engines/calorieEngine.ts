// ============================================================
// Calorie Engine - pure functions, no side effects
// ============================================================
// Upgrade path: swap MET tables or add HR-based model later
// without touching callers.

export type CalorieMethod =
  | 'cardio_speed_met'
  | 'cardio_method_met'
  | 'cardio_type_fallback'
  | 'strength_intensity'
  | 'strength_duration'
  | 'strength_load_adjusted';

export type CardioActivityMethod =
  | 'running'
  | 'treadmill'
  | 'stair_machine'
  | 'elliptical'
  | 'cycling_bike'
  | 'rowing'
  | 'other_machine';

export interface CalorieResult {
  calories: number;
  met: number;
  method: CalorieMethod;
  duration_hrs: number;
  active_duration_hrs?: number;
  total_volume_kg?: number;
  total_reps?: number;
}

export interface WorkoutCalories {
  activity_id: string;
  date: string;
  activity_type: string;
  calories: number;
  met: number;
  method: CalorieMethod;
}

/** Speed -> MET for running/cycling. First entry whose maxSpeedKmh >= actual speed is used. */
const CARDIO_SPEED_MET: Array<{ maxSpeedKmh: number; met: number }> = [
  { maxSpeedKmh: 5, met: 3.5 },
  { maxSpeedKmh: 7, met: 5.0 },
  { maxSpeedKmh: 9, met: 7.0 },
  { maxSpeedKmh: 11, met: 9.5 },
  { maxSpeedKmh: 14, met: 11.5 },
  { maxSpeedKmh: Infinity, met: 14.0 },
];

const CYCLING_SPEED_MET: Array<{ maxSpeedKmh: number; met: number }> = [
  { maxSpeedKmh: 12, met: 4.0 },
  { maxSpeedKmh: 16, met: 6.0 },
  { maxSpeedKmh: 20, met: 8.0 },
  { maxSpeedKmh: 25, met: 10.0 },
  { maxSpeedKmh: Infinity, met: 12.0 },
];

const CARDIO_DEFAULT_MET = 6.0;

const CARDIO_METHOD_MET: Record<CardioActivityMethod, number> = {
  running: 9.0,
  treadmill: 8.5,
  stair_machine: 8.8,
  elliptical: 5.5,
  cycling_bike: 7.5,
  rowing: 7.0,
  other_machine: CARDIO_DEFAULT_MET,
};

/** Keyword -> MET when no distance is available. */
const CARDIO_KEYWORD_MET: Record<string, number> = {
  run: 9.0,
  jog: 7.0,
  cycl: 8.0,
  bike: 8.0,
  swim: 7.0,
  row: 7.0,
  walk: 3.5,
  hiit: 10.0,
  sport: 7.0,
};

/** Intensity -> MET for strength training. */
const STRENGTH_INTENSITY_MET: Array<{ maxIntensity: number; met: number }> = [
  { maxIntensity: 0.60, met: 3.0 },
  { maxIntensity: 0.75, met: 4.5 },
  { maxIntensity: 0.85, met: 6.0 },
  { maxIntensity: 1.00, met: 8.0 },
];
const STRENGTH_DEFAULT_MET = 4.5;

/** Fallback MET when no set data is available, keyed by ActivityType. */
export const ACTIVITY_TYPE_MET: Record<string, number> = {
  strength: 4.5,
  cardio: 7.0,
  sport: 7.0,
  mobility: 2.5,
  custom: 5.0,
};

/** Active time per set + average rest - used to estimate session duration. */
const SET_DURATION_SECS = 45;
const REST_DURATION_SECS = 90;
const SECONDS_PER_REP = 3;
const SET_TRANSITION_SECS = 15;
const STRENGTH_RECOVERY_MET = 3.2;

/** Epley 1-rep max estimate. */
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0) return weight;
  return weight * (1 + reps / 30);
}

/** Map speed to MET using the lookup table. */
export function speedToMET(speedKmh: number): number {
  for (const entry of CARDIO_SPEED_MET) {
    if (speedKmh <= entry.maxSpeedKmh) return entry.met;
  }
  return CARDIO_SPEED_MET[CARDIO_SPEED_MET.length - 1].met;
}

/** Map relative intensity (weight/1RM) to MET. */
export function intensityToMET(intensity: number): number {
  for (const entry of STRENGTH_INTENSITY_MET) {
    if (intensity <= entry.maxIntensity) return entry.met;
  }
  return STRENGTH_INTENSITY_MET[STRENGTH_INTENSITY_MET.length - 1].met;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Detect activity type from free-text notes. */
function detectCardioMET(notes: string): number {
  const lower = notes.toLowerCase();
  for (const [kw, met] of Object.entries(CARDIO_KEYWORD_MET)) {
    if (lower.includes(kw)) return met;
  }
  return CARDIO_DEFAULT_MET;
}

export interface CardioInput {
  duration: number;
  distance?: number;
  notes?: string;
  cardioMethod?: CardioActivityMethod;
}

/**
 * Calculate calories for a cardio session.
 * Uses speed-based MET if distance is available; keyword fallback otherwise.
 */
export function calcCardioCalories(input: CardioInput, weightKg: number): CalorieResult {
  if (input.duration <= 0 || weightKg <= 0) {
    return { calories: 0, met: 0, method: 'cardio_type_fallback', duration_hrs: 0 };
  }

  const duration_hrs = input.duration / 60;
  let met: number;
  let method: CalorieMethod;

  if (input.distance && input.distance > 0 && (input.cardioMethod === 'cycling_bike')) {
    const speedKmh = input.distance / duration_hrs;
    met = cyclingSpeedToMET(speedKmh);
    method = 'cardio_speed_met';
  } else if (input.distance && input.distance > 0 && (!input.cardioMethod || input.cardioMethod === 'running' || input.cardioMethod === 'treadmill')) {
    const speedKmh = input.distance / duration_hrs;
    met = speedToMET(speedKmh);
    method = 'cardio_speed_met';
  } else if (input.cardioMethod) {
    met = CARDIO_METHOD_MET[input.cardioMethod];
    method = 'cardio_method_met';
  } else {
    met = detectCardioMET(input.notes ?? '');
    method = 'cardio_type_fallback';
  }

  return {
    calories: Math.round(met * weightKg * duration_hrs),
    met,
    method,
    duration_hrs,
  };
}

/** Map cycling speed to MET using a cycling-specific lookup table. */
export function cyclingSpeedToMET(speedKmh: number): number {
  for (const entry of CYCLING_SPEED_MET) {
    if (speedKmh <= entry.maxSpeedKmh) return entry.met;
  }
  return CYCLING_SPEED_MET[CYCLING_SPEED_MET.length - 1].met;
}

export interface StrengthSetInput {
  weight: number;
  reps: number;
  loadMode?: 'total' | 'dumbbell_pair' | 'barbell_plates' | 'bodyweight';
  bodyweightFactor?: number;
  bodyweightKg?: number | null;
}

export interface StrengthInput {
  sets: StrengthSetInput[];
  duration?: number;
}

function effectiveStrengthLoad(set: StrengthSetInput, profileWeightKg: number): number {
  const loggedWeight = Math.max(0, set.weight || 0);

  if (set.loadMode !== 'bodyweight') {
    return loggedWeight;
  }

  const bodyweightKg = set.bodyweightKg && set.bodyweightKg > 0
    ? set.bodyweightKg
    : profileWeightKg;
  const factor = clamp(set.bodyweightFactor ?? 1, 0, 1.5);
  const bodyweightLoad = bodyweightKg > 0 ? bodyweightKg * factor : 0;

  return Math.max(loggedWeight, bodyweightLoad);
}

/**
 * Calculate calories for a strength session.
 *
 * Strength calories are still mainly driven by body weight and time. Logged
 * reps, load, volume, and active set time nudge the MET estimate up or down.
 */
export function calcStrengthCalories(input: StrengthInput, weightKg: number): CalorieResult {
  if (weightKg <= 0) {
    return { calories: 0, met: STRENGTH_DEFAULT_MET, method: 'strength_intensity', duration_hrs: 0 };
  }

  const hasLoggedDuration = typeof input.duration === 'number' && input.duration > 0;
  const validSets = input.sets
    .map(set => ({
      ...set,
      reps: Math.max(0, set.reps || 0),
      effectiveWeight: effectiveStrengthLoad(set, weightKg),
    }))
    .filter(set => set.reps > 0);
  const weightedSets = validSets.filter(set => set.effectiveWeight > 0);
  const totalVolumeKg = validSets.reduce((sum, set) => sum + set.effectiveWeight * set.reps, 0);
  const totalReps = validSets.reduce((sum, set) => sum + set.reps, 0);

  const totalSets = Math.max(validSets.length || input.sets.length, 1);
  const fallbackDurationMins = Math.round((totalSets * (SET_DURATION_SECS + REST_DURATION_SECS)) / 60);
  const estimatedDurationMins = hasLoggedDuration ? (input.duration as number) : fallbackDurationMins;
  const duration_hrs = estimatedDurationMins / 60;
  const estimatedActiveMins = Math.min(
    estimatedDurationMins,
    Math.max(
      (totalSets * SET_DURATION_SECS) / 60,
      (totalReps * SECONDS_PER_REP + totalSets * SET_TRANSITION_SECS) / 60,
    ),
  );
  const active_duration_hrs = estimatedActiveMins / 60;
  const method: CalorieMethod = totalVolumeKg > 0
    ? 'strength_load_adjusted'
    : hasLoggedDuration ? 'strength_intensity' : 'strength_duration';

  if (validSets.length === 0) {
    return {
      calories: Math.round(STRENGTH_DEFAULT_MET * weightKg * duration_hrs),
      met: STRENGTH_DEFAULT_MET,
      method,
      duration_hrs,
      active_duration_hrs,
      total_volume_kg: 0,
      total_reps: 0,
    };
  }

  const avgIntensity = weightedSets.length > 0
    ? weightedSets.reduce((sum, set) => (
        sum + set.effectiveWeight / epley1RM(set.effectiveWeight, set.reps)
      ), 0) / weightedSets.length
    : 0.65;

  const avgRelativeLoad = weightedSets.length > 0
    ? weightedSets.reduce((sum, set) => sum + set.effectiveWeight / weightKg, 0) / weightedSets.length
    : 0;
  const volumePerMinute = estimatedDurationMins > 0 ? totalVolumeKg / estimatedDurationMins : 0;
  const loadBoost = clamp(avgRelativeLoad * 0.8, 0, 1.3);
  const densityBoost = clamp(volumePerMinute / Math.max(weightKg * 4, 1), 0, 1.2);
  const activeMet = clamp(
    intensityToMET(avgIntensity) + loadBoost + densityBoost,
    STRENGTH_DEFAULT_MET,
    9.0,
  );
  const activeShare = clamp(estimatedActiveMins / Math.max(estimatedDurationMins, 1), 0.25, 0.75);
  const met = roundToTenth(clamp(
    activeMet * activeShare + STRENGTH_RECOVERY_MET * (1 - activeShare),
    3.2,
    8.5,
  ));

  return {
    calories: Math.round(met * weightKg * duration_hrs),
    met,
    method,
    duration_hrs,
    active_duration_hrs,
    total_volume_kg: Math.round(totalVolumeKg),
    total_reps: totalReps,
  };
}

/**
 * Simple per-activity estimator when set-level data is unavailable.
 * Uses activity type MET + duration.
 */
export function calcActivityCalories(
  activityType: string,
  durationMins: number,
  weightKg: number,
): CalorieResult {
  const met = ACTIVITY_TYPE_MET[activityType] ?? ACTIVITY_TYPE_MET.custom;
  const duration_hrs = durationMins / 60;
  return {
    calories: Math.round(met * weightKg * duration_hrs),
    met,
    method: 'cardio_type_fallback',
    duration_hrs,
  };
}
