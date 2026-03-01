import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ChevronDown, X, Target } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Goal, GoalType, GoalLog, Exercise } from '@/types';
import { goalsService } from '@/services/goals';
import { goalLogsService } from '@/services/goalLogs';
import { exercisesService } from '@/services/exercises';
import { toISODate } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const GOAL_LABELS: Record<GoalType, string> = {
  weight: 'Body Weight', waist: 'Waist', body_fat: 'Body Fat %',
  lift: 'Lift PR', cardio_distance: 'Distance', cardio_time: 'Cardio Time',
};
const GOAL_UNITS: Record<GoalType, string> = {
  weight: 'kg', waist: 'cm', body_fat: '%',
  lift: 'kg', cardio_distance: 'km', cardio_time: 'min',
};
const FORM_TYPES: { type: GoalType; label: string }[] = [
  { type: 'lift',            label: 'Lift / PR'    },
  { type: 'cardio_distance', label: 'Distance'     },
  { type: 'cardio_time',     label: 'Time'         },
  { type: 'weight',          label: 'Body Weight'  },
];
const TYPE_CONFIG: Record<GoalType, { bg: string; text: string; icon: string }> = {
  lift:            { bg: 'bg-blue-500/10',   text: 'text-blue-400',   icon: '💪' },
  cardio_distance: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: '🏃' },
  cardio_time:     { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: '⏱️' },
  weight:          { bg: 'bg-green-500/10',  text: 'text-green-400',  icon: '⚖️' },
  waist:           { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: '📏' },
  body_fat:        { bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: '📊' },
};

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
  return Math.min(100, Math.round(
    higherIsBetter ? (best / goal.target_value) * 100 : (goal.target_value / best) * 100,
  ));
}
function isReached(goal: Goal, best: number | null): boolean {
  if (best === null) return false;
  return (goal.type === 'lift' || goal.type === 'cardio_distance' || goal.type === 'cardio_time')
    ? best >= goal.target_value
    : best <= goal.target_value;
}

// ── Exercise dropdown ────────────────────────────────────────────────────────

