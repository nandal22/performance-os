import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, Trash2, ChevronDown, Plus, Pencil, Star, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Activity, Exercise } from '@/types';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import { cardioMetricsService } from '@/services/cardioMetrics';
import { toISODate } from '@/lib/utils';
import ExerciseProgressSheet from './ExerciseProgressSheet';

const DRAFT_KEY = 'perf-os-draft';

type LastSession = { date: string; sets: { reps: number; weight: number; set_number: number }[] } | null;

interface LoggedSet {
  uid: string;
  exercise_id: string;
  exercise_name: string;
  reps: number;
  weight: number;
}

interface WorkoutDraft {
  type: Activity['type'];
  date: string;
  loggedSets: LoggedSet[];
  savedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPES = [
  { value: 'strength', label: 'Strength', icon: '💪' },
  { value: 'cardio',   label: 'Cardio',   icon: '🏃' },
  { value: 'sport',    label: 'Sport',    icon: '⚽' },
  { value: 'mobility', label: 'Mobility', icon: '🧘' },
  { value: 'custom',   label: 'Other',    icon: '⚡' },
] as const;

export default function LogWorkoutSheet({ open, onClose, onSuccess }: Props) {
  // Session metadata
  const [type,     setType]     = useState<Activity['type']>('strength');
  const [date,     setDate]     = useState(toISODate(new Date()));
  const [duration, setDuration] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  // Exercise picker
  const [exercises,  setExercises]  = useState<Exercise[]>([]);
  const [exSearch,   setExSearch]   = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [currentEx,  setCurrentEx]  = useState<{ id: string; name: string } | null>(null);
  const [lastSession, setLastSession] = useState<LastSession>(null);
  const [creatingEx, setCreatingEx] = useState(false);

  // Tracking
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() =>
    new Set(exercisesService.getTrackedIds())
  );
  const [showProgress, setShowProgress] = useState(false);

  // Quick-add form
  const [currentReps,   setCurrentReps]   = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [justAdded,     setJustAdded]     = useState(false);

