import type { BodyMetric } from '@/types';

export type CompositionTrend =
  | 'gaining'
  | 'losing'
  | 'maintaining'
  | 'insufficient_data';

export interface CompositionAnalysis {
  trend:               CompositionTrend;
  weight_change_kg:    number;
  period_days:         number;
}

/**
 * Classify weight trend from a series of body metrics.
 * Metrics can be in any order — they'll be sorted internally.
 */
export function analyzeComposition(metrics: BodyMetric[]): CompositionAnalysis {
  const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) {
    return { trend: 'insufficient_data', weight_change_kg: 0, period_days: 0 };
  }

  const first = sorted[0];
  const last  = sorted[sorted.length - 1];

  const periodDays = Math.max(1, Math.ceil(
    (new Date(last.date).getTime() - new Date(first.date).getTime()) /
    (1000 * 60 * 60 * 24),
  ));

  const weightChange = (last.weight ?? 0) - (first.weight ?? 0);

  // Scale to per-month rate for a consistent threshold
  const weightPerMonth = weightChange * (30 / periodDays);
  const WEIGHT_THRESHOLD = 0.5; // kg/month considered meaningful

  const trend: CompositionTrend =
    weightPerMonth > WEIGHT_THRESHOLD ? 'gaining'
    : weightPerMonth < -WEIGHT_THRESHOLD ? 'losing'
    : 'maintaining';

  return {
    trend,
    weight_change_kg: Math.round(weightChange * 10) / 10,
    period_days:       periodDays,
  };
}

/** Weight trend points for charting, sorted oldest → newest. */
export function getWeightTrend(metrics: BodyMetric[]): { date: string; weight: number }[] {
  return metrics
    .filter(m => m.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => ({ date: m.date, weight: m.weight! }));
}

/** Simple human-readable label for a CompositionTrend. */
export function trendLabel(trend: CompositionTrend): string {
  const labels: Record<CompositionTrend, string> = {
    gaining:           'Gaining',
    losing:            'Losing',
    maintaining:       'Maintaining',
    insufficient_data: 'Need more data',
  };
  return labels[trend];
}
