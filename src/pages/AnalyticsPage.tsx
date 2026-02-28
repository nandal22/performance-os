import { useEffect, useState, useCallback } from 'react';
import { activitiesService } from '@/services/activities';
import { strengthSetsService } from '@/services/strengthSets';
import { calcWeeklyLoads, get4WeekAvgLoad } from '@/analytics/trainingLoad';
import type { Activity, PRRecord } from '@/types';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';

const PERIODS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

export default function AnalyticsPage() {
  const [period,     setPeriod]     = useState<7 | 30 | 90>(30);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [prs,        setPRs]        = useState<PRRecord[]>([]);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acts, prData] = await Promise.all([
        activitiesService.getAll(300),
        strengthSetsService.getPRs().catch(() => [] as PRRecord[]),
      ]);
      setActivities(acts);
      setPRs(prData);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cutoff   = subDays(new Date(), period).toISOString().slice(0, 10);
  const filtered = activities.filter(a => a.date >= cutoff);

  const weeklyLoads    = calcWeeklyLoads(filtered);
  const avgLoad        = get4WeekAvgLoad(calcWeeklyLoads(activities));
  const totalSessions  = filtered.length;
  const strengthCount  = filtered.filter(a => a.type === 'strength').length;
  const cardioCount    = filtered.filter(a => a.type === 'cardio').length;

  // Unique training days
  const trainingDays = new Set(filtered.map(a => a.date)).size;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-6 pb-4 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">Analytics</h1>
        <p className="text-xs text-muted-foreground">Your training insights</p>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6 max-w-lg mx-auto w-full pb-nav">

        {/* Period selector */}
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                period === p.days
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/5 text-muted-foreground hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Sessions',       value: totalSessions },
            { label: 'Training days',  value: trainingDays  },
            { label: 'Strength',       value: strengthCount },
            { label: 'Cardio',         value: cardioCount   },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Weekly load chart */}
        {weeklyLoads.length > 0 && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Weekly Load</p>
              <p className="text-xs text-muted-foreground">4-wk avg: <span className="text-white font-medium">{avgLoad} AU</span></p>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={weeklyLoads.slice(-8)} barGap={2} barCategoryGap="30%">
                <Bar dataKey="strength_load" stackId="a" fill="hsl(217 91% 60% / 0.85)" radius={[0, 0, 0, 0]}>
                  {weeklyLoads.slice(-8).map((_, i) => (
                    <Cell key={i} fill="hsl(217 91% 60% / 0.85)" />
                  ))}
                </Bar>
                <Bar dataKey="cardio_load" stackId="a" fill="hsl(25 95% 53% / 0.85)" radius={[3, 3, 0, 0]} />
                <XAxis
                  dataKey="week_start"
                  tickFormatter={v => format(new Date(v + 'T12:00:00'), 'M/d')}
                  tick={{ fill: 'hsl(220 9% 45%)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                  labelFormatter={v => `Week of ${format(new Date(v + 'T12:00:00'), 'MMM d')}`}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name?: any) => [
                    `${Number(value ?? 0)} AU`,
                    String(name) === 'strength_load' ? 'Strength' : 'Cardio',
                  ] as [string, string]}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-primary/85" />
                <span className="text-xs text-muted-foreground">Strength</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-orange-400/85" />
                <span className="text-xs text-muted-foreground">Cardio</span>
              </div>
            </div>
          </div>
        )}

        {/* Personal Records */}
        {prs.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Personal Records</p>
            <div className="space-y-2">
              {prs.slice(0, 10).map((pr, i) => (
                <div key={pr.exercise_id} className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
                  <span className="text-base w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏋️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{pr.exercise_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pr.reps} reps × {pr.weight} kg · {format(new Date(pr.achieved_on + 'T12:00:00'), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-white">
                      {Math.round(Number(pr.estimated_1rm))}
                      <span className="text-xs text-muted-foreground font-normal ml-0.5">kg</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">est. 1RM</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm text-muted-foreground">No data for this period</p>
            <p className="text-xs text-muted-foreground mt-1">Log workouts to see analytics</p>
          </div>
        )}
      </main>
    </div>
  );
}
