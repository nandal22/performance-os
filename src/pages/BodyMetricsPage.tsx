import { useCallback, useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AlertCircle, Trophy, Plus, X } from 'lucide-react';

import { bodyMetricsService } from '@/services/bodyMetrics';
import { activitiesService }  from '@/services/activities';
import type { BodyMetric, Activity, Gender } from '@/types';
import { toISODate } from '@/lib/utils';

import { calcBMR, calcTDEE, calcWeightTrend, isWeightStale, daysSinceMetric } from '@/engines/metabolismEngine';
import { calcActivityCalories }  from '@/engines/calorieEngine';
import { computeBodyPRs }        from '@/engines/prEngine';
import { dataFreshnessWarning, trendLabel, deficitLabel, calcBMI, bmiCategory } from '@/engines/intelligenceEngine';

// ── helpers ──────────────────────────────────────────────────

function buildWeeklyCalories(activities: Activity[], weightKg: number) {
  const byWeek: Record<string, number> = {};
  for (const a of activities) {
    const week = a.date.slice(0, 7); // YYYY-MM
    const cal  = calcActivityCalories(a.type, a.duration ?? 30, weightKg).calories;
    byWeek[week] = (byWeek[week] ?? 0) + cal;
  }
  return Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([week, kcal]) => ({ week: week.slice(5), kcal }));
}

// ── Log form ─────────────────────────────────────────────────

