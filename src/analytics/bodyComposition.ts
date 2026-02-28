import type { BodyMetric } from '@/types';

export type CompositionTrend =
  | 'bulking'
  | 'cutting'
  | 'recomping'
  | 'maintaining'
  | 'insufficient_data';

export interface CompositionAnalysis {
  trend:               CompositionTrend;
  weight_change_kg:    number;
  body_fat_change_pct: number;
  period_days:         number;
}

/**
 * Classify body composition trend from a series of body metrics.
 * Metrics can be in any order — they'll be sorted internally.
 *
 * Heuristics (per month):
 *   bulking   — weight ↑ significantly, body fat stable or slight ↑
 *   cutting   — weight ↓ + body fat ↓
 *   recomping — weight ~stable, body fat ↓
 *   maintaining — neither weight nor body fat changing meaningfully
 */
export function analyzeComposition(metrics: BodyMetric[]): CompositionAnalysis {
  const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) {
    return {
      trend:               'insufficient_data',
      weight_change_kg:    0,
      body_fat_change_pct: 0,
      period_days:         0,
    };
  }

  const first = sorted[0];
  const last  = sorted[sorted.length - 1];

  const periodDays = Math.max(1, Math.ceil(
    (new Date(last.date).getTime() - new Date(first.date).getTime()) /
    (1000 * 60 * 60 * 24),
  ));

  const weightChange = (last.weight ?? 0) - (first.weight ?? 0);
  const bfChange     = (last.body_fat ?? 0) - (first.body_fat ?? 0);

  // Scale to per-month rates for consistent thresholds
  const scale          = 30 / periodDays;
  const weightPerMonth = weightChange * scale;
  const bfPerMonth     = bfChange     * scale;

  const WEIGHT_THRESHOLD = 0.5;  // kg/month considered meaningful
  const BF_THRESHOLD     = 0.3;  // %/month considered meaningful

  let trend: CompositionTrend;

  if (weightPerMonth > WEIGHT_THRESHOLD && bfPerMonth < BF_THRESHOLD) {
    trend = 'bulking';
  } else if (weightPerMonth < -WEIGHT_THRESHOLD && bfPerMonth < -BF_THRESHOLD) {
    trend = 'cutting';
  } else if (Math.abs(weightPerMonth) < WEIGHT_THRESHOLD && bfPerMonth < -BF_THRESHOLD) {
    trend = 'recomping';
  } else {
    trend = 'maintaining';
  }

  return {
    trend,
    weight_change_kg:    Math.round(weightChange * 10) / 10,
    body_fat_change_pct: Math.round(bfChange     * 10) / 10,
    period_days:         periodDays,
  };
}

/** Weight trend points for charting, sorted oldest → newest. */
export function getWeightTrend(metrics: BodyMetric[]): { date: string; weight: number }[] {
  return metrics
    .filter(m => m.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => ({ date: m.date, weight: m.weight! }));
}

/** Body-fat % trend points for charting, sorted oldest → newest. */
export function getBodyFatTrend(metrics: BodyMetric[]): { date: string; body_fat: number }[] {
  return metrics
    .filter(m => m.body_fat != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => ({ date: m.date, body_fat: m.body_fat! }));
}

/** Simple human-readable label for a CompositionTrend. */
export function trendLabel(trend: CompositionTrend): string {
  const labels: Record<CompositionTrend, string> = {
    bulking:           'Bulking',
    cutting:           'Cutting',
    recomping:         'Body Recomp',
    maintaining:       'Maintaining',
    insufficient_data: 'Need more data',
  };
  return labels[trend];
}
