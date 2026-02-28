import { useEffect, useState, useCallback } from 'react';
import { activitiesService } from '@/services/activities';
import { strengthSetsService } from '@/services/strengthSets';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { exercisesService } from '@/services/exercises';
import { calcWeeklyLoads, get4WeekAvgLoad } from '@/analytics/trainingLoad';
import { analyzeComposition, getWeightTrend, trendLabel } from '@/analytics/bodyComposition';
import type { Activity, PRRecord, ExerciseSummary, BodyMetric, Exercise, ExerciseCategory } from '@/types';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

const PERIODS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

const EX_CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'cardio', 'mobility', 'other'];

const CAT_COLOR: Record<string, string> = {
  push:     '#3b82f6',
  pull:     '#8b5cf6',
  legs:     '#22c55e',
  core:     '#f59e0b',
  cardio:   '#ef4444',
  mobility: '#06b6d4',
  other:    '#6b7280',
};

const TREND_STYLE: Record<string, string> = {
  bulking:           'text-blue-400 bg-blue-400/10 border-blue-400/20',
  cutting:           'text-orange-400 bg-orange-400/10 border-orange-400/20',
  recomping:         'text-green-400 bg-green-400/10 border-green-400/20',
  maintaining:       'text-purple-400 bg-purple-400/10 border-purple-400/20',
  insufficient_data: 'text-white/40 bg-white/5 border-white/10',
};

const WEEK_STATUS_COLOR: Record<string, string> = {
  optimal:      'hsl(142 72% 50% / 0.85)',
  undertraining:'hsl(45 93% 58% / 0.80)',
  overtraining: 'hsl(4 86% 58% / 0.85)',
};

const TT = { background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 };