function ExercisePicker({ exercises, value, onChange }: {
  exercises: Exercise[]; value: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected  = exercises.find(e => e.id === value);
  const filtered  = exercises
    .filter(e => e.category !== 'cardio')
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20);

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between glass rounded-2xl px-3.5 py-2.5 text-sm text-left"
      >
        <span className={selected ? 'text-white font-medium' : 'text-white/30'}>
          {selected?.name ?? 'Choose exercise…'}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
          <ChevronDown className="w-4 h-4 text-white/30" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute top-full left-0 right-0 z-30 mt-2 rounded-2xl overflow-hidden"
            style={{
              background: 'hsl(220 15% 9%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <input
              autoFocus
              type="text"
              placeholder="Search exercises…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 border-b border-white/[0.07] focus:outline-none"
            />
            <div className="max-h-48 overflow-y-auto">
              {filtered.map(ex => (
                <motion.button
                  key={ex.id}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onMouseDown={() => { onChange(ex.id); setOpen(false); setSearch(''); }}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-white hover:bg-white/[0.05] flex items-center justify-between transition-colors"
                >
                  <span>{ex.name}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">{ex.category}</span>
                </motion.button>
              ))}
              {!filtered.length && (
                <p className="px-3.5 py-4 text-sm text-muted-foreground text-center">No exercises found</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

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
        gs.map(g =>
          goalLogsService.getByGoal(g.id)
            .then(logs => [g.id, logs] as [string, GoalLog[]])
            .catch(() => [g.id, []] as [string, GoalLog[]]),
        ),
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
      setFormName(''); setFormType('lift'); setFormTarget('');
      setFormTargetReps(''); setFormExercise(''); setFormDate('');
      toast.success('Goal added!');
    } catch { toast.error('Failed to save goal'); }
    finally { setSavingGoal(false); }
  };

  const openLogForm = (goalId: string) => {
    setExpandedGoalId(expandedGoalId === goalId ? null : goalId);
    setLogValue(''); setLogReps(''); setLogDate(toISODate(new Date())); setConfirmDelete(null);
  };

  const fieldCls = 'w-full glass rounded-2xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-colors';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white tracking-tight">Goals</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">Track your targets</p>
      </header>

      <main className="flex-1 px-4 py-5 space-y-3 max-w-lg mx-auto w-full pb-nav">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !goals.length && !showForm && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Target className="w-7 h-7 text-primary/60" />
            </div>
            <p className="text-base font-bold text-white mb-1">Set your first goal</p>
            <p className="text-[12px] text-muted-foreground mb-6 leading-relaxed">
              Define a target and start<br />tracking your progress
            </p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-primary text-white rounded-2xl px-5 py-2.5 text-sm font-semibold glow-blue"
            >
              <Plus className="w-4 h-4" /> Add Goal
            </motion.button>
          </motion.div>
        )}

        {/* Goal cards */}
        <AnimatePresence>
          {!loading && goals.map((goal, i) => {
            const logs    = goalLogs[goal.id] ?? [];
            const best    = getBestLog(logs);
            const pct     = getProgress(goal, best);
            const reached = isReached(goal, best);
            const name    = goalDisplayName(goal, exercises);
            const cfg     = TYPE_CONFIG[goal.type];
            const isExpanded   = expandedGoalId === goal.id;
            const isConfirming = confirmDelete === goal.id;

            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 380, damping: 28 }}
                className="glass rounded-2xl overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    {/* Type icon */}
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <span className="text-lg">{cfg.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate leading-tight">{name}</p>
                      <p className={`text-[11px] mt-0.5 ${cfg.text}`}>
                        Target: {goal.target_value} {GOAL_UNITS[goal.type]}
                        {goal.target_reps && goal.type === 'lift' ? ` × ${goal.target_reps}` : ''}
                        {goal.target_date ? ` · ${format(new Date(goal.target_date + 'T12:00:00'), 'MMM d, yyyy')}` : ''}
                      </p>
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={() => handleDeleteGoal(goal.id)}
                      onBlur={() => setConfirmDelete(null)}
                      className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                        isConfirming
                          ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                          : 'text-white/20 hover:text-red-400 hover:bg-red-500/10'
                      }`}
                    >
                      {isConfirming ? 'Delete?' : <Trash2 className="w-3.5 h-3.5" />}
                    </motion.button>
                  </div>

                  {/* Progress section */}
                  {best !== null ? (
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Best:{' '}
                          <span className="text-white font-semibold nums">
                            {best} {GOAL_UNITS[goal.type]}
                          </span>
                        </span>
                        {reached ? (
                          <span className="text-green-400 font-bold">✓ Reached!</span>
                        ) : pct !== null ? (
                          <span className={`font-bold nums ${cfg.text}`}>{pct}%</span>
                        ) : null}
                      </div>
                      {pct !== null && (
                        <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, pct)}%` }}
                            transition={{ delay: 0.2 + i * 0.04, duration: 0.7, ease: [0.34, 1.26, 0.64, 1] }}
                            className={`h-full rounded-full ${reached ? 'bg-green-500' : 'bg-primary'}`}
                            style={reached ? {} : {
                              boxShadow: `0 0 8px hsl(217 91% 62% / 0.5)`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mb-3">No entries yet — tap to start</p>
                  )}

                  {/* Log progress button */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => openLogForm(goal.id)}
                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${
                      isExpanded
                        ? 'bg-white/[0.06] text-muted-foreground'
                        : 'bg-primary/12 text-primary hover:bg-primary/18'
                    }`}
                    style={{ backgroundColor: isExpanded ? undefined : 'hsl(217 91% 62% / 0.12)' }}
                  >
                    {isExpanded ? 'Cancel' : '+ Log Progress'}
                  </motion.button>
                </div>

                {/* Expanded log form */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 border-t border-white/[0.07] pt-3 space-y-3">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                              Value ({GOAL_UNITS[goal.type]})
                            </label>
                            <input
                              type="number" inputMode="decimal" step="0.5"
                              placeholder={goal.type === 'lift' ? '80' : '5.0'}
                              value={logValue} onChange={e => setLogValue(e.target.value)}
                              className={`${fieldCls} text-center font-bold nums`}
                            />
                          </div>
                          {goal.type === 'lift' && (
                            <div className="w-20">
                              <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                                Reps
                              </label>
                              <input
                                type="number" inputMode="numeric" placeholder="3"
                                value={logReps} onChange={e => setLogReps(e.target.value)}
                                className={`${fieldCls} text-center font-bold nums`}
                              />
                            </div>
                          )}
                          <div className="flex-1">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                              Date
                            </label>
                            <input
                              type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                              className={fieldCls}
                            />
                          </div>
                        </div>

                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleLogProgress(goal.id)}
                          disabled={savingLog || !logValue}
                          className="w-full bg-primary text-white rounded-2xl py-2.5 text-sm font-semibold disabled:opacity-35 transition-opacity"
                        >
                          {savingLog ? 'Saving…' : 'Save'}
                        </motion.button>

                        {logs.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Recent</p>
                            {logs.slice(0, 4).map(l => (
                              <div key={l.id} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.05] last:border-0">
                                <span className="text-muted-foreground">
                                  {format(new Date(l.date + 'T12:00:00'), 'MMM d')}
                                </span>
                                <span className="text-white font-semibold nums">
                                  {l.value} {GOAL_UNITS[goal.type]}
                                  {l.reps ? <span className="text-white/40 font-normal"> × {l.reps}</span> : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Add goal trigger */}
        {!loading && goals.length > 0 && !showForm && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-white/[0.12] rounded-2xl py-3.5 text-sm text-muted-foreground hover:text-white hover:border-white/25 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Goal
          </motion.button>
        )}

        {/* New goal form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="glass rounded-2xl p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">New Goal</p>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setShowForm(false)}
                  className="w-7 h-7 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </motion.button>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                  Goal name <span className="text-red-400/70 normal-case">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 100kg Bench Press"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-2">Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {FORM_TYPES.map(({ type, label }) => (
                    <motion.button
                      key={type}
                      whileTap={{ scale: 0.92 }}
                      type="button"
                      onClick={() => { setFormType(type); setFormExercise(''); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors relative`}
                    >
                      {formType === type && (
                        <motion.div
                          layoutId="form-type-active"
                          className="absolute inset-0 rounded-full bg-primary"
                          transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        />
                      )}
                      <span className={`relative z-10 ${formType === type ? 'text-white' : 'text-muted-foreground'}`}>
                        {label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {formType === 'lift' && (
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                    Exercise
                  </label>
                  <ExercisePicker exercises={exercises} value={formExercise} onChange={setFormExercise} />
                </div>
              )}

              <div className={formType === 'lift' ? 'grid grid-cols-2 gap-3' : ''}>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                    Target ({GOAL_UNITS[formType]})
                  </label>
                  <input
                    type="number" inputMode="decimal" step="0.5"
                    placeholder={
                      formType === 'cardio_distance' ? '42.2'
                      : formType === 'cardio_time'   ? '30'
                      : formType === 'weight'        ? '75'
                      : '100'
                    }
                    value={formTarget}
                    onChange={e => setFormTarget(e.target.value)}
                    className={`${fieldCls} nums`}
                  />
                </div>
                {formType === 'lift' && (
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                      Target reps <span className="normal-case text-white/25">(opt.)</span>
                    </label>
                    <input
                      type="number" inputMode="numeric" placeholder="e.g. 3"
                      value={formTargetReps}
                      onChange={e => setFormTargetReps(e.target.value)}
                      className={`${fieldCls} nums`}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1.5">
                  Target date <span className="normal-case text-white/25">(optional)</span>
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className={fieldCls}
                />
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAddGoal}
                disabled={savingGoal}
                className="w-full bg-primary text-white rounded-2xl py-3 text-sm font-semibold disabled:opacity-40 transition-opacity"
              >
                {savingGoal ? 'Saving…' : 'Add Goal'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
