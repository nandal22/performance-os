import { format } from 'date-fns';
import type { Activity } from '@/types';

export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Monday-first 7-day window ending today, so the strip always shows "this week so far". */
export function weekDates(anchor: Date = new Date()): Date[] {
  const day = anchor.getDay(); // 0 = Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function activitiesByDate(activities: Activity[]): Record<string, Activity[]> {
  const map: Record<string, Activity[]> = {};
  for (const a of activities) {
    (map[a.date] ??= []).push(a);
  }
  return map;
}

/** The single source of truth for "this week" — the head stat and the strip must both call this. */
export function sessionsThisWeekCount(activities: Activity[]): number {
  const dates = new Set(weekDates().map((d) => format(d, 'yyyy-MM-dd')));
  return activities.filter((a) => dates.has(a.date)).length;
}