function LogForm({
  onSaved, onClose,
}: { onSaved: () => void; onClose: () => void }) {
  const [date,      setDate]      = useState(toISODate(new Date()));
  const [weight,    setWeight]    = useState('');
  const [waist,     setWaist]     = useState('');
  const [bodyFat,   setBodyFat]   = useState('');
  const [steps,     setSteps]     = useState('');
  const [notes,     setNotes]     = useState('');
  const [showMore,  setShowMore]  = useState(false);
  const [height,    setHeight]    = useState('');
  const [age,       setAge]       = useState('');
  const [gender,    setGender]    = useState<Gender | ''>('');
  const [saving,    setSaving]    = useState(false);

  const handle = async () => {
    if (!weight && !waist && !bodyFat) {
      return toast.error('Enter at least one measurement');
    }
    setSaving(true);
    try {
      await bodyMetricsService.upsert({
        date,
        weight:   weight   ? parseFloat(weight)   : undefined,
        waist:    waist    ? parseFloat(waist)     : undefined,
        body_fat: bodyFat  ? parseFloat(bodyFat)   : undefined,
        steps:    steps    ? parseInt(steps)        : undefined,
        height:   height   ? parseFloat(height)    : undefined,
        age:      age      ? parseInt(age)          : undefined,
        gender:   (gender as Gender) || undefined,
        notes:    notes || undefined,
      });
      toast.success('Metrics saved!');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const row = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50';

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Log Metrics</p>
        <button onClick={onClose} className="text-white/30 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <input type="date" value={date} onChange={e => setDate(e.target.value)} className={row} />

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Weight (kg)</label>
          <input type="number" inputMode="decimal" step="0.1" placeholder="75" value={weight} onChange={e => setWeight(e.target.value)} className={row} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Waist (cm)</label>
          <input type="number" inputMode="decimal" step="0.5" placeholder="82" value={waist} onChange={e => setWaist(e.target.value)} className={row} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Body fat %</label>
          <input type="number" inputMode="decimal" step="0.5" placeholder="18" value={bodyFat} onChange={e => setBodyFat(e.target.value)} className={row} />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-muted-foreground block mb-1">Steps today</label>
        <input type="number" inputMode="numeric" placeholder="8000" value={steps} onChange={e => setSteps(e.target.value)} className={row} />
      </div>

      {/* Collapsible profile fields */}
      {showMore ? (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Height (cm)</label>
            <input type="number" inputMode="decimal" placeholder="178" value={height} onChange={e => setHeight(e.target.value)} className={row} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Age</label>
            <input type="number" inputMode="numeric" placeholder="28" value={age} onChange={e => setAge(e.target.value)} className={row} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Gender</label>
            <div className="flex gap-1 h-[42px]">
              {(['male', 'female'] as Gender[]).map(g => (
                <button key={g} onClick={() => setGender(g === gender ? '' : g)}
                  className={`flex-1 rounded-xl text-xs font-medium capitalize ${gender === g ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowMore(true)} className="text-xs text-muted-foreground hover:text-white transition-colors">
          + Height / Age / Gender (for BMR)
        </button>
      )}

      <textarea placeholder="Notes…" value={notes} onChange={e => setNotes(e.target.value)}
        rows={2} className={`${row} resize-none`} />

      <button onClick={handle} disabled={saving}
        className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
        {saving ? 'Saving…' : 'Save Metrics'}
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

const BODY_PR_LABELS: Record<string, string> = {
  lowest_weight: 'Lowest Weight',
  smallest_waist: 'Smallest Waist',
  best_body_fat: 'Best Body Fat',
};

export default function BodyMetricsPage() {
  const [metrics,    setMetrics]    = useState<BodyMetric[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([
        bodyMetricsService.getAll(90),
        activitiesService.getAll(120),
      ]);
      setMetrics(m);
      setActivities(a);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────

  const latest      = metrics[0] ?? null;
  const weightKg    = latest?.weight ?? 0;
  const lastWtDate  = metrics.find(m => m.weight)?.date ?? null;

  // BMR / TDEE (need profile)
  const profile = (() => {
    const weight = metrics.find(m => m.weight)?.weight;
    const height = metrics.find(m => m.height)?.height;
    const age    = metrics.find(m => m.age)?.age;
    const gender = metrics.find(m => m.gender)?.gender;
    if (weight && height && age && gender) return { weight, height, age, gender };
    return null;
  })();

  const bmr  = profile ? calcBMR(profile) : null;
  const tdee = (() => {
    if (!bmr || !weightKg) return null;
    const last7 = activities.filter(a =>
      a.date >= toISODate(subDays(new Date(), 7)),
    );
    const weeklyWorkoutKcal = last7.reduce(
      (sum, a) => sum + calcActivityCalories(a.type, a.duration ?? 30, weightKg).calories,
      0,
    );
    const dailyWorkoutKcal = Math.round(weeklyWorkoutKcal / 7);
    const latestSteps = latest?.steps ?? 0;
    return calcTDEE(bmr, dailyWorkoutKcal, latestSteps);
  })();

  const bmi = weightKg && profile?.height ? calcBMI(weightKg, profile.height) : null;

  const weightPoints = [...metrics]
    .filter(m => m.weight)
    .reverse()
    .slice(-30)
    .map(m => ({ date: m.date, w: m.weight! }));

  const waistPoints = [...metrics]
    .filter(m => m.waist)
    .reverse()
    .slice(-30)
    .map(m => ({ date: m.date, w: m.waist! }));

  const weeklyCalories = weightKg > 0
    ? buildWeeklyCalories(activities, weightKg)
    : [];

  const trend   = calcWeightTrend(weightPoints.map(p => ({ date: p.date, weight: p.w })));
  const stale   = isWeightStale(lastWtDate);
  const warning = dataFreshnessWarning(lastWtDate);
  const daysSince = daysSinceMetric(lastWtDate);

  const bodyPRs = computeBodyPRs(metrics);

  const tickStyle = { fill: 'hsl(220 9% 45%)', fontSize: 10 };
  const tooltipStyle = { background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-safe pb-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Body</h1>
            <p className="text-xs text-muted-foreground">Metrics & composition</p>
          </div>
          <button onClick={() => setShowForm(v => !v)}
            className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">

        {/* Log form */}
        {showForm && <LogForm onSaved={load} onClose={() => setShowForm(false)} />}

        {/* Freshness warning */}
        {warning && (
          <div className="flex items-start gap-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">{warning}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Stats card */}
            {latest && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Current</p>
                  {daysSince !== null && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${stale ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                      {daysSince === 0 ? 'Today' : `${daysSince}d ago`}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Weight',  value: weightKg ? `${weightKg} kg` : '—' },
                    { label: 'Waist',   value: latest.waist   ? `${latest.waist} cm` : '—' },
                    { label: 'BMR',     value: bmr  ? `${bmr.toLocaleString()} kcal` : 'Add profile' },
                    { label: 'TDEE',    value: tdee ? `${tdee.tdee.toLocaleString()} kcal` : '—' },
                    { label: 'Body fat',value: latest.body_fat ? `${latest.body_fat}%` : '—' },
                    { label: 'BMI',     value: bmi  ? `${bmi} (${bmiCategory(bmi)})` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
                {trend && (
                  <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Trend</p>
                      <p className="text-sm font-semibold text-white">{trendLabel(trend)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Est. balance</p>
                      <p className="text-sm font-semibold text-white">{deficitLabel(trend)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Weight trend chart */}
            {weightPoints.length >= 2 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Weight (kg)</p>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={weightPoints} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <XAxis dataKey="date" tickFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'M/d')}
                      tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Line type="monotone" dataKey="w" stroke="hsl(217 91% 60%)" strokeWidth={2.5}
                      dot={false} activeDot={{ r: 4 }} />
                    <Tooltip contentStyle={tooltipStyle}
                      labelFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'MMM d')}
                      formatter={(v: unknown) => [`${Number(v ?? 0)} kg`, 'Weight'] as [string, string]} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Waist trend chart */}
            {waistPoints.length >= 2 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Waist (cm)</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={waistPoints} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <XAxis dataKey="date" tickFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'M/d')}
                      tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Line type="monotone" dataKey="w" stroke="hsl(280 70% 60%)" strokeWidth={2.5}
                      dot={false} activeDot={{ r: 4 }} />
                    <Tooltip contentStyle={tooltipStyle}
                      labelFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'MMM d')}
                      formatter={(v: unknown) => [`${Number(v ?? 0)} cm`, 'Waist'] as [string, string]} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weekly workout calories */}
            {weeklyCalories.length >= 2 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Workout kcal / month</p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={weeklyCalories} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <XAxis dataKey="week" tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
                    <Bar dataKey="kcal" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: unknown) => [`${Number(v ?? 0).toLocaleString()} kcal`, 'Workout'] as [string, string]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Body PRs */}
            {bodyPRs.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  <Trophy className="inline w-3.5 h-3.5 mr-1 text-yellow-400" />
                  Body Records
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {bodyPRs.map(pr => (
                    <div key={pr.type} className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                      <p className="text-base font-bold text-white">{pr.value}{pr.unit}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        {BODY_PR_LABELS[pr.type]}
                      </p>
                      <p className="text-[9px] text-white/25 mt-0.5">
                        {format(new Date(pr.date + 'T12:00:00'), 'MMM d, yy')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent entries */}
            {metrics.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">History</p>
                <div className="space-y-2">
                  {metrics.slice(0, 10).map(m => (
                    <div key={m.id} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">
                          {format(new Date(m.date + 'T12:00:00'), 'EEE, MMM d')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            m.weight   && `${m.weight}kg`,
                            m.waist    && `${m.waist}cm waist`,
                            m.body_fat && `${m.body_fat}% BF`,
                          ].filter(Boolean).join(' · ') || 'No measurements'}
                        </p>
                      </div>
                      {m.steps && (
                        <p className="text-xs text-muted-foreground flex-shrink-0">
                          {m.steps.toLocaleString()} steps
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {metrics.length === 0 && !showForm && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-4xl mb-4">📏</p>
                <p className="text-sm font-semibold text-white mb-1">No metrics yet</p>
                <p className="text-xs text-muted-foreground mb-6">Tap + to log your first body measurement</p>
                <button onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold">
                  <Plus className="w-4 h-4" /> Log Metrics
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
