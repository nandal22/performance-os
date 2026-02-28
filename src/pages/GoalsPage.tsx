import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Activity } from 'lucide-react';
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
  cardio_distance:  'Cardio Distance',
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

export default function GoalsPage() {
  const [goals,     setGoals]     = useState<Goal[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [metrics,   setMetrics]   = useState<BodyMetric | null>(null);
  const [prs,       setPRs]       = useState<PRRecord[]>([]);
  const [showForm,  setShowForm]  = useState(false);

  // Goal form state
  const [formType,     setFormType]     = useState<GoalType>('weight');
  const [formValue,    setFormValue]    = useState('');
  const [formDate,     setFormDate]     = useState('');
  const [formExercise, setFormExercise] = useState('');
  const [saving,       setSaving]       = useState(false);

  // Body metrics log form
  const [showMetrics,  setShowMetrics]  = useState(false);
  const [mWeight,      setMWeight]      = useState('');
  const [mWaist,       setMWaist]       = useState('');
  const [mBodyFat,     setMBodyFat]     = useState('');
  const [mDate,        setMDate]        = useState(toISODate(new Date()));
  const [savingM,      setSavingM]      = useState(false);

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

  // Compute current value for a goal
  const getCurrent = (goal: Goal): number | null => {
    if (goal.type === 'weight'    && metrics?.weight)    return metrics.weight;
    if (goal.type === 'waist'     && metrics?.waist)     return metrics.waist;
    if (goal.type === 'body_fat'  && metrics?.body_fat)  return metrics.body_fat;
    if (goal.type === 'lift' && goal.exercise_id) {
      const pr = prs.find(p => p.exercise_id === goal.exercise_id);
      if (pr) return Math.round(Number(pr.estimated_1rm));
    }
    return null;
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
        is_active:    true,
      });
      toast.success('Goal added');
      setShowForm(false);
      setFormValue('');
      setFormDate('');
      setFormExercise('');
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
        weight:   mWeight   ? parseFloat(mWeight)   : undefined,
        waist:    mWaist    ? parseFloat(mWaist)     : undefined,
        body_fat: mBodyFat  ? parseFloat(mBodyFat)   : undefined,
      });
      toast.success('Metrics logged!');
      setMWeight(''); setMWaist(''); setMBodyFat('');
      setShowMetrics(false);
      await load(); // refresh goals progress
    } catch {
      toast.error('Failed to save metrics');
    } finally {
      setSavingM(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-6 pb-4 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">Goals</h1>
        <p className="text-xs text-muted-foreground">Track your targets</p>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">

        {/* Current metrics snapshot */}
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

          {/* Current values */}
          {metrics ? (
            <div className="grid grid-cols-3 gap-3 text-center mb-2">
              {metrics.weight   != null && <div><p className="text-lg font-bold text-white">{metrics.weight}</p><p className="text-xs text-muted-foreground">kg</p></div>}
              {metrics.waist    != null && <div><p className="text-lg font-bold text-white">{metrics.waist}</p><p className="text-xs text-muted-foreground">cm waist</p></div>}
              {metrics.body_fat != null && <div><p className="text-lg font-bold text-white">{metrics.body_fat}%</p><p className="text-xs text-muted-foreground">body fat</p></div>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mb-2">No metrics logged yet — tap "Log today" to start</p>
          )}
          {metrics && (
            <p className="text-[10px] text-muted-foreground">
              Last updated {format(new Date(metrics.date + 'T12:00:00'), 'MMM d, yyyy')}
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Weight (kg)', placeholder: '75.0', value: mWeight, set: setMWeight },
                  { label: 'Waist (cm)',  placeholder: '80',   value: mWaist,  set: setMWaist  },
                  { label: 'Body fat %',  placeholder: '18',   value: mBodyFat, set: setMBodyFat },
                ].map(f => (
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
                  className="px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Goals list */}
        {goals.length > 0 && (
          <div className="space-y-3">
            {goals.map(goal => {
              const current = getCurrent(goal);
              const exName = goal.exercise_id
                ? exercises.find(e => e.id === goal.exercise_id)?.name ?? ''
                : '';
              // Progress % only for lift goals (higher = better)
              const pct = goal.type === 'lift' && current !== null
                ? Math.min(100, Math.round((current / goal.target_value) * 100))
                : null;

              return (
                <div key={goal.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-medium text-white">
                        {GOAL_LABELS[goal.type]}{exName ? ` · ${exName}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Target: <span className="text-white font-medium">{goal.target_value} {GOAL_UNITS[goal.type]}</span>
                        {goal.target_date && ` by ${format(new Date(goal.target_date + 'T12:00:00'), 'MMM d, yyyy')}`}
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
                        {pct !== null && (
                          <span className={pct >= 100 ? 'text-green-400 font-medium' : 'text-primary font-medium'}>
                            {pct >= 100 ? '🎯 Reached!' : `${pct}%`}
                          </span>
                        )}
                        {pct === null && current <= goal.target_value && (
                          <span className="text-green-400 font-medium">🎯 Reached!</span>
                        )}
                      </div>
                      {pct !== null && (
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-primary'}`}
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

        {/* Add goal form */}
        {showForm ? (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">New Goal</p>

            {/* Type pills */}
            <div className="flex flex-wrap gap-1.5">
              {GOAL_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setFormType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    formType === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                  }`}
                >
                  {GOAL_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Exercise picker for lift goals */}
            {formType === 'lift' && (
              <select
                value={formExercise}
                onChange={e => setFormExercise(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
              >
                <option value="">Choose exercise…</option>
                {exercises.filter(e => e.category !== 'cardio').map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}

            {/* Target value */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Target ({GOAL_UNITS[formType]})
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="e.g. 80"
                value={formValue}
                onChange={e => setFormValue(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* Optional target date */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Target date (optional)</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Add Goal'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-5 bg-white/5 border border-white/10 rounded-xl text-sm text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-white/20 rounded-2xl py-3 text-sm text-muted-foreground hover:text-white hover:border-white/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add goal
          </button>
        )}
      </main>
    </div>
  );
}