export default function AnalyticsPage() {
  const [subTab,      setSubTab]      = useState<'overview' | 'exercises'>('overview');
  const [period,      setPeriod]      = useState<7 | 30 | 90>(30);

  // Data
  const [activities,  setActivities]  = useState<Activity[]>([]);
  const [prs,         setPRs]         = useState<PRRecord[]>([]);
  const [summaries,   setSummaries]   = useState<ExerciseSummary[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[]>([]);
  const [exercises,   setExercises]   = useState<Exercise[]>([]);
  const [loading,     setLoading]     = useState(true);

  // Exercise creation / filtering
  const [newExName,  setNewExName]  = useState('');
  const [newExCat,   setNewExCat]   = useState<ExerciseCategory>('other');
  const [creatingEx, setCreatingEx] = useState(false);
  const [exSearch,   setExSearch]   = useState('');
  const [catFilter,  setCatFilter]  = useState<ExerciseCategory | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acts, prData, sumData, metricsData, exData] = await Promise.all([
        activitiesService.getAll(300).catch(() => [] as Activity[]),
        strengthSetsService.getPRs().catch(() => [] as PRRecord[]),
        strengthSetsService.getExerciseSummaries().catch(() => [] as ExerciseSummary[]),
        bodyMetricsService.getAll(90).catch(() => [] as BodyMetric[]),
        exercisesService.getAll().catch(() => [] as Exercise[]),
      ]);
      setActivities(acts);
      setPRs(prData);
      setSummaries(sumData);
      setBodyMetrics(metricsData);
      setExercises(exData);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ──
  const cutoff   = subDays(new Date(), period).toISOString().slice(0, 10);
  const filtered = activities.filter(a => a.date >= cutoff);

  const totalSessions = filtered.length;
  const trainingDays  = new Set(filtered.map(a => a.date)).size;
  const strengthCount = filtered.filter(a => a.type === 'strength').length;
  const cardioCount   = filtered.filter(a => a.type === 'cardio').length;
  const durations     = filtered.filter(a => a.duration).map(a => a.duration!);
  const avgDuration   = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const weeklyLoads = calcWeeklyLoads(filtered);
  const avgLoad     = get4WeekAvgLoad(calcWeeklyLoads(activities));

  // Body composition (uses all available metric history, not period-filtered)
  const composition = analyzeComposition(bodyMetrics);
  const weightTrend = getWeightTrend(bodyMetrics);

  // Muscle group volume (all-time summaries ↔ exercise categories)
  const exMap = new Map(exercises.map(e => [e.id, e]));
  const muscleTotals: Record<string, number> = {};
  for (const s of summaries) {
    const cat = exMap.get(s.exercise_id)?.category ?? 'other';
    muscleTotals[cat] = (muscleTotals[cat] ?? 0) + s.total_volume;
  }
  const totalMuscleVol = Object.values(muscleTotals).reduce((a, b) => a + b, 0);
  const muscleRows = Object.entries(muscleTotals).sort((a, b) => b[1] - a[1]);

  // Exercises tab list
  const exFiltered = exercises
    .filter(e => catFilter === 'all' || e.category === catFilter)
    .filter(e => !exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase()));

  const handleCreateExercise = async () => {
    if (!newExName.trim()) return toast.error('Enter an exercise name');
    setCreatingEx(true);
    try {
      const ex = await exercisesService.createCustom({
        name: newExName.trim(), category: newExCat,
        primary_muscle: 'General', secondary_muscles: [],
      });
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      setNewExName('');
      toast.success(`"${ex.name}" added`);
    } catch { toast.error('Failed to create exercise'); }
    finally { setCreatingEx(false); }
  };

  const handleDeleteExercise = async (ex: Exercise) => {
    try {
      await exercisesService.deleteCustom(ex.id);
      setExercises(prev => prev.filter(e => e.id !== ex.id));
      toast.success('Deleted');
    } catch { toast.error('Cannot delete — exercise has workout data'); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-white/5">
        <div className="px-4 pt-safe pb-1">
          <h1 className="text-lg font-bold text-white">Analytics</h1>
          <p className="text-xs text-muted-foreground">Your training insights</p>
        </div>
        <div className="flex px-4">
          {(['overview', 'exercises'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                subTab === tab
                  ? 'text-white border-primary'
                  : 'text-muted-foreground border-transparent hover:text-white'
              }`}
            >
              {tab === 'overview' ? 'Overview' : 'Exercises'}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">

        {subTab === 'overview' ? (
          <>
            {/* Period pills */}
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

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: 'Sessions',   value: totalSessions },
                { label: 'Days active', value: trainingDays  },
                { label: 'Avg min',    value: avgDuration || '—' },
                { label: 'Strength',   value: strengthCount },
                { label: 'Cardio',     value: cardioCount   },
                { label: '4-wk avg',   value: `${avgLoad} AU` },
              ] as const).map(s => (
                <div key={s.label} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                  <p className="text-xl font-bold text-white leading-tight">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Body composition */}
            {bodyMetrics.length >= 2 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Body Composition</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${TREND_STYLE[composition.trend]}`}>
                    {trendLabel(composition.trend)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center mb-3">
                  <div>
                    <p className={`text-xl font-bold ${
                      composition.weight_change_kg > 0 ? 'text-blue-400'
                        : composition.weight_change_kg < 0 ? 'text-orange-400' : 'text-white'
                    }`}>
                      {composition.weight_change_kg > 0 ? '+' : ''}{composition.weight_change_kg} kg
                    </p>
                    <p className="text-xs text-muted-foreground">weight · {composition.period_days}d</p>
                  </div>
                  <div>
                    <p className={`text-xl font-bold ${
                      composition.body_fat_change_pct < 0 ? 'text-green-400'
                        : composition.body_fat_change_pct > 0 ? 'text-red-400' : 'text-white'
                    }`}>
                      {composition.body_fat_change_pct > 0 ? '+' : ''}{composition.body_fat_change_pct}%
                    </p>
                    <p className="text-xs text-muted-foreground">body fat Δ</p>
                  </div>
                </div>
                {weightTrend.length >= 3 && (
                  <ResponsiveContainer width="100%" height={70}>
                    <LineChart data={weightTrend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <Line type="monotone" dataKey="weight" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                      <XAxis dataKey="date" hide />
                      <Tooltip
                        contentStyle={TT}
                        labelFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'MMM d')}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`${Number(v ?? 0)} kg`, 'Weight'] as [string, string]}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {/* Muscle group volume balance */}
            {muscleRows.length > 0 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Volume by Muscle Group</p>
                <div className="space-y-2.5">
                  {muscleRows.map(([cat, vol]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize" style={{ color: CAT_COLOR[cat] ?? '#fff' }}>{cat}</span>
                        <span className="text-muted-foreground">
                          {vol >= 1000 ? `${Math.round(vol / 1000)}k` : Math.round(vol)} kg
                          {' · '}{Math.round((vol / totalMuscleVol) * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(vol / totalMuscleVol) * 100}%`,
                            backgroundColor: CAT_COLOR[cat] ?? '#6b7280',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly load chart — bars coloured by training status */}
            {weeklyLoads.length > 0 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Weekly Load</p>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />Optimal
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />Low
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-red-400" />High
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={weeklyLoads.slice(-8)} barGap={2} barCategoryGap="30%">
                    <Bar dataKey="strength_load" stackId="a" radius={[0, 0, 0, 0]}>
                      {weeklyLoads.slice(-8).map((w, i) => (
                        <Cell key={i} fill={WEEK_STATUS_COLOR[w.status] ?? 'hsl(217 91% 60% / 0.85)'} />
                      ))}
                    </Bar>
                    <Bar dataKey="cardio_load" stackId="a" fill="hsl(25 95% 53% / 0.7)" radius={[3, 3, 0, 0]} />
                    <XAxis
                      dataKey="week_start"
                      tickFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'M/d')}
                      tick={{ fill: 'hsl(220 9% 45%)', fontSize: 10 }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={TT}
                      labelFormatter={v => `Week of ${format(new Date(String(v) + 'T12:00:00'), 'MMM d')}`}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name?: any) => [
                        `${Number(value ?? 0)} AU`,
                        String(name) === 'strength_load' ? 'Strength' : 'Cardio',
                      ] as [string, string]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top exercises by volume */}
            {summaries.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Top Exercises · All time</p>
                <div className="space-y-2">
                  {summaries.slice(0, 5).map(ex => (
                    <div
                      key={ex.exercise_id}
                      className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{ex.exercise_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ex.set_count} sets
                          {' · '}
                          {ex.total_volume >= 1000
                            ? `${Math.round(ex.total_volume / 1000)}k`
                            : Math.round(ex.total_volume)
                          } kg vol
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-white">
                          {Math.round(ex.max_weight)}
                          <span className="text-xs text-muted-foreground font-normal ml-0.5">kg</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {ex.estimated_1rm > 0 ? `${Math.round(ex.estimated_1rm)} 1RM` : 'max weight'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Personal Records */}
            {prs.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Personal Records</p>
                <div className="space-y-2">
                  {prs.slice(0, 8).map((pr, i) => (
                    <div
                      key={pr.exercise_id}
                      className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3"
                    >
                      <span className="text-base w-6 text-center flex-shrink-0">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏋️'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{pr.exercise_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pr.reps}×{pr.weight} kg
                          {' · '}{format(new Date(pr.achieved_on + 'T12:00:00'), 'MMM d, yyyy')}
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

            {!loading && filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                <p className="text-3xl mb-2">📊</p>
                <p className="text-sm text-muted-foreground">No data for this period</p>
                <p className="text-xs text-muted-foreground mt-1">Log workouts to see analytics</p>
              </div>
            )}
          </>

        ) : (
          /* ── Exercises tab ── */
          <>
            {/* Add custom exercise */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Add Custom Exercise</p>
              <input
                type="text"
                placeholder="Exercise name…"
                value={newExName}
                onChange={e => setNewExName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateExercise()}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
              />
              <div className="flex flex-wrap gap-1.5">
                {EX_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setNewExCat(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                      newExCat === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCreateExercise}
                disabled={creatingEx || !newExName.trim()}
                className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 transition-opacity"
              >
                {creatingEx ? 'Adding…' : 'Add Exercise'}
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search exercises…"
              value={exSearch}
              onChange={e => setExSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
            />

            {/* Category filter */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setCatFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  catFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                }`}
              >
                All
              </button>
              {EX_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    catFilter === cat ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Exercise list */}
            <div className="space-y-1.5">
              {exFiltered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {exSearch ? 'No exercises match your search' : 'No exercises in this category'}
                  </p>
                </div>
              ) : (
                exFiltered.map(ex => (
                  <div
                    key={ex.id}
                    className="rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{ex.name}</p>
                      {ex.primary_muscle && ex.primary_muscle !== 'General' && (
                        <p className="text-xs text-muted-foreground">{ex.primary_muscle}</p>
                      )}
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full capitalize flex-shrink-0 font-medium"
                      style={{
                        color: CAT_COLOR[ex.category] ?? '#9ca3af',
                        backgroundColor: `${CAT_COLOR[ex.category] ?? '#6b7280'}18`,
                      }}
                    >
                      {ex.category}
                    </span>
                    {ex.is_custom && (
                      <button
                        onClick={() => handleDeleteExercise(ex)}
                        className="p-1.5 text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
                        aria-label={`Delete ${ex.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground pb-2">
              {exercises.filter(e => e.is_custom).length} custom · {exercises.filter(e => !e.is_custom).length} system exercises
            </p>
          </>
        )}
      </main>
    </div>
  );
}
