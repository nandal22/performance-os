import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Activity, Exercise } from '@/types';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import { cardioMetricsService } from '@/services/cardioMetrics';
import { toISODate } from '@/lib/utils';

interface SetRow {
  exercise_id: string;
  exercise_name: string;
  reps: string;
  weight: string;
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
  const [type, setType] = useState<Activity['type']>('strength');
  const [date, setDate] = useState(toISODate(new Date()));
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Strength
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<SetRow[]>([{ exercise_id: '', exercise_name: '', reps: '', weight: '' }]);
  const [activeSetIdx, setActiveSetIdx] = useState<number | null>(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);

  // Cardio
  const [distance, setDistance] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [calories, setCalories] = useState('');

  useEffect(() => {
    if (open && type === 'strength' && exercises.length === 0) {
      exercisesService.getAll().then(setExercises).catch(() => {});
    }
  }, [open, type, exercises.length]);

  useEffect(() => {
    const q = exerciseSearch.trim().toLowerCase();
    setFilteredExercises(
      exercises.filter(e => !q || e.name.toLowerCase().includes(q)).slice(0, 8)
    );
  }, [exerciseSearch, exercises]);

  if (!open) return null;

  const addSet = () => {
    const last = sets[sets.length - 1];
    setSets(prev => [...prev, {
      exercise_id: last?.exercise_id ?? '',
      exercise_name: last?.exercise_name ?? '',
      reps: '',
      weight: '',
    }]);
  };

  const removeSet = (idx: number) => {
    if (sets.length === 1) return;
    setSets(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSet = (idx: number, field: keyof SetRow, value: string) => {
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const pickExercise = (idx: number, exercise: Exercise) => {
    setSets(prev => prev.map((s, i) =>
      i === idx ? { ...s, exercise_id: exercise.id, exercise_name: exercise.name } : s
    ));
    setActiveSetIdx(null);
    setExerciseSearch('');
  };

  const resetForm = () => {
    setType('strength');
    setDate(toISODate(new Date()));
    setDuration('');
    setNotes('');
    setSets([{ exercise_id: '', exercise_name: '', reps: '', weight: '' }]);
    setDistance('');
    setAvgHr('');
    setCalories('');
  };

  const handleSave = async () => {
    if (!date) return toast.error('Please set a date');
    setSaving(true);
    try {
      const activity = await activitiesService.create({
        date,
        type,
        duration: duration ? parseInt(duration) : undefined,
        notes: notes || undefined,
        tags: [],
        structured_metrics: {},
      });

      if (type === 'strength') {
        const validSets = sets.filter(s => s.exercise_id && s.reps && s.weight);
        if (validSets.length > 0) {
          await strengthSetsService.createMany(
            validSets.map((s, i) => ({
              activity_id: activity.id,
              exercise_id: s.exercise_id,
              set_number: i + 1,
              reps: parseInt(s.reps),
              weight: parseFloat(s.weight),
            }))
          );
        }
      }

      if (type === 'cardio' && (distance || avgHr || calories)) {
        await cardioMetricsService.create({
          activity_id: activity.id,
          distance: distance ? parseFloat(distance) : undefined,
          avg_heart_rate: avgHr ? parseInt(avgHr) : undefined,
          calories: calories ? parseInt(calories) : undefined,
        });
      }

      toast.success('Workout logged!');
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-h-[92vh] bg-[#111111] rounded-t-3xl flex flex-col overflow-hidden max-w-lg mx-auto">
        {/* Drag handle */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-2 pb-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">Log Workout</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Type */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Type</p>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    type === t.value
                      ? 'bg-primary text-black'
                      : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Duration (min)</label>
              <input
                type="number"
                placeholder="45"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Strength: Sets */}
          {type === 'strength' && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Sets</p>
              <div className="space-y-2">
                {sets.map((set, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                    {/* Exercise picker */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Exercise name..."
                        value={activeSetIdx === idx ? exerciseSearch : set.exercise_name}
                        onFocus={() => {
                          setActiveSetIdx(idx);
                          setExerciseSearch(set.exercise_name);
                        }}
                        onChange={e => {
                          setExerciseSearch(e.target.value);
                          updateSet(idx, 'exercise_name', e.target.value);
                          if (!e.target.value) updateSet(idx, 'exercise_id', '');
                        }}
                        onBlur={() => setTimeout(() => setActiveSetIdx(null), 200)}
                        className="w-full bg-transparent border-b border-white/10 pb-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50"
                      />
                      {activeSetIdx === idx && filteredExercises.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-10 bg-[#1a1a1a] border border-white/10 rounded-xl mt-1 max-h-40 overflow-y-auto shadow-xl">
                          {filteredExercises.map(ex => (
                            <button
                              key={ex.id}
                              onMouseDown={() => pickExercise(idx, ex)}
                              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 first:rounded-t-xl last:rounded-b-xl"
                            >
                              {ex.name}
                              <span className="text-xs text-muted-foreground ml-2">{ex.category}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Reps × Weight */}
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        placeholder="Reps"
                        value={set.reps}
                        onChange={e => updateSet(idx, 'reps', e.target.value)}
                        className="flex-1 bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 text-center"
                      />
                      <span className="text-white/30 text-xs">×</span>
                      <input
                        type="number"
                        placeholder="kg"
                        value={set.weight}
                        onChange={e => updateSet(idx, 'weight', e.target.value)}
                        className="flex-1 bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 text-center"
                      />
                      <button
                        onClick={() => removeSet(idx)}
                        disabled={sets.length === 1}
                        className="p-1.5 text-red-400/50 hover:text-red-400 transition-colors disabled:opacity-20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addSet}
                  className="w-full py-2 rounded-xl border border-dashed border-white/15 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Set
                </button>
              </div>
            </div>
          )}

          {/* Cardio details */}
          {type === 'cardio' && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Cardio Details</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Distance (km)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="5.0"
                    value={distance}
                    onChange={e => setDistance(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Avg HR (bpm)</label>
                  <input
                    type="number"
                    placeholder="145"
                    value={avgHr}
                    onChange={e => setAvgHr(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Calories</label>
                  <input
                    type="number"
                    placeholder="400"
                    value={calories}
                    onChange={e => setCalories(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
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

        {/* Footer */}
        <div className="flex-shrink-0 px-4 pb-8 pt-3 border-t border-white/5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-primary rounded-xl text-black font-semibold text-sm disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving…' : 'Save Workout'}
          </button>
        </div>
      </div>
    </div>
  );
}
