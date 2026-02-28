import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Activity, ChevronDown, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Goal, GoalType, Exercise, PRRecord, BodyMetric } from '@/types';
import { goalsService } from '@/services/goals';
import { exercisesService } from '@/services/exercises';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { strengthSetsService } from '@/services/strengthSets';
import { toISODate } from '@/lib/utils';

const GOAL_LABELS: Record<GoalType, string> = {
  weight:           'Body Weight',
  waist:            'Waist',
  body_fat:         'Body Fat %',
  lift:             'Lift (1RM)',
  cardio_distance:  'Distance',
  cardio_time:      'Cardio Time',
};

const GOAL_UNITS: Record<GoalType, string> = {
  weight:           'kg',
  waist:            'cm',
  body_fat:         '%',
  lift:             'kg',
  cardio_distance:  'km',
  cardio_time:      'min',
};

const GOAL_TYPES = Object.keys(GOAL_LABELS) as GoalType[];

// Custom exercise picker (avoids native <select> styling issues)
function ExercisePicker({
  exercises,
  value,
  onChange,
}: {
  exercises: Exercise[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const selected = exercises.find(e => e.id === value);
  const filtered = exercises
    .filter(e => e.category !== 'cardio')
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-left"
      >
        <span className={selected ? 'text-white font-medium' : 'text-white/30'}>
          {selected?.name ?? 'Choose exercise…'}
        </span>
        <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-[#1c1c1c] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <input
            autoFocus
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/30 border-b border-white/10 focus:outline-none"
          />
          <div className="max-h-44 overflow-y-auto">
            {filtered.map(ex => (
              <button
                key={ex.id}
                onMouseDown={() => { onChange(ex.id); setOpen(false); setSearch(''); }}
                className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 flex items-center justify-between"
              >
                <span>{ex.name}</span>
                <span className="text-xs text-muted-foreground">{ex.category}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted-foreground">No exercises found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const [goals,     setGoals]     = useState<Goal[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [metrics,   setMetrics]   = useState<BodyMetric | null>(null);
  const [prs,       setPRs]       = useState<PRRecord[]>([]);
  const [showForm,  setShowForm]  = useState(false);

  // Goal form
  const [formLabel,    setFormLabel]    = useState('');
  const [formType,     setFormType]     = useState<GoalType>('weight');
  const [formValue,    setFormValue]    = useState('');
  const [formDate,     setFormDate]     = useState('');
  const [formExercise, setFormExercise] = useState('');
  const [saving,       setSaving]       = useState(false);

  // Body metrics log form
  const [showMetrics, setShowMetrics] = useState(false);
  const [mWeight,     setMWeight]     = useState('');
  const [mWaist,      setMWaist]      = useState('');
  const [mBodyFat,    setMBodyFat]    = useState('');
  const [mDate,       setMDate]       = useState(toISODate(new Date()));
  const [savingM,     setSavingM]     = useState(false);

  const load = useCallback(async () => {
    const [g, exs, ms, prData] = await Promise.all([
      goalsService.getAll().catch(() => [] as Goal[]),
      exercisesService.getAll().catch(() => [] as Exercise[]),
      bodyMetricsService.getAll(1).catch(() => [] as BodyMetric[]),
      strengthSetsService.getPRs().catch(() => [] as PRRecord[]),
    ]);
    setGoals(g);
    setExercises(exs);
    setMetrics(ms[0] ?? null);
    setPRs(prData);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getCurrent = (goal: Goal): number | null => {
    if (goal.type === 'weight'   && metrics?.weight)   return metrics.weight;
    if (goal.type === 'waist'    && metrics?.waist)    return metrics.waist;
    if (goal.type === 'body_fat' && metrics?.body_fat) return metrics.body_fat;
    if (goal.type === 'lift' && goal.exercise_id) {
      const pr = prs.find(p => p.exercise_id === goal.exercise_id);
      if (pr) return Math.round(Number(pr.estimated_1rm));
    }
    return null;
  };

  const goalDisplayName = (goal: Goal) => {
    if (goal.notes) return goal.notes;
    const base = GOAL_LABELS[goal.type];
    if (goal.type === 'lift' && goal.exercise_id) {
      const ex = exercises.find(e => e.id === goal.exercise_id);
      return ex ? `${base} · ${ex.name}` : base;
    }
    return base;
  };

  const handleAdd = async () => {
    if (!formValue || parseFloat(formValue) <= 0) return toast.error('Enter a target value');
    if (formType === 'lift' && !formExercise) return toast.error('Pick an exercise');
    setSaving(true);
    try {
      await goalsService.create({
        type:         formType,
        target_value: parseFloat(formValue),
        target_date:  formDate || undefined,
        exercise_id:  formType === 'lift' ? formExercise : undefined,
        notes:        formLabel || undefined,
        is_active:    true,
      });
      toast.success('Goal added');
      setShowForm(false);
      setFormLabel(''); setFormValue(''); setFormDate(''); setFormExercise('');
      setFormType('weight');
      await load();
    } catch {
      toast.error('Failed to save goal');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await goalsService.delete(id);
      setGoals(prev => prev.filter(g => g.id !== id));
      toast.success('Goal removed');
    } catch {
      toast.error('Failed to delete goal');
    }
  };

  const handleLogMetrics = async () => {
    if (!mWeight && !mWaist && !mBodyFat) return toast.error('Enter at least one measurement');
    setSavingM(true);
    try {
      await bodyMetricsService.upsert({
        date:     mDate,
        weight:   mWeight  ? parseFloat(mWeight)  : undefined,
        waist:    mWaist   ? parseFloat(mWaist)   : undefined,
        body_fat: mBodyFat ? parseFloat(mBodyFat) : undefined,
      });
      toast.success('Metrics saved!');
      setMWeight(''); setMWaist(''); setMBodyFat('');
      setShowMetrics(false);
      await load();
    } catch {
      toast.error('Failed to save metrics');
    } finally {
      setSavingM(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-safe pb-4 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">Goals</h1>
        <p className="text-xs text-muted-foreground">Track your targets</p>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">

        {/* ── Body Metrics card ── */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Body Metrics</p>
            <button
              onClick={() => setShowMetrics(v => !v)}
              className="flex items-center gap-1.5 text-xs text-primary font-medium"
            >
              <Activity className="w-3.5 h-3.5" />
              Log today
            </button>
          </div>

          {metrics ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                {metrics.weight   != null && (
                  <div>
                    <p className="text-xl font-bold text-white">{metrics.weight}</p>
                    <p className="text-xs text-muted-foreground">kg</p>
                  </div>
                )}
                {metrics.waist    != null && (
                  <div>
                    <p className="text-xl font-bold text-white">{metrics.waist}</p>
                    <p className="text-xs text-muted-foreground">cm waist</p>
                  </div>
                )}
                {metrics.body_fat != null && (
                  <div>
                    <p className="text-xl font-bold text-white">{metrics.body_fat}%</p>
                    <p className="text-xs text-muted-foreground">body fat</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Last updated {format(new Date(metrics.date + 'T12:00:00'), 'MMM d, yyyy')}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No metrics yet — tap "Log today" to add your first entry
            </p>
          )}

          {/* Inline metrics form */}
          {showMetrics && (
            <div className="mt-4 pt-4 border-t border-white/8 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Date</label>
                <input
                  type="date"
                  value={mDate}
                  onChange={e => setMDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: 'Weight (kg)', placeholder: '75.0', value: mWeight,  set: setMWeight  },
                  { label: 'Waist (cm)',  placeholder: '80',   value: mWaist,   set: setMWaist   },
                  { label: 'Body fat %',  placeholder: '18',   value: mBodyFat, set: setMBodyFat },
                ] as const).map(f => (
                  <div key={f.label}>
                    <label className="text-[10px] text-muted-foreground block mb-1">{f.label}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder={f.placeholder}
                      value={f.value}
                      onChange={e => f.set(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 text-center"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleLogMetrics}
                  disabled={savingM}
                  className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {savingM ? 'Saving…' : 'Save Metrics'}
                </button>
                <button
                  onClick={() => setShowMetrics(false)}
                  className="px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Goals list ── */}
        {goals.length > 0 && (
          <div className="space-y-3">
            {goals.map(goal => {
              const current = getCurrent(goal);
              const name = goalDisplayName(goal);
              const pct = goal.type === 'lift' && current !== null
                ? Math.min(100, Math.round((current / goal.target_value) * 100))
                : null;
              const reached = current !== null && (
                goal.type === 'lift'
                  ? current >= goal.target_value
                  : current <= goal.target_value
              );

              return (
                <div key={goal.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-medium text-white">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="text-white/60">{GOAL_LABELS[goal.type]}</span>
                        {' · '}Target: <span className="text-white font-medium">{goal.target_value} {GOAL_UNITS[goal.type]}</span>
                        {goal.target_date && ` · by ${format(new Date(goal.target_date + 'T12:00:00'), 'MMM d, yyyy')}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="p-1.5 text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {current !== null ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Current: <span className="text-white">{current} {GOAL_UNITS[goal.type]}</span>
                        </span>
                        {reached
                          ? <span className="text-green-400 font-medium">🎯 Reached!</span>
                          : pct !== null && <span className="text-primary font-medium">{pct}%</span>
                        }
                      </div>
                      {pct !== null && (
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${reached ? 'bg-green-500' : 'bg-primary'}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No data yet to compare</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {goals.length === 0 && !showForm && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <p className="text-3xl mb-2">🎯</p>
            <p className="text-sm text-muted-foreground">No goals yet</p>
            <p className="text-xs text-muted-foreground mt-1">Set targets to stay on track</p>
          </div>
        )}

        {/* ── Add goal form ── */}
        {showForm ? (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">New Goal</p>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Goal label (name) */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Goal name <span className="text-white/30">(optional — e.g. "Run 40km", "Beach body")</span>
              </label>
              <input
                type="text"
                placeholder="Leave blank to use the category name"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* Metric type */}
            <div>
              <label className="text-xs text-muted-foreground block mb-2">What are you tracking?</label>
              <div className="flex flex-wrap gap-1.5">
                {GOAL_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setFormType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      formType === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    {GOAL_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Exercise picker for lift goals (custom — no native select) */}
            {formType === 'lift' && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Exercise</label>
                <ExercisePicker
                  exercises={exercises}
                  value={formExercise}
                  onChange={setFormExercise}
                />
              </div>
            )}

            {/* Target value */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Target ({GOAL_UNITS[formType]})
                {formType === 'cardio_distance' && ' — e.g. 42.2 for a marathon'}
                {formType === 'cardio_time'     && ' — minutes, e.g. 30'}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="e.g. 80"
                value={formValue}
                onChange={e => setFormValue(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* Target date */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Target date <span className="text-white/30">(optional)</span>
              </label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-primary/50"
              />
            </div>

            <button
              onClick={handleAdd}
              disabled={saving}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Goal'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-white/20 rounded-2xl py-3.5 text-sm text-muted-foreground hover:text-white hover:border-white/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add goal
          </button>
        )}
      </main>
    </div>
  );
}
