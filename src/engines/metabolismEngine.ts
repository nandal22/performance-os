// ============================================================
// Metabolism Engine — pure functions, no side effects
// ============================================================
// Uses Mifflin-St Jeor equation.
// Upgrade path: swap equation (e.g. Harris-Benedict, Katch-McArdle)
// without touching callers.

import type { Gender } from '@/types';

export interface MetricsProfile {
  weight: number;   // kg
  height: number;   // cm
  age:    number;   // years
  gender: Gender;
}

export interface MetabolismResult {
  bmr:              number;  // kcal/day — basal metabolic rate
  tdee:             number;  // kcal/day — total daily energy expenditure
  workout_calories: number;  // kcal from workouts
  steps_calories:   number;  // kcal from steps
}

export interface WeightTrend {
  direction:               'losing' | 'gaining' | 'stable';
  rate_kg_per_week:        number;  // positive = gaining, negative = losing
  estimated_deficit_kcal:  number;  // kcal/day (negative = deficit)
}

/** kcal burned per step — configurable. */
const KCAL_PER_STEP = 0.04;

/** Rate below which weight change is considered "stable" (kg/week). */
const STABLE_THRESHOLD_KG = 0.1;

// ── BMR ──────────────────────────────────────────────────────

/**
 * Mifflin-St Jeor BMR.
 * Men:   10w + 6.25h − 5a + 5
 * Women: 10w + 6.25h − 5a − 161
 */
export function calcBMR(profile: MetricsProfile): number {
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  return Math.round(profile.gender === 'male' ? base + 5 : base - 161);
}

// ── TDEE ─────────────────────────────────────────────────────

/**
 * Total Daily Energy Expenditure = BMR + workout calories + steps calories.
 * Does NOT include an activity multiplier on BMR — workouts are explicit.
 */
export function calcTDEE(
  bmr:             number,
  workoutCalories: number,
  steps?:          number,
): MetabolismResult {
  const steps_calories   = Math.round((steps ?? 0) * KCAL_PER_STEP);
  const workout_calories = Math.round(workoutCalories);
  const tdee             = bmr + workout_calories + steps_calories;

  return { bmr, tdee, workout_calories, steps_calories };
}

// ── Weight Trend ─────────────────────────────────────────────

export interface WeightPoint {
  date:   string;  // YYYY-MM-DD
  weight: number;  // kg
}

/**
 * Linear regression over weight data points.
 * Returns null if fewer than 2 points or span < 3 days.
 */
export function calcWeightTrend(points: WeightPoint[]): WeightTrend | null {
  if (points.length < 2) return null;

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first  = sorted[0];
  const last   = sorted[sorted.length - 1];

  const spanDays = Math.max(
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000,
    1,
  );
  if (spanDays < 3) return null;

  const deltaKg        = last.weight - first.weight;
  const ratePerDay     = deltaKg / spanDays;
  const ratePerWeek    = ratePerDay * 7;

  // 1 kg body fat ≈ 7700 kcal
  const estimatedDailyDeficit = Math.round(ratePerDay * 7700);

  return {
    direction: Math.abs(ratePerWeek) < STABLE_THRESHOLD_KG
      ? 'stable'
      : ratePerWeek < 0 ? 'losing' : 'gaining',
    rate_kg_per_week:       Math.round(ratePerWeek * 100) / 100,
    estimated_deficit_kcal: estimatedDailyDeficit,
  };
}

// ── Staleness ────────────────────────────────────────────────

/** Returns true if the most recent weight log is older than 14 days. */
export function isWeightStale(lastWeightDate: string | null): boolean {
  if (!lastWeightDate) return true;
  const days = (Date.now() - new Date(lastWeightDate).getTime()) / 86_400_000;
  return days > 14;
}

/** Returns days since last metric log, or null if never logged. */
export function daysSinceMetric(lastDate: string | null): number | null {
  if (!lastDate) return null;
  return Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
}
