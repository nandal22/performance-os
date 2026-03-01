import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ChevronDown, X, Target } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Goal, GoalType, GoalLog, Exercise } from '@/types';
import { goalsService } from '@/services/goals';
import { goalLogsService } from '@/services/goalLogs';
import { exercisesService } from '@/services/exercises';
import { toISODate } from '@/lib/utils';

const GOAL_LABELS: Record<GoalType, string> = {
  weight: 'Body Weight', waist: 'Waist', body_fat: 'Body Fat %',
  lift: 'Lift PR', cardio_distance: 'Distance', cardio_time: 'Cardio Time',
};
const GOAL_UNITS: Record<GoalType, string> = {
  weight: 'kg', waist: 'cm', body_fat: '%',
  lift: 'kg', cardio_distance: 'km', cardio_time: 'min',
};
const FORM_TYPES: { type: GoalType; label: string }[] = [
  { type: 'lift', label: 'Lift / PR' },
  { type: 'cardio_distance', label: 'Distance' },
  { type: 'cardio_time', label: 'Time' },
  { type: 'weight', label: 'Body Weight' },
];

function goalDisplayName(goal: Goal, exercises: Exercise[]): string {
  if (goal.notes) return goal.notes;
  if (goal.type === 'lift' && goal.exercise_id) {
    const ex = exercises.find(e => e.id === goal.exercise_id);
    return ex ? `${ex.name} PR` : GOAL_LABELS.lift;
  }
  return GOAL_LABELS[goal.type];
}
function getBestLog(logs: GoalLog[]): number | null {
  if (!logs.length) return null;
  return Math.max(...logs.map(l => l.value));
}
function getProgress(goal: Goal, best: number | null): number | null {
  if (best === null) return null;
  const higherIsBetter = goal.type === 'lift' || goal.type === 'cardio_distance' || goal.type === 'cardio_time';
  return Math.min(100, Math.round(higherIsBetter ? (best / goal.target_value) * 100 : (goal.target_value / best) * 100));
}
function isReached(goal: Goal, best: number | null): boolean {
  if (best === null) return false;
  return (goal.type === 'lift' || goal.type === 'cardio_distance' || goal.type === 'cardio_time')
    ? best >= goal.target_value
    : best <= goal.target_value;
}

