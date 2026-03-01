// ============================================================
// Intelligence Engine — pure functions, no side effects
// ============================================================
// Generates deterministic human-readable summaries.
// No LLM required. Upgrade path: swap text templates or add
// personalisation without changing callers.

import type { WeightTrend } from './metabolismEngine';

// ── Weekly Summary ───────────────────────────────────────────

export interface WeeklySummaryInput {
  workoutCount:          number;
  totalWorkoutCalories:  number;
  weightTrend:           WeightTrend | null;
  newPRs:                string[];  // e.g. ['Bench Press 1RM', 'Squat max weight']
}

/**
 * Generate a 1–3 sentence weekly summary.
 * Deterministic — same input always produces same output.
 */
export function generateWeeklySummary(input: WeeklySummaryInput): string {
  const parts: string[] = [];

  // Workout summary
  if (input.workoutCount === 0) {
    parts.push('No workouts logged this week.');
  } else {
    const kcal = input.totalWorkoutCalories.toLocaleString();
    parts.push(
      `This week: ${input.workoutCount} workout${input.workoutCount > 1 ? 's' : ''}, ~${kcal} kcal burned.`,
    );
  }

  // Weight trend
  if (input.weightTrend) {
    const { direction, rate_kg_per_week, estimated_deficit_kcal } = input.weightTrend;
    if (direction === 'losing') {
      parts.push(
        `Weight trend: −${Math.abs(rate_kg_per_week)} kg/week — estimated ${Math.abs(estimated_deficit_kcal)} kcal/day deficit.`,
      );
    } else if (direction === 'gaining') {
      parts.push(
        `Weight trend: +${rate_kg_per_week} kg/week — estimated ${estimated_deficit_kcal} kcal/day surplus.`,
      );
    } else {
      parts.push('Weight is stable — energy balance is near maintenance.');
    }
  }

  // PRs
  if (input.newPRs.length === 1) {
    parts.push(`New PR: ${input.newPRs[0]}.`);
  } else if (input.newPRs.length > 1) {
    parts.push(`New PRs: ${input.newPRs.slice(0, 3).join(', ')}${input.newPRs.length > 3 ? '…' : ''}.`);
  }

  return parts.join(' ');
}

// ── Freshness Warning ────────────────────────────────────────

/**
 * Returns a warning string if weight hasn't been updated recently.
 * Returns null if metrics are fresh.
 */
export function dataFreshnessWarning(lastWeightDate: string | null): string | null {
  if (!lastWeightDate) {
    return 'Log your weight to enable calorie estimates.';
  }
  const days = Math.floor(
    (Date.now() - new Date(lastWeightDate).getTime()) / 86_400_000,
  );
  if (days > 14) {
    return `Weight last updated ${days} days ago — calorie estimates may be inaccurate.`;
  }
  if (days > 7) {
    return `Weight updated ${days} days ago — consider logging an update.`;
  }
  return null;
}

// ── Trend Labels ─────────────────────────────────────────────

export function trendLabel(trend: WeightTrend | null): string {
  if (!trend) return '—';
  if (trend.direction === 'stable') return 'Stable';
  const sign = trend.direction === 'losing' ? '−' : '+';
  return `${sign}${Math.abs(trend.rate_kg_per_week)} kg/wk`;
}

export function deficitLabel(trend: WeightTrend | null): string {
  if (!trend || trend.direction === 'stable') return 'Maintenance';
  const kcal = Math.abs(trend.estimated_deficit_kcal);
  return trend.direction === 'losing'
    ? `−${kcal} kcal/day deficit`
    : `+${kcal} kcal/day surplus`;
}

// ── BMI helpers (informational only) ─────────────────────────

export function calcBMI(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25)   return 'Normal';
  if (bmi < 30)   return 'Overweight';
  return 'Obese';
}
