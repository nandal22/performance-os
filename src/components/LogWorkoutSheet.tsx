import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, Trash2, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Activity, Exercise } from '@/types';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import { cardioMetricsService } from '@/services/cardioMetrics';
import { toISODate } from '@/lib/utils';

type LastSession = { date: string; sets: { reps: number; weight: number; set_number: number }[] } | null;

interface LoggedSet {
  uid: string;
  exercise_id: string;
  exercise_name: string;
  reps: number;
  weight: number;
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
  const [type, setType] = useState<Activity['type']>('strength');
  const [date, setDate] = useState(toISODate(new Date()));
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Exercise picker
  const [exercises,   setExercises]   = useState<Exercise[]>([]);
  const [exSearch,    setExSearch]    = useState('');
  const [showPicker,  setShowPicker]  = useState(false);
  const [currentEx,   setCurrentEx]   = useState<{ id: string; name: string } | null>(null);
  const [lastSession, setLastSession] = useState<LastSession>(null);

  // Quick-add form
  const [currentReps, setCurrentReps] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  // Accumulated sets for this session
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);

  // Cardio
  const [distance, setDistance] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [calories, setCalories] = useState('');

  const repsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && exercises.length === 0) {
      exercisesService.getAll().then(setExercises).catch(() => {});
    }
  }, [open, exercises.length]);

  // Fetch last session data whenever the exercise changes
  useEffect(() => {
    if (!currentEx) { setLastSession(null); return; }
    strengthSetsService.getLastSession(currentEx.id)
      .then(setLastSession)
      .catch(() => setLastSession(null));
  }, [currentEx?.id]);

  if (!open) return null;

  const filteredExercises = exercises
    .filter(e => !exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase()))
    .slice(0, 10);

  // Add the current set to the log and keep exercise selected
  const logSet = () => {
    if (!currentEx) return toast.error('Pick an exercise first');
    if (!currentReps || parseInt(currentReps) <= 0) return toast.error('Enter reps');

    setLoggedSets(prev => [...prev, {
      uid:           `${Date.now()}-${Math.random()}`,
      exercise_id:   currentEx.id,
      exercise_name: currentEx.name,
      reps:          parseInt(currentReps),
      weight:        parseFloat(currentWeight) || 0,
    }]);

    // Clear reps + weight, keep the same exercise for the next set
    setCurrentReps('');
    setCurrentWeight('');

    // Flash button green
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 900);

    // Jump focus back to reps for fast next-set entry
    setTimeout(() => repsRef.current?.focus(), 50);
  };

  const removeSet = (uid: string) => {
    setLoggedSets(prev => prev.filter(s => s.uid !== uid));
  };

  // Group sets by exercise (preserving insertion order)
  const grouped = loggedSets.reduce<Record<string, { name: string; sets: LoggedSet[] }>>(
    (acc, s) => {
      if (!acc[s.exercise_id]) acc[s.exercise_id] = { name: s.exercise_name, sets: [] };
      acc[s.exercise_id].sets.push(s);
      return acc;
    },
    {}
  );

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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Session meta: type + date */}
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

          {/* ── STRENGTH: quick-add + accumulated log ── */}
          {type === 'strength' && (
            <div className="px-4 pt-4 pb-3 space-y-4">

              {/* Quick-add card */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Log a set</p>

                {/* Exercise selector */}
                <div className="relative">
                  <button
                    onClick={() => { setShowPicker(p => !p); setExSearch(''); }}
                    className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <span className={currentEx ? 'text-white font-medium' : 'text-white/30'}>
                      {currentEx?.name ?? 'Choose exercise…'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />
                  </button>

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
                            className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 flex items-center justify-between"
                          >
                            <span>{ex.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{ex.category}</span>
                          </button>
                        ))}
                        {filteredExercises.length === 0 && (
                          <p className="px-3 py-3 text-sm text-muted-foreground">No exercises found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Last session hint for progressive overload */}
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

                {/* Log Set button — large, easy to tap mid-workout */}
                <button
                  onClick={logSet}
                  className={`w-full h-13 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                    justAdded
                      ? 'bg-green-500 text-white scale-[0.97]'
                      : 'bg-primary text-primary-foreground active:scale-[0.97]'
                  }`}
                >
                  {justAdded
                    ? <><CheckCircle2 className="w-4 h-4" /> Set Logged!</>
                    : '+ Log Set'}
                </button>
              </div>

              {/* Accumulated sets grouped by exercise */}
              {Object.keys(grouped).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">
                    This session · {loggedSets.length} set{loggedSets.length !== 1 ? 's' : ''}
                  </p>
                  {Object.values(grouped).map(group => (
                    <div key={group.name} className="rounded-xl border border-white/8 overflow-hidden">
                      <p className="px-3 py-2 text-xs font-semibold text-white/60 bg-white/5 border-b border-white/8">
                        {group.name}
                      </p>
                      {group.sets.map((s, i) => (
                        <div
                          key={s.uid}
                          className="flex items-center px-3 py-2.5 gap-3 border-b border-white/5 last:border-0"
                        >
                          <span className="text-xs text-muted-foreground w-5 flex-shrink-0">S{i + 1}</span>
                          <span className="text-sm text-white flex-1">
                            <span className="font-semibold">{s.reps}</span> reps
                            {s.weight > 0 && (
                              <> × <span className="font-semibold">{s.weight} kg</span></>
                            )}
                          </span>
                          <button
                            onClick={() => removeSet(s.uid)}
                            className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CARDIO: fill at end ── */}
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

          {/* ── Duration + Notes (always shown, fill at end) ── */}
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

        {/* Footer — Finish Workout */}
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
  );
}