function ExercisePicker({ exercises, value, onChange }: { exercises: Exercise[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const selected = exercises.find(e => e.id === value);
  const filtered = exercises.filter(e => e.category !== 'cardio').filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase())).slice(0, 12);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-left">
        <span className={selected ? 'text-white font-medium' : 'text-white/30'}>{selected?.name ?? 'Choose exercise…'}</span>
        <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-[hsl(var(--card))] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <input autoFocus type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/30 border-b border-white/10 focus:outline-none" />
          <div className="max-h-44 overflow-y-auto">
            {filtered.map(ex => (
              <button key={ex.id} type="button" onMouseDown={() => { onChange(ex.id); setOpen(false); setSearch(''); }}
                className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 flex items-center justify-between">
                <span>{ex.name}</span>
                <span className="text-xs text-muted-foreground">{ex.category}</span>
              </button>
            ))}
            {!filtered.length && <p className="px-3 py-3 text-sm text-muted-foreground">No exercises found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const [goals,     setGoals]     = useState<Goal[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [goalLogs,  setGoalLogs]  = useState<Record<string, GoalLog[]>>({});
  const [loading,   setLoading]   = useState(true);

  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showForm,       setShowForm]       = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState<string | null>(null);

  const [logValue,  setLogValue]  = useState('');
  const [logReps,   setLogReps]   = useState('');
  const [logDate,   setLogDate]   = useState(toISODate(new Date()));
  const [savingLog, setSavingLog] = useState(false);

  const [formName,       setFormName]       = useState('');
  const [formType,       setFormType]       = useState<GoalType>('lift');
  const [formTarget,     setFormTarget]     = useState('');
  const [formTargetReps, setFormTargetReps] = useState('');
  const [formExercise,   setFormExercise]   = useState('');
  const [formDate,       setFormDate]       = useState('');
  const [savingGoal,     setSavingGoal]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gs, exs] = await Promise.all([
        goalsService.getAll().catch(() => [] as Goal[]),
        exercisesService.getAll().catch(() => [] as Exercise[]),
      ]);
      setGoals(gs);
      setExercises(exs);
      const entries = await Promise.all(
        gs.map(g => goalLogsService.getByGoal(g.id).then(logs => [g.id, logs] as [string, GoalLog[]]).catch(() => [g.id, []] as [string, GoalLog[]]))
      );
      setGoalLogs(Object.fromEntries(entries));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLogProgress = async (goalId: string) => {
    if (!logValue || parseFloat(logValue) <= 0) return toast.error('Enter a value');
    setSavingLog(true);
    try {
      const newLog = await goalLogsService.create({
        goal_id: goalId, date: logDate, value: parseFloat(logValue),
        reps: logReps ? parseInt(logReps) : undefined,
      });
      setGoalLogs(prev => ({ ...prev, [goalId]: [newLog, ...(prev[goalId] ?? [])] }));
      setLogValue(''); setLogReps(''); setExpandedGoalId(null);
      toast.success('Progress logged!');
    } catch { toast.error('Failed to log progress'); }
    finally { setSavingLog(false); }
  };

  const handleDeleteGoal = async (id: string) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    try {
      await goalsService.delete(id);
      setGoals(prev => prev.filter(g => g.id !== id));
      setGoalLogs(prev => { const n = { ...prev }; delete n[id]; return n; });
      setConfirmDelete(null);
      toast.success('Goal removed');
    } catch { toast.error('Failed to delete goal'); }
  };

  const handleAddGoal = async () => {
    if (!formName.trim()) return toast.error('Enter a goal name');
    if (!formTarget || parseFloat(formTarget) <= 0) return toast.error('Enter a target value');
    if (formType === 'lift' && !formExercise) return toast.error('Pick an exercise');
    setSavingGoal(true);
    try {
      const created = await goalsService.create({
        type: formType, target_value: parseFloat(formTarget),
        target_reps: formType === 'lift' && formTargetReps ? parseInt(formTargetReps) : undefined,
        target_date: formDate || undefined,
        exercise_id: formType === 'lift' ? formExercise : undefined,
        notes: formName.trim(), is_active: true,
      });
      setGoals(prev => [created, ...prev]);
      setGoalLogs(prev => ({ ...prev, [created.id]: [] }));
      setShowForm(false);
      setFormName(''); setFormType('lift'); setFormTarget(''); setFormTargetReps(''); setFormExercise(''); setFormDate('');
      toast.success('Goal added!');
    } catch { toast.error('Failed to save goal'); }
    finally { setSavingGoal(false); }
  };

  const openLogForm = (goalId: string) => {
    setExpandedGoalId(expandedGoalId === goalId ? null : goalId);
    setLogValue(''); setLogReps(''); setLogDate(toISODate(new Date())); setConfirmDelete(null);
  };

  const fieldCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-safe pb-4 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">Goals</h1>
        <p className="text-xs text-muted-foreground">Track your targets</p>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-nav">

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {!loading && !goals.length && !showForm && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Target className="w-12 h-12 text-white/10 mb-4" />
            <p className="text-sm font-semibold text-white mb-1">Set your first goal</p>
            <p className="text-xs text-muted-foreground mb-6">Define a target and start logging progress</p>
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold">
              <Plus className="w-4 h-4" /> Add Goal
            </button>
          </div>
        )}

        {!loading && goals.map(goal => {
          const logs = goalLogs[goal.id] ?? [];
          const best = getBestLog(logs);
          const pct  = getProgress(goal, best);
          const reached = isReached(goal, best);
          const name    = goalDisplayName(goal, exercises);
          const isExpanded   = expandedGoalId === goal.id;
          const isConfirming = confirmDelete === goal.id;

          return (
            <div key={goal.id} className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-semibold text-white truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Target:{' '}
                      <span className="text-white font-medium">
                        {goal.target_value} {GOAL_UNITS[goal.type]}
                        {goal.target_reps && goal.type === 'lift' ? ` × ${goal.target_reps}` : ''}
                      </span>
                      {goal.target_date && ` · by ${format(new Date(goal.target_date + 'T12:00:00'), 'MMM d, yyyy')}`}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteGoal(goal.id)} onBlur={() => setConfirmDelete(null)}
                    className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${isConfirming ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-white/20 hover:text-red-400'}`}>
                    {isConfirming ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {best !== null ? (
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Best: <span className="text-white font-medium">{best} {GOAL_UNITS[goal.type]}</span></span>
                      {reached ? <span className="text-green-400 font-semibold">Goal reached!</span> : pct !== null && <span className="text-primary font-medium">{pct}%</span>}
                    </div>
                    {pct !== null && (
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${reached ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mb-3">No logs yet — tap to start logging</p>
                )}

                <button onClick={() => openLogForm(goal.id)}
                  className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${isExpanded ? 'bg-white/10 text-muted-foreground' : 'bg-primary/15 text-primary hover:bg-primary/20'}`}>
                  {isExpanded ? 'Cancel' : '+ Log Progress'}
                </button>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/[0.08] pt-3 space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground block mb-1">Value ({GOAL_UNITS[goal.type]})</label>
                      <input type="number" inputMode="decimal" step="0.5" placeholder={goal.type === 'lift' ? '80' : '5.0'}
                        value={logValue} onChange={e => setLogValue(e.target.value)}
                        className={`${fieldCls} text-center font-bold`} />
                    </div>
                    {goal.type === 'lift' && (
                      <div className="w-20">
                        <label className="text-[10px] text-muted-foreground block mb-1">Reps</label>
                        <input type="number" inputMode="numeric" placeholder="3" value={logReps} onChange={e => setLogReps(e.target.value)}
                          className={`${fieldCls} text-center font-bold`} />
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground block mb-1">Date</label>
                      <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <button onClick={() => handleLogProgress(goal.id)} disabled={savingLog || !logValue}
                    className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40">
                    {savingLog ? 'Saving…' : 'Save'}
                  </button>
                  {logs.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Recent</p>
                      {logs.slice(0, 5).map(l => (
                        <div key={l.id} className="flex items-center justify-between text-xs py-1">
                          <span className="text-muted-foreground">{format(new Date(l.date + 'T12:00:00'), 'MMM d')}</span>
                          <span className="text-white font-medium">{l.value} {GOAL_UNITS[goal.type]}{l.reps ? ` x${l.reps}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && goals.length > 0 && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-white/20 rounded-2xl py-3.5 text-sm text-muted-foreground hover:text-white hover:border-white/30 transition-colors">
            <Plus className="w-4 h-4" /> Add Goal
          </button>
        )}

        {showForm && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">New Goal</p>
              <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Goal name <span className="text-red-400">*</span></label>
              <input type="text" placeholder="e.g. 100kg Bench Press" value={formName} onChange={e => setFormName(e.target.value)} className={fieldCls} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-2">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {FORM_TYPES.map(({ type, label }) => (
                  <button key={type} type="button" onClick={() => { setFormType(type); setFormExercise(''); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${formType === type ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {formType === 'lift' && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Exercise</label>
                <ExercisePicker exercises={exercises} value={formExercise} onChange={setFormExercise} />
              </div>
            )}

            <div className={formType === 'lift' ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Target ({GOAL_UNITS[formType]})</label>
                <input type="number" inputMode="decimal" step="0.5"
                  placeholder={formType === 'cardio_distance' ? '42.2' : formType === 'cardio_time' ? '30' : formType === 'weight' ? '75' : '100'}
                  value={formTarget} onChange={e => setFormTarget(e.target.value)} className={fieldCls} />
              </div>
              {formType === 'lift' && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Target reps <span className="text-white/30">(optional)</span></label>
                  <input type="number" inputMode="numeric" placeholder="e.g. 3"
                    value={formTargetReps} onChange={e => setFormTargetReps(e.target.value)} className={fieldCls} />
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Target date <span className="text-white/30">(optional)</span></label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-primary/50" />
            </div>

            <button onClick={handleAddGoal} disabled={savingGoal}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition-opacity">
              {savingGoal ? 'Saving…' : 'Add Goal'}
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
