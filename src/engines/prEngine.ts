// ============================================================
// PR Engine — pure functions, no side effects
// ============================================================
// Detects all-time records for both strength and body metrics.
// Upgrade path: add more PR types (e.g. volume PR, rep PR) without
// changing the API shape.

import { epley1RM } from './calorieEngine';
import type { BodyMetric } from '@/types';

// ── Strength PRs ─────────────────────────────────────────────

export type StrengthPRType = 'max_weight' | 'estimated_1rm' | 'max_reps';

export interface StrengthPR {
  type:          StrengthPRType;
  value:         number;
  exercise_id:   string;
  exercise_name: string;
  date:          string;   // YYYY-MM-DD (from set's activity date or created_at)
  weight?:       number;
  reps?:         number;
}

export interface RawStrengthSet {
  id:          string;
  exercise_id: string;
  weight?:     number | null;
  reps?:       number | null;
  created_at:  string;
  activity?:   { date?: string } | null;
  exercise?:   { name?: string } | null;
}

/**
 * Compute all strength PRs (max weight, best 1RM, max reps)
 * for every exercise present in the input sets.
 * Returns a flat array; caller groups by exercise if needed.
 */
export function computeStrengthPRs(sets: RawStrengthSet[]): StrengthPR[] {
  // Group by exercise_id
  const byExercise = new Map<string, RawStrengthSet[]>();
  for (const s of sets) {
    const arr = byExercise.get(s.exercise_id) ?? [];
    arr.push(s);
    byExercise.set(s.exercise_id, arr);
  }

  const result: StrengthPR[] = [];

  for (const [exerciseId, exSets] of byExercise.entries()) {
    const name = exSets[0]?.exercise?.name ?? exerciseId;

    const dateOf = (s: RawStrengthSet) =>
      s.activity?.date ?? s.created_at.slice(0, 10);

    const withWeight = exSets.filter(s => (s.weight ?? 0) > 0);
    const withBoth   = exSets.filter(s => (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0);

    // Max weight PR
    if (withWeight.length > 0) {
      const best = withWeight.reduce((b, s) =>
        (s.weight ?? 0) > (b.weight ?? 0) ? s : b,
      );
      result.push({
        type:          'max_weight',
        value:         best.weight!,
        exercise_id:   exerciseId,
        exercise_name: name,
        date:          dateOf(best),
        weight:        best.weight ?? undefined,
        reps:          best.reps ?? undefined,
      });
    }

    // Best estimated 1RM
    if (withBoth.length > 0) {
      const best = withBoth.reduce((b, s) => {
        const rm  = epley1RM(s.weight!, s.reps!);
        const brm = epley1RM(b.weight!, b.reps!);
        return rm > brm ? s : b;
      });
      result.push({
        type:          'estimated_1rm',
        value:         Math.round(epley1RM(best.weight!, best.reps!)),
        exercise_id:   exerciseId,
        exercise_name: name,
        date:          dateOf(best),
        weight:        best.weight ?? undefined,
        reps:          best.reps ?? undefined,
      });
    }

    // Max reps (heaviest weight × most reps)
    if (withBoth.length > 0) {
      const best = withBoth.reduce((b, s) =>
        (s.reps ?? 0) > (b.reps ?? 0) ? s : b,
      );
      result.push({
        type:          'max_reps',
        value:         best.reps!,
        exercise_id:   exerciseId,
        exercise_name: name,
        date:          dateOf(best),
        weight:        best.weight ?? undefined,
        reps:          best.reps ?? undefined,
      });
    }
  }

  return result;
}

// ── Body PRs ─────────────────────────────────────────────────

export type BodyPRType = 'lowest_weight' | 'smallest_waist' | 'best_body_fat';

export interface BodyPR {
  type:  BodyPRType;
  value: number;
  date:  string;
  unit:  string;
}

/**
 * Compute body composition PRs from a history of metrics.
 * - "Best" for weight / waist / body_fat = lowest value logged.
 */
export function computeBodyPRs(metrics: BodyMetric[]): BodyPR[] {
  const prs: BodyPR[] = [];

  const withWeight = metrics.filter(m => (m.weight ?? 0) > 0);
  if (withWeight.length > 0) {
    const best = withWeight.reduce((b, m) => m.weight! < b.weight! ? m : b);
    prs.push({ type: 'lowest_weight', value: best.weight!, date: best.date, unit: 'kg' });
  }

  const withWaist = metrics.filter(m => (m.waist ?? 0) > 0);
  if (withWaist.length > 0) {
    const best = withWaist.reduce((b, m) => m.waist! < b.waist! ? m : b);
    prs.push({ type: 'smallest_waist', value: best.waist!, date: best.date, unit: 'cm' });
  }

  const withBF = metrics.filter(m => (m.body_fat ?? 0) > 0);
  if (withBF.length > 0) {
    const best = withBF.reduce((b, m) => m.body_fat! < b.body_fat! ? m : b);
    prs.push({ type: 'best_body_fat', value: best.body_fat!, date: best.date, unit: '%' });
  }

  return prs;
}

// ── PR Delta ─────────────────────────────────────────────────

/** Compare a new value against a PR to see if it's a new PR. */
export function isNewPR(
  currentValue: number,
  prValue:      number,
  higherIsBetter = true,
): boolean {
  return higherIsBetter ? currentValue > prValue : currentValue < prValue;
}

/** Progress percentage toward (or beyond) a PR. */
export function progressToPR(current: number, pr: number, higherIsBetter = true): number {
  if (pr === 0) return 0;
  return higherIsBetter
    ? Math.round((current / pr) * 100)
    : Math.round((pr / current) * 100);
}
