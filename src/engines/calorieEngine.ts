// ============================================================
// Calorie Engine — pure functions, no side effects
// ============================================================
// Upgrade path: swap MET tables or add HR-based model later
// without touching callers.

export type CalorieMethod =
  | 'cardio_speed_met'    // distance/duration → speed → MET
  | 'cardio_type_fallback'// activity type/notes keyword → MET
  | 'strength_intensity'  // Epley 1RM → intensity → MET
  | 'strength_duration'   // set count estimate → duration → MET

export interface CalorieResult {
  calories: number;
  met: number;
  method: CalorieMethod;
  duration_hrs: number;
}

export interface WorkoutCalories {
  activity_id: string;
  date: string;
  activity_type: string;
  calories: number;
  met: number;
  method: CalorieMethod;
}

// ── MET lookup tables (configurable) ─────────────────────────

/** Speed → MET for running/cycling. First entry whose maxSpeedKmh >= actual speed is used. */
const CARDIO_SPEED_MET: Array<{ maxSpeedKmh: number; met: number }> = [
  { maxSpeedKmh: 5,        met: 3.5  }, // walking
  { maxSpeedKmh: 7,        met: 5.0  }, // brisk walk / easy jog
  { maxSpeedKmh: 9,        met: 7.0  }, // moderate run
  { maxSpeedKmh: 11,       met: 9.5  }, // tempo run
  { maxSpeedKmh: 14,       met: 11.5 }, // fast run
  { maxSpeedKmh: Infinity, met: 14.0 }, // sprint
];

/** Keyword → MET when no distance is available. */
const CARDIO_KEYWORD_MET: Record<string, number> = {
  run:    9.0,
  jog:    7.0,
  cycl:   8.0,
  bike:   8.0,
  swim:   7.0,
  row:    7.0,
  walk:   3.5,
  hiit:  10.0,
  sport:  7.0,
};
const CARDIO_DEFAULT_MET = 6.0;

/** Intensity → MET for strength training (configurable). */
const STRENGTH_INTENSITY_MET: Array<{ maxIntensity: number; met: number }> = [
  { maxIntensity: 0.60, met: 3.0 }, // easy (< 60% 1RM)
  { maxIntensity: 0.75, met: 4.5 }, // moderate (60–75%)
  { maxIntensity: 0.85, met: 6.0 }, // hard (75–85%)
  { maxIntensity: 1.00, met: 8.0 }, // very hard (> 85%)
];
const STRENGTH_DEFAULT_MET = 4.5;

/** Fallback MET when no set data is available, keyed by ActivityType. */
export const ACTIVITY_TYPE_MET: Record<string, number> = {
  strength: 4.5,
  cardio:   7.0,
  sport:    7.0,
  mobility: 2.5,
  custom:   5.0,
};

/** Active time per set + average rest — used to estimate session duration. */
const SET_DURATION_SECS = 45;
const REST_DURATION_SECS = 90;

// ── Shared helpers ────────────────────────────────────────────

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

/** Detect activity type from free-text notes. */
function detectCardioMET(notes: string): number {
  const lower = notes.toLowerCase();
  for (const [kw, met] of Object.entries(CARDIO_KEYWORD_MET)) {
    if (lower.includes(kw)) return met;
  }
  return CARDIO_DEFAULT_MET;
}

// ── Cardio ───────────────────────────────────────────────────

export interface CardioInput {
  duration: number;     // minutes (required)
  distance?: number;    // km (optional)
  notes?: string;       // free text for keyword detection
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

  if (input.distance && input.distance > 0) {
    const speedKmh = input.distance / duration_hrs;
    met = speedToMET(speedKmh);
    method = 'cardio_speed_met';
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

// ── Strength ─────────────────────────────────────────────────

export interface StrengthSetInput {
  weight: number;  // kg
  reps:   number;
}

export interface StrengthInput {
  sets:      StrengthSetInput[];
  duration?: number;   // minutes (if known from activity)
}

/**
 * Calculate calories for a strength session.
 * Finds best 1RM across sets, computes average intensity, maps to MET.
 * If duration is missing, estimates from set count.
 */
export function calcStrengthCalories(input: StrengthInput, weightKg: number): CalorieResult {
  if (weightKg <= 0) {
    return { calories: 0, met: STRENGTH_DEFAULT_MET, method: 'strength_intensity', duration_hrs: 0 };
  }

  const validSets = input.sets.filter(s => s.weight > 0 && s.reps > 0);

  // Estimate duration when not provided
  const totalSets = Math.max(input.sets.length, 1);
  const estimatedDurationMins = input.duration
    ?? Math.round((totalSets * (SET_DURATION_SECS + REST_DURATION_SECS)) / 60);
  const duration_hrs = estimatedDurationMins / 60;
  const method: CalorieMethod = input.duration ? 'strength_intensity' : 'strength_duration';

  if (validSets.length === 0) {
    return {
      calories: Math.round(STRENGTH_DEFAULT_MET * weightKg * duration_hrs),
      met: STRENGTH_DEFAULT_MET,
      method,
      duration_hrs,
    };
  }

  // Best 1RM across all sets
  const best1RM = validSets.reduce((best, s) => {
    const rm = epley1RM(s.weight, s.reps);
    return rm > best ? rm : best;
  }, 0);

  // Average relative intensity across sets
  const avgIntensity =
    validSets.reduce((sum, s) => sum + s.weight / epley1RM(s.weight, s.reps), 0) / validSets.length;

  const met = best1RM > 0 ? intensityToMET(avgIntensity) : STRENGTH_DEFAULT_MET;

  return {
    calories: Math.round(met * weightKg * duration_hrs),
    met,
    method,
    duration_hrs,
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