  // Accumulated sets
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);

  // Set editing
  const [editUid,    setEditUid]    = useState<string | null>(null);
  const [editReps,   setEditReps]   = useState('');
  const [editWeight, setEditWeight] = useState('');

  // Draft restore banner
  const [draftToRestore, setDraftToRestore] = useState<WorkoutDraft | null>(null);

  // Cardio
  const [distance, setDistance] = useState('');
  const [avgHr,    setAvgHr]    = useState('');
  const [calories, setCalories] = useState('');

  const repsRef = useRef<HTMLInputElement>(null);

  // Load exercises once
  useEffect(() => {
    if (open && exercises.length === 0) {
      exercisesService.getAll().then(setExercises).catch(() => {});
    }
  }, [open, exercises.length]);

  // Check for a saved draft when the sheet opens
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft: WorkoutDraft = JSON.parse(raw);
      if (Date.now() - draft.savedAt < 86400000 && draft.loggedSets.length > 0) {
        setDraftToRestore(draft);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [open]);

  // Fetch last session whenever exercise changes
  useEffect(() => {
    if (!currentEx) { setLastSession(null); return; }
    strengthSetsService.getLastSession(currentEx.id)
      .then(setLastSession)
      .catch(() => setLastSession(null));
  }, [currentEx?.id]);

  if (!open) return null;

  const filteredExercises = exercises
    .filter(e => !exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase()))
    .sort((a, b) => {
      // Tracked exercises float to top
      const aT = trackedIds.has(a.id) ? 0 : 1;
      const bT = trackedIds.has(b.id) ? 0 : 1;
      return aT - bT || a.name.localeCompare(b.name);
    })
    .slice(0, 12);

  const canCreateEx = exSearch.trim().length > 1 && filteredExercises.length === 0;

  const saveDraft = (sets: LoggedSet[], t: Activity['type'], d: string) => {
    if (sets.length === 0) { localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ type: t, date: d, loggedSets: sets, savedAt: Date.now() }));
  };

  const restoreDraft = () => {
    if (!draftToRestore) return;
    setType(draftToRestore.type);
    setDate(draftToRestore.date);
    setLoggedSets(draftToRestore.loggedSets);
    setDraftToRestore(null);
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftToRestore(null);
  };

  const logSet = () => {
    if (!currentEx) return toast.error('Pick an exercise first');
    if (!currentReps || parseInt(currentReps) <= 0) return toast.error('Enter reps');

    const newSet: LoggedSet = {
      uid:           `${Date.now()}-${Math.random()}`,
      exercise_id:   currentEx.id,
      exercise_name: currentEx.name,
      reps:          parseInt(currentReps),
      weight:        parseFloat(currentWeight) || 0,
    };

    setLoggedSets(prev => {
      const next = [...prev, newSet];
      saveDraft(next, type, date);
      return next;
    });

    setCurrentReps('');
    setCurrentWeight('');
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 900);
    setTimeout(() => repsRef.current?.focus(), 50);
  };

  const removeSet = (uid: string) => {
    setLoggedSets(prev => {
      const next = prev.filter(s => s.uid !== uid);
      saveDraft(next, type, date);
      return next;
    });
  };

  const startEdit = (s: LoggedSet) => {
    setEditUid(s.uid);
    setEditReps(String(s.reps));
    setEditWeight(s.weight > 0 ? String(s.weight) : '');
  };

  const saveEdit = () => {
    if (!editUid) return;
    setLoggedSets(prev => {
      const next = prev.map(s =>
        s.uid === editUid
          ? { ...s, reps: parseInt(editReps) || s.reps, weight: parseFloat(editWeight) || 0 }
          : s
      );
      saveDraft(next, type, date);
      return next;
    });
    setEditUid(null);
  };

  const createExercise = async () => {
    if (!exSearch.trim()) return;
    setCreatingEx(true);
    try {
      const ex = await exercisesService.createCustom({
        name:              exSearch.trim(),
        category:          'other',
        primary_muscle:    'General',
        secondary_muscles: [],
      });
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      setCurrentEx({ id: ex.id, name: ex.name });
      setShowPicker(false);
      setExSearch('');
      toast.success(`Exercise "${ex.name}" created`);
      setTimeout(() => repsRef.current?.focus(), 50);
    } catch {
      toast.error('Failed to create exercise');
    } finally {
      setCreatingEx(false);
    }
  };

  const toggleTrack = (id: string) => {
    const newTracked = exercisesService.toggleTracked(id);
    setTrackedIds(prev => {
      const next = new Set(prev);
      newTracked ? next.add(id) : next.delete(id);
      return next;
    });
    toast.success(newTracked ? 'Exercise tracked ⭐' : 'Removed from tracked');
  };

  // Group sets by exercise (preserving insertion order)
  const exerciseOrder: string[] = [];
  const grouped: Record<string, { name: string; sets: LoggedSet[] }> = {};
  for (const s of loggedSets) {
    if (!grouped[s.exercise_id]) {
      grouped[s.exercise_id] = { name: s.exercise_name, sets: [] };
      exerciseOrder.push(s.exercise_id);
    }
    grouped[s.exercise_id].sets.push(s);
  }

  const resetForm = () => {
    setType('strength');
    setDate(toISODate(new Date()));
    setDuration('');
    setNotes('');
    setLoggedSets([]);
    setCurrentEx(null);
    setLastSession(null);
    setCurrentReps('');
    setCurrentWeight('');
    setExSearch('');
    setDistance('');
    setAvgHr('');
    setCalories('');
    setEditUid(null);
    setDraftToRestore(null);
    localStorage.removeItem(DRAFT_KEY);
  };

  const handleFinish = async () => {
    if (!date) return toast.error('Please set a date');
    if (type === 'strength' && loggedSets.length === 0) return toast.error('Log at least one set');

    setSaving(true);
    try {
      const activity = await activitiesService.create({
        date,
        type,
        duration:           duration ? parseInt(duration) : undefined,
        notes:              notes || undefined,
        tags:               [],
        structured_metrics: {},
      });

      if (type === 'strength' && loggedSets.length > 0) {
        await strengthSetsService.createMany(
          loggedSets.map((s, i) => ({
            activity_id: activity.id,
            exercise_id: s.exercise_id,
            set_number:  i + 1,
            reps:        s.reps,
            weight:      s.weight || undefined,
          }))
        );
      }

      if (type === 'cardio' && (distance || avgHr || calories)) {
        await cardioMetricsService.create({
          activity_id:    activity.id,
          distance:       distance  ? parseFloat(distance)  : undefined,
          avg_heart_rate: avgHr     ? parseInt(avgHr)       : undefined,
          calories:       calories  ? parseInt(calories)    : undefined,
        });
      }

      const setLabel = loggedSets.length > 0 ? ` · ${loggedSets.length} sets` : '';
      toast.success(`Workout saved${setLabel}`);
      resetForm();
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <div className="relative w-full max-h-[92vh] bg-[#111111] rounded-t-3xl flex flex-col overflow-hidden max-w-lg mx-auto">
          {/* Handle */}
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-2 pb-3 border-b border-white/5">
            <div>
              <h2 className="text-base font-semibold text-white">Active Workout</h2>
              {loggedSets.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {loggedSets.length} set{loggedSets.length !== 1 ? 's' : ''} logged
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Draft restore banner */}
          {draftToRestore && (
            <div className="mx-4 mt-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-yellow-400">Unfinished workout found</p>
                <p className="text-xs text-muted-foreground">
                  {draftToRestore.loggedSets.length} sets · {format(new Date(draftToRestore.savedAt), 'h:mm a')}
                </p>
              </div>
              <button onClick={restoreDraft} className="text-xs text-yellow-400 font-semibold px-2 py-1 rounded-lg bg-yellow-500/10">
                Restore
              </button>
              <button onClick={discardDraft} className="text-xs text-muted-foreground">
                Discard
              </button>
            </div>
          )}

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">

            {/* Session meta */}
            <div className="px-4 pt-4 pb-3 space-y-3 border-b border-white/5">
              <div className="flex gap-1.5 flex-wrap">
                {TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      type === t.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* ── STRENGTH ── */}
            {type === 'strength' && (
              <div className="px-4 pt-4 pb-3 space-y-4">

                {/* Quick-add card */}
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Log a set</p>

                  {/* Exercise selector */}
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowPicker(p => !p); setExSearch(''); }}
                        className="flex-1 flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
                      >
                        <span className={currentEx ? 'text-white font-medium' : 'text-white/30'}>
                          {currentEx?.name ?? 'Choose exercise…'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />
                      </button>
                      {currentEx && (
                        <>
                          <button
                            onClick={() => toggleTrack(currentEx.id)}
                            className={`p-2 rounded-xl border transition-colors ${
                              trackedIds.has(currentEx.id)
                                ? 'border-yellow-500/30 text-yellow-400'
                                : 'border-white/10 text-white/20 hover:text-white/50'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${trackedIds.has(currentEx.id) ? 'fill-yellow-400' : ''}`} />
                          </button>
                          {trackedIds.has(currentEx.id) && (
                            <button
                              onClick={() => setShowProgress(true)}
                              className="p-2 rounded-xl border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                            >
                              <TrendingUp className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {showPicker && (
                      <div className="absolute top-full left-0 right-0 z-20 bg-[#1c1c1c] border border-white/10 rounded-xl mt-1 shadow-2xl overflow-hidden">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search exercises…"
                          value={exSearch}
                          onChange={e => setExSearch(e.target.value)}
                          className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/30 border-b border-white/10 focus:outline-none"
                        />
                        <div className="max-h-48 overflow-y-auto">
                          {filteredExercises.map(ex => (
                            <button
                              key={ex.id}
                              onMouseDown={() => {
                                setCurrentEx({ id: ex.id, name: ex.name });
                                setShowPicker(false);
                                setTimeout(() => repsRef.current?.focus(), 50);
                              }}
                              className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 flex items-center gap-2"
                            >
                              <span className="flex-1">{ex.name}</span>
                              {trackedIds.has(ex.id) && (
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                              )}
                              <span className="text-xs text-muted-foreground flex-shrink-0">{ex.category}</span>
                            </button>
                          ))}
                          {canCreateEx && (
                            <button
                              onMouseDown={createExercise}
                              disabled={creatingEx}
                              className="w-full text-left px-3 py-2.5 text-sm text-primary hover:bg-white/5 flex items-center gap-2 disabled:opacity-50"
                            >
                              <Plus className="w-4 h-4 flex-shrink-0" />
                              {creatingEx ? 'Creating…' : `Create "${exSearch.trim()}"`}
                            </button>
                          )}
                          {filteredExercises.length === 0 && !canCreateEx && (
                            <p className="px-3 py-3 text-sm text-muted-foreground">No exercises found</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Last session hint */}
                  {lastSession && (
                    <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground mb-1">
                        Last time · {format(new Date(lastSession.date + 'T12:00:00'), 'MMM d')}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {lastSession.sets.map((s, i) => (
                          <span key={i} className="text-xs text-white/70">
                            S{i + 1}: {s.reps}×{s.weight > 0 ? `${s.weight}kg` : 'BW'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reps × Weight */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground block mb-1">Reps</label>
                      <input
                        ref={repsRef}
                        type="number"
                        inputMode="numeric"
                        placeholder="10"
                        value={currentReps}
                        onChange={e => setCurrentReps(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && logSet()}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-lg font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-center"
                      />
                    </div>
                    <p className="text-white/30 pb-3">×</p>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground block mb-1">Weight (kg)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0"
                        value={currentWeight}
                        onChange={e => setCurrentWeight(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && logSet()}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-lg font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-center"
                      />
                    </div>
                  </div>

                  <button
                    onClick={logSet}
                    className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                      justAdded
                        ? 'bg-green-500 text-white scale-[0.97]'
                        : 'bg-primary text-primary-foreground active:scale-[0.97]'
                    }`}
                  >
                    {justAdded ? <><CheckCircle2 className="w-4 h-4" /> Set Logged!</> : '+ Log Set'}
                  </button>
                </div>

                {/* Accumulated sets */}
                {exerciseOrder.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">
                      This session · {loggedSets.length} set{loggedSets.length !== 1 ? 's' : ''}
                    </p>
                    {exerciseOrder.map(exId => (
                      <div key={exId} className="rounded-xl border border-white/8 overflow-hidden">
                        <p className="px-3 py-2 text-xs font-semibold text-white/60 bg-white/5 border-b border-white/8">
                          {grouped[exId].name}
                        </p>
                        {grouped[exId].sets.map((s, i) => (
                          <div
                            key={s.uid}
                            className="border-b border-white/5 last:border-0"
                          >
                            {editUid === s.uid ? (
                              // Inline edit row
                              <div className="flex items-center gap-2 px-3 py-2">
                                <span className="text-xs text-muted-foreground w-5 flex-shrink-0">S{i + 1}</span>
                                <input
                                  autoFocus
                                  type="number"
                                  inputMode="numeric"
                                  value={editReps}
                                  onChange={e => setEditReps(e.target.value)}
                                  className="w-14 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none"
                                  placeholder="reps"
                                />
                                <span className="text-white/30 text-xs">×</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={editWeight}
                                  onChange={e => setEditWeight(e.target.value)}
                                  className="w-16 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none"
                                  placeholder="kg"
                                />
                                <button onClick={saveEdit} className="text-green-400 p-1 ml-auto">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditUid(null)} className="text-white/30 p-1">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              // Normal row
                              <div className="flex items-center px-3 py-2.5 gap-3">
                                <span className="text-xs text-muted-foreground w-5 flex-shrink-0">S{i + 1}</span>
                                <span className="text-sm text-white flex-1">
                                  <span className="font-semibold">{s.reps}</span> reps
                                  {s.weight > 0 && (
                                    <> × <span className="font-semibold">{s.weight} kg</span></>
                                  )}
                                </span>
                                <button
                                  onClick={() => startEdit(s)}
                                  className="p-1.5 text-white/20 hover:text-white/60 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => removeSet(s.uid)}
                                  className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── CARDIO ── */}
            {type === 'cardio' && (
              <div className="px-4 pt-4 pb-3 space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Cardio Details</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { label: 'Distance (km)', placeholder: '5.0',  value: distance,  step: '0.01', set: setDistance },
                    { label: 'Avg HR (bpm)',  placeholder: '145',  value: avgHr,     step: '1',    set: setAvgHr    },
                    { label: 'Calories',      placeholder: '400',  value: calories,  step: '1',    set: setCalories },
                  ] as const).map(f => (
                    <div key={f.label}>
                      <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
                      <input
                        type="number"
                        step={f.step}
                        placeholder={f.placeholder}
                        value={f.value}
                        onChange={e => f.set(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duration + Notes */}
            <div className="px-4 pt-3 pb-5 mt-1 border-t border-white/5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Duration (min)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Fill when done — e.g. 60"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
                <textarea
                  placeholder="How did it feel?"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 pb-8 pt-3 border-t border-white/5">
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full h-12 bg-primary rounded-xl text-primary-foreground font-semibold text-sm disabled:opacity-50 transition-opacity"
            >
              {saving
                ? 'Saving…'
                : `Finish Workout${loggedSets.length > 0 ? ` · ${loggedSets.length} sets` : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Exercise progress sheet (z-[60] so it layers above the workout sheet) */}
      <ExerciseProgressSheet
        exercise={showProgress ? currentEx : null}
        onClose={() => setShowProgress(false)}
        onTrackToggle={(id, tracked) => {
          setTrackedIds(prev => {
            const next = new Set(prev);
            tracked ? next.add(id) : next.delete(id);
            return next;
          });
        }}
      />
    </>
  );
}
