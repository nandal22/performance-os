import type { Activity, WeeklyLoad } from '@/types';
import { format } from 'date-fns';
import { getWeekStart } from '@/lib/utils';

// Arbitrary units per minute of activity by type
const LOAD_PER_MIN: Record<string, number> = {
  strength: 1.0,
  cardio:   0.8,
  sport:    0.7,
  mobility: 0.3,
  custom:   0.6,
};

const DEFAULT_DURATION = 30; // minutes, used when not recorded

/** Calculate a single activity's training load (arbitrary units). */
export function calcActivityLoad(activity: Activity): number {
  const duration   = activity.duration ?? DEFAULT_DURATION;
  const multiplier = LOAD_PER_MIN[activity.type] ?? 0.6;
  return Math.round(duration * multiplier);
}

/** Aggregate activities into weekly load objects, sorted oldest → newest. */
export function calcWeeklyLoads(activities: Activity[]): WeeklyLoad[] {
  const weekMap = new Map<string, {
    strength_load: number;
    cardio_load:   number;
    session_count: number;
  }>();

  for (const activity of activities) {
    const weekStart = format(getWeekStart(new Date(activity.date)), 'yyyy-MM-dd');
    const entry     = weekMap.get(weekStart) ?? { strength_load: 0, cardio_load: 0, session_count: 0 };
    const load      = calcActivityLoad(activity);

    if (activity.type === 'strength') {
      entry.strength_load += load;
    } else {
      entry.cardio_load += load;
    }
    entry.session_count += 1;
    weekMap.set(weekStart, entry);
  }

  return Array.from(weekMap.entries())
    .map(([week_start, data]) => {
      const total = data.strength_load + data.cardio_load;
      return {
        week_start,
        total_load:     total,
        strength_load:  data.strength_load,
        cardio_load:    data.cardio_load,
        session_count:  data.session_count,
        status:         classifyWeekLoad(total, data.session_count),
      } as WeeklyLoad;
    })
    .sort((a, b) => a.week_start.localeCompare(b.week_start));
}

/** Classify a week's load into a training status. */
export function classifyWeekLoad(
  totalLoad: number,
  sessions: number,
): WeeklyLoad['status'] {
  if (sessions < 2 || totalLoad < 60)  return 'undertraining';
  if (totalLoad > 300 || sessions > 7) return 'overtraining';
  return 'optimal';
}

/**
 * Rolling 4-week average load.
 * Expects weeklyLoads sorted oldest → newest.
 */
export function get4WeekAvgLoad(weeklyLoads: WeeklyLoad[]): number {
  const last4 = weeklyLoads.slice(-4);
  if (last4.length === 0) return 0;
  return Math.round(last4.reduce((sum, w) => sum + w.total_load, 0) / last4.length);
}

/**
 * Daily load breakdown for charting.
 * Returns { date, load } for each activity date.
 */
export function dailyLoads(activities: Activity[]): { date: string; load: number }[] {
  const dayMap = new Map<string, number>();
  for (const a of activities) {
    dayMap.set(a.date, (dayMap.get(a.date) ?? 0) + calcActivityLoad(a));
  }
  return Array.from(dayMap.entries())
    .map(([date, load]) => ({ date, load }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
