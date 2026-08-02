import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, Trash2, ChevronDown, Plus, Pencil, Star, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Activity, CardioCalorieSource, Exercise, ExerciseCategory, WorkoutCategory, WorkoutSubType } from '@/types';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import { cardioMetricsService } from '@/services/cardioMetrics';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { toISODate } from '@/lib/utils';
import { calcCardioCalories, calcStrengthCalories } from '@/engines/calorieEngine';
import ExerciseProgressSheet from './ExerciseProgressSheet';
import ExerciseProgressCard from './ExerciseProgressCard';

const DRAFT_KEY = 'perf-os-draft';

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const PANEL = '#eae9e9';
const ACCENT = '#ec3013';
const ACCENT_TINT = '#ffe0d9';
const ACCENT_DEEP = '#ae1800';
const MUTED = 'rgba(32,30,29,0.55)';
const RULE = 'rgba(32,30,29,0.15)';

const inputStyle = { border: `2px solid ${INK}`, background: GROUND, color: INK, colorScheme: 'light' as const };

type RecentSession = { date: string; sets: { reps: number; weight: number; set_number: number }[] };
type LoadMode = 'total' | 'dumbbell_pair' | 'barbell_plates' | 'bodyweight';

const LOAD_MODE_OPTIONS: Array<{ value: LoadMode; label: string; detail: string }> = [
  { value: 'total', label: 'Total kg', detail: 'Full loaded weight' },
  { value: 'dumbbell_pair', label: 'Dumbbells', detail: 'Enter one DB' },
  { value: 'barbell_plates', label: 'Barbell', detail: 'Per side + bar' },
  { value: 'bodyweight', label: 'Bodyweight', detail: 'BW plus added' },
];

const LOAD_MODE_HELP: Record<LoadMode, string> = {
  total: 'Enter the full weight once.',
  dumbbell_pair: 'Enter one dumbbell weight. The set is saved as both dumbbells together.',
  barbell_plates: 'Enter plates on one side, then the rod or bar weight below.',
  bodyweight: 'Enter added weight only. Bodyweight percent controls the estimate.',
};

const DEFAULT_MODE_BY_EQUIPMENT: Record<string, LoadMode> = {
  dumbbell: 'dumbbell_pair',
  barbell: 'barbell_plates',
  bodyweight: 'bodyweight',
};

const SUB_TYPES: Array<{ value: WorkoutSubType; label: string }> = [
  { value: 'burn', label: 'Burn' },
  { value: 'strength', label: 'Strength' },
  { value: 'hrx', label: 'HRX' },
];

/** Cult sub-types other than "strength" are logged like a cardio/class session. */
function isStrengthCategory(type: WorkoutCategory, subType: WorkoutSubType) {
  return type === 'gym' || (type === 'cult_session' && subType === 'strength');
}

function cardioMethodFor(type: WorkoutCategory, subType: WorkoutSubType): 'running' | 'swimming' | 'cult_burn' | 'cult_hrx' {
  if (type === 'swimming') return 'swimming';
  if (type === 'cult_session') return subType === 'hrx' ? 'cult_hrx' : 'cult_burn';
  return 'running';
}

interface LoggedSet {
  uid: string;
  exercise_id: string;
  exercise_name: string;
  reps: number;
  weight: number;
  load_mode?: LoadMode;
  input_weight?: number;
  bar_weight?: number;
  bodyweight_factor?: number;
  bodyweight_kg?: number | null;
  load_label?: string;
}

interface WorkoutDraft {
  type: Activity['type'];
  subType?: WorkoutSubType;
  date: string;
  loggedSets: LoggedSet[];
  savedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  autoResume?: boolean; // if true, auto-restore draft without asking
}

const TYPES = [
  { value: 'gym',          label: 'Gym',          icon: '💪' },
  { value: 'cult_session', label: 'Cult Session', icon: '🔥' },
  { value: 'swimming',     label: 'Swimming',     icon: '🏊' },
  { value: 'run',          label: 'Run',          icon: '🏃' },
] as const;

export default function LogWorkoutSheet({ open, onClose, onSuccess, autoResume = false }: Props) {
  // Session metadata
  const [type,     setType]     = useState<WorkoutCategory>('gym');
  const [subType,  setSubType]  = useState<WorkoutSubType>('burn');
  const [date,     setDate]     = useState(toISODate(new Date()));
  const [duration, setDuration] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  // Exercise picker
  const [exercises,  setExercises]  = useState<Exercise[]>([]);
  const [exSearch,   setExSearch]   = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [currentEx,  setCurrentEx]  = useState<{ id: string; name: string } | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [creatingEx, setCreatingEx] = useState(false);

  // Tracking
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() =>
    new Set(exercisesService.getTrackedIds())
  );
  const [showProgress, setShowProgress] = useState(false);

  // Quick-add form
  const [currentReps,   setCurrentReps]   = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [loadMode,      setLoadMode]      = useState<LoadMode>('total');
  const [barWeight,     setBarWeight]     = useState('20');
  const [bodyFactor,    setBodyFactor]    = useState('100');
  const [bodyWeightKg,  setBodyWeightKg]  = useState<number | null>(null);
  const [justAdded,     setJustAdded]     = useState(false);

  // Accumulated sets
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);

  // Set editing
  const [editUid,    setEditUid]    = useState<string | null>(null);
  const [editReps,   setEditReps]   = useState('');
  const [editWeight, setEditWeight] = useState('');

  // Draft restore banner
  const [draftToRestore, setDraftToRestore] = useState<WorkoutDraft | null>(null);

  // New exercise category (when creating inline)
  const [newExCategory, setNewExCategory] = useState<ExerciseCategory>('other');

  // Cardio / class session
  const [distance, setDistance] = useState('');
  const [avgHr,    setAvgHr]    = useState('');
  const [calories, setCalories] = useState('');

  const repsRef = useRef<HTMLInputElement>(null);
  const currentExerciseId = currentEx?.id;
  const selectedExercise = currentExerciseId
    ? exercises.find(exercise => exercise.id === currentExerciseId)
    : null;
  const selectedEquipment = selectedExercise?.equipment ?? null;
  const isStrengthUI = isStrengthCategory(type, subType);
  const cardioMethod = cardioMethodFor(type, subType);

  // Load exercises once
  useEffect(() => {
    if (open && exercises.length === 0) {
      exercisesService.getAll().then(setExercises).catch(() => {});
    }
  }, [open, exercises.length]);

  useEffect(() => {
    if (!open) return;
    bodyMetricsService.getLatestProfile()
      .then(profile => setBodyWeightKg(profile.weight))
      .catch(() => setBodyWeightKg(null));
  }, [open]);

  // Check for a saved draft when the sheet opens
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft: WorkoutDraft = JSON.parse(raw);
      if (Date.now() - draft.savedAt < 86400000 && draft.loggedSets.length > 0) {
        if (autoResume) {
          // Auto-restore immediately (opened via "Continue Workout" button)
          setType(draft.type);
          setSubType(draft.subType ?? 'burn');
          setDate(draft.date);
          setLoggedSets(draft.loggedSets);
        } else {
          setDraftToRestore(draft);
        }
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [autoResume, open]);

  // Fetch recent sessions (last time + best of last 3) whenever exercise changes
  useEffect(() => {
    if (!currentExerciseId) { setRecentSessions([]); return; }
    strengthSetsService.getRecentSessions(currentExerciseId, 3)
      .then(setRecentSessions)
      .catch(() => setRecentSessions([]));
  }, [currentExerciseId]);

  useEffect(() => {
    if (!currentExerciseId || !selectedEquipment) return;
    const nextMode = DEFAULT_MODE_BY_EQUIPMENT[selectedEquipment] ?? 'total';
    setLoadMode(current => (current === nextMode ? current : nextMode));
  }, [currentExerciseId, selectedEquipment]);

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
  const currentWeightValue = Math.max(0, parseFloat(currentWeight) || 0);
  const barWeightValue = Math.max(0, parseFloat(barWeight) || 0);
  const bodyFactorValue = Math.max(0, parseFloat(bodyFactor) || 0);
  const activeLoadMode = LOAD_MODE_OPTIONS.find(option => option.value === loadMode) ?? LOAD_MODE_OPTIONS[0];
  const weightInputLabel =
    loadMode === 'dumbbell_pair'
      ? 'One DB kg'
      : loadMode === 'barbell_plates'
        ? 'Plates / side'
        : loadMode === 'bodyweight'
          ? 'Added kg'
          : 'Total kg';

  const buildLoad = () => {
    if (loadMode === 'dumbbell_pair') {
      const effective = currentWeightValue * 2;
      return {
        weight: effective,
        input_weight: currentWeightValue,
        load_label: currentWeightValue > 0 ? `${currentWeightValue} kg x 2 DB` : 'Dumbbells',
      };
    }
    if (loadMode === 'barbell_plates') {
      const effective = currentWeightValue * 2 + barWeightValue;
      return {
        weight: effective,
        input_weight: currentWeightValue,
        bar_weight: barWeightValue,
        load_label: `${currentWeightValue} kg/side + ${barWeightValue} kg rod`,
      };
    }
    if (loadMode === 'bodyweight') {
      const factor = bodyFactorValue / 100;
      const bodyweightLoad = bodyWeightKg ? Math.round(bodyWeightKg * factor * 10) / 10 : 0;
      const effective = Math.round((bodyweightLoad + currentWeightValue) * 10) / 10;
      const bodyweightLabel = bodyWeightKg
        ? `${bodyFactorValue}% bodyweight (${bodyweightLoad} kg)`
        : `${bodyFactorValue}% bodyweight`;
      return {
        weight: effective,
        input_weight: currentWeightValue,
        bodyweight_factor: factor,
        bodyweight_kg: bodyWeightKg,
        load_label: currentWeightValue > 0
          ? `${bodyweightLabel} + ${currentWeightValue} kg`
          : bodyweightLabel,
      };
    }
    return {
      weight: currentWeightValue,
      input_weight: currentWeightValue,
      load_label: currentWeightValue > 0 ? `${currentWeightValue} kg total` : 'Bodyweight / unloaded',
    };
  };
  const loadPreview = buildLoad();

  const saveDraft = (sets: LoggedSet[], t: Activity['type'], d: string) => {
    if (sets.length === 0) { localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ type: t, subType, date: d, loggedSets: sets, savedAt: Date.now() }));
  };

  const restoreDraft = () => {
    if (!draftToRestore) return;
    setType(draftToRestore.type);
    setSubType(draftToRestore.subType ?? 'burn');
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
    const load = buildLoad();
    if (loadMode === 'bodyweight' && !bodyWeightKg) {
      toast.message('Bodyweight set saved without bodyweight load estimate');
    }

    const newSet: LoggedSet = {
      uid:           `${Date.now()}-${Math.random()}`,
      exercise_id:   currentEx.id,
      exercise_name: currentEx.name,
      reps:          parseInt(currentReps),
      weight:        load.weight,
      load_mode:     loadMode,
      input_weight:  load.input_weight,
      bar_weight:    load.bar_weight,
      bodyweight_factor: load.bodyweight_factor,
      bodyweight_kg: load.bodyweight_kg,
      load_label:    load.load_label,
    };

    setLoggedSets(prev => {
      const next = [...prev, newSet];
      saveDraft(next, type, date);
      return next;
    });

    setCurrentReps('');
    if (loadMode !== 'barbell_plates') setCurrentWeight('');
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
        category:          newExCategory,
        primary_muscle:    'General',
        secondary_muscles: [],
      });
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      setCurrentEx({ id: ex.id, name: ex.name });
      setShowPicker(false);
      setExSearch('');
      setNewExCategory('other');
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
      if (newTracked) {
        next.add(id);
      } else {
        next.delete(id);
      }
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
  const durationMins = duration ? parseInt(duration, 10) : 0;
  const strengthCalories = isStrengthUI && bodyWeightKg
    ? calcStrengthCalories({
        sets: loggedSets.map(set => ({
          reps: set.reps,
          weight: set.weight,
          loadMode: set.load_mode,
          bodyweightFactor: set.bodyweight_factor,
          bodyweightKg: set.bodyweight_kg,
        })),
        duration: durationMins > 0 ? durationMins : undefined,
      }, bodyWeightKg)
    : null;
  const strengthEstimateCopy = !bodyWeightKg
    ? 'Source: profile body weight required for app estimate.'
    : durationMins > 0
      ? 'Source: app estimate using body weight, duration, reps, and effective load.'
      : 'Source: app estimate using body weight, set volume, and estimated active/rest time.';
  const distanceKm = distance ? parseFloat(distance) : undefined;
  const avgHeartRate = avgHr ? parseInt(avgHr, 10) : undefined;
  const machineCalories = calories ? parseInt(calories, 10) : undefined;
  const cardioEstimate = !isStrengthUI && durationMins > 0 && bodyWeightKg
    ? calcCardioCalories({
        duration: durationMins,
        distance: distanceKm,
        cardioMethod,
        notes,
      }, bodyWeightKg)
    : null;
  const cardioCalories = machineCalories ?? cardioEstimate?.calories;
  const cardioCalorieSource: CardioCalorieSource = machineCalories != null
    ? 'machine'
    : cardioEstimate
      ? 'estimated'
      : 'unavailable';

  const resetForm = () => {
    setType('gym');
    setSubType('burn');
    setDate(toISODate(new Date()));
    setDuration('');
    setNotes('');
    setLoggedSets([]);
    setCurrentEx(null);
    setRecentSessions([]);
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
    if (isStrengthUI && loggedSets.length === 0) return toast.error('Log at least one set');
    if (!isStrengthUI && durationMins <= 0) return toast.error('Enter duration');

    setSaving(true);
    try {
      const activity = await activitiesService.create({
        date,
        type,
        sub_type:           type === 'cult_session' ? subType : undefined,
        duration:           duration ? parseInt(duration) : undefined,
        notes:              notes || undefined,
        tags:               [],
        structured_metrics: isStrengthUI ? {
          calorieEstimate: strengthCalories ? {
            calories: strengthCalories.calories,
            met: strengthCalories.met,
            method: strengthCalories.method,
            durationHours: strengthCalories.duration_hrs,
            activeDurationHours: strengthCalories.active_duration_hrs ?? null,
            totalVolumeKg: strengthCalories.total_volume_kg ?? 0,
            totalReps: strengthCalories.total_reps ?? 0,
            bodyWeightKg,
          } : null,
          strengthLoad: {
            bodyWeightKg,
            sets: loggedSets.map((s, index) => ({
              set: index + 1,
              exerciseId: s.exercise_id,
              exerciseName: s.exercise_name,
              reps: s.reps,
              effectiveWeight: s.weight,
              mode: s.load_mode ?? 'total',
              inputWeight: s.input_weight ?? s.weight,
              barWeight: s.bar_weight,
              bodyweightFactor: s.bodyweight_factor,
              bodyweightKg: s.bodyweight_kg,
              label: s.load_label,
            })),
          },
        } : {
          cardio: {
            method: cardioMethod,
            distanceKm: distanceKm ?? null,
            avgHeartRate: avgHeartRate ?? null,
            bodyWeightKg,
          },
          calorieEstimate: cardioCalories != null ? {
            calories: cardioCalories,
            source: cardioCalorieSource,
            machineCalories: machineCalories ?? null,
            estimatedCalories: cardioEstimate?.calories ?? null,
            met: cardioEstimate?.met ?? null,
            method: cardioEstimate?.method ?? null,
            durationHours: cardioEstimate?.duration_hrs ?? durationMins / 60,
            bodyWeightKg,
          } : null,
        },
      });

      if (isStrengthUI && loggedSets.length > 0) {
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

      if (!isStrengthUI) {
        await cardioMetricsService.create({
          activity_id:    activity.id,
          distance:       distanceKm,
          avg_heart_rate: avgHeartRate,
          calories:       cardioCalories,
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
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        <div
          className="relative w-full max-h-[92vh] flex flex-col overflow-hidden max-w-lg mx-auto"
          style={{ background: GROUND, color: INK, border: `2px solid ${INK}`, boxShadow: '0 12px 32px rgba(45,43,43,0.25)' }}
        >
          {/* Handle */}
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
            <div className="w-10 h-1" style={{ background: INK }} />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-2 pb-3" style={{ borderBottom: `2px solid ${INK}` }}>
            <div>
              <h2 className="text-base font-800 leading-tight tracking-tight">Active Workout</h2>
              {loggedSets.length > 0 && (
                <p className="text-[11px]" style={{ color: MUTED }}>
                  {loggedSets.length} set{loggedSets.length !== 1 ? 's' : ''} logged
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-1.5" style={{ color: MUTED }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Draft restore banner */}
          {draftToRestore && (
            <div
              className="mx-4 mt-3 p-3 flex items-center gap-3"
              style={{ border: `2px solid ${ACCENT}`, background: ACCENT_TINT, color: ACCENT_DEEP }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-800 uppercase tracking-[0.06em]">Unfinished workout found</p>
                <p className="text-xs mt-0.5">
                  {draftToRestore.loggedSets.length} sets · {format(new Date(draftToRestore.savedAt), 'h:mm a')}
                </p>
              </div>
              <button
                onClick={restoreDraft}
                className="text-xs font-800 px-2 py-1"
                style={{ border: `2px solid ${ACCENT_DEEP}` }}
              >
                Restore
              </button>
              <button onClick={discardDraft} className="text-xs font-800" style={{ color: MUTED }}>
                Discard
              </button>
            </div>
          )}

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">

            {/* Session meta */}
            <div className="px-4 pt-4 pb-3 space-y-3" style={{ borderBottom: `2px solid ${INK}` }}>
              <div className="flex gap-1.5 flex-wrap">
                {TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-800"
                    style={{
                      border: `2px solid ${INK}`,
                      background: type === t.value ? INK : 'transparent',
                      color: type === t.value ? GROUND : INK,
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              {type === 'cult_session' && (
                <div className="flex gap-1.5 flex-wrap">
                  {SUB_TYPES.map(st => (
                    <button
                      key={st.value}
                      onClick={() => setSubType(st.value)}
                      className="px-2.5 py-1 text-xs font-800"
                      style={{
                        border: `2px solid ${INK}`,
                        background: subType === st.value ? ACCENT : 'transparent',
                        color: subType === st.value ? GROUND : INK,
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="px-3 py-1.5 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>

            {/* ── STRENGTH ── */}
            {isStrengthUI && (
              <div className="px-4 pt-4 pb-3 space-y-4">

                {/* Quick-add card */}
                <div className="p-4 space-y-3" style={{ border: `2px solid ${INK}` }}>
                  <p className="text-[10px] font-800 uppercase tracking-[0.1em]">Log a set</p>

                  {/* Exercise selector */}
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowPicker(p => !p); setExSearch(''); }}
                        className="flex-1 flex items-center justify-between px-3 py-2.5 text-sm"
                        style={{ border: `2px solid ${INK}`, background: PANEL }}
                      >
                        <span className="font-800" style={currentEx ? undefined : { color: MUTED }}>
                          {currentEx?.name ?? 'Choose exercise…'}
                        </span>
                        <ChevronDown className="w-4 h-4 flex-shrink-0" />
                      </button>
                      {currentEx && (
                        <>
                          <button
                            onClick={() => toggleTrack(currentEx.id)}
                            className="p-2"
                            style={{
                              border: `2px solid ${INK}`,
                              color: trackedIds.has(currentEx.id) ? ACCENT_DEEP : MUTED,
                            }}
                          >
                            <Star className="w-4 h-4" fill={trackedIds.has(currentEx.id) ? ACCENT_DEEP : 'none'} />
                          </button>
                          {trackedIds.has(currentEx.id) && (
                            <button
                              onClick={() => setShowProgress(true)}
                              className="p-2"
                              style={{ border: `2px solid ${INK}` }}
                            >
                              <TrendingUp className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {showPicker && (
                      <div
                        className="absolute top-full left-0 right-0 z-20 mt-1 overflow-hidden"
                        style={{ background: GROUND, border: `2px solid ${INK}`, boxShadow: '0 12px 32px rgba(45,43,43,0.25)' }}
                      >
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search exercises…"
                          value={exSearch}
                          onChange={e => setExSearch(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm focus:outline-none"
                          style={{ background: GROUND, color: INK, borderBottom: `2px solid ${INK}`, colorScheme: 'light' }}
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
                              className="w-full text-left px-3 py-2.5 text-sm font-600 flex items-center gap-2"
                              style={{ borderBottom: `2px solid ${RULE}` }}
                            >
                              <span className="flex-1">{ex.name}</span>
                              {trackedIds.has(ex.id) && (
                                <Star className="w-3 h-3 flex-shrink-0" fill={ACCENT_DEEP} style={{ color: ACCENT_DEEP }} />
                              )}
                              <span className="text-xs flex-shrink-0" style={{ color: MUTED }}>{ex.category}</span>
                            </button>
                          ))}
                          {canCreateEx && (
                            <div style={{ borderTop: `2px solid ${INK}` }}>
                              <div className="px-3 pt-2 pb-1">
                                <p className="text-[10px] font-800 uppercase tracking-[0.08em] mb-1.5" style={{ color: MUTED }}>Category</p>
                                <div className="flex flex-wrap gap-1">
                                  {(['push','pull','legs','core','cardio','mobility','other'] as ExerciseCategory[]).map(cat => (
                                    <button
                                      key={cat}
                                      onMouseDown={e => { e.preventDefault(); setNewExCategory(cat); }}
                                      className="px-2 py-0.5 text-xs font-800 capitalize"
                                      style={{
                                        border: `2px solid ${INK}`,
                                        background: newExCategory === cat ? INK : 'transparent',
                                        color: newExCategory === cat ? GROUND : INK,
                                      }}
                                    >
                                      {cat}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <button
                                onMouseDown={createExercise}
                                disabled={creatingEx}
                                className="w-full text-left px-3 py-2.5 text-sm font-800 flex items-center gap-2 disabled:opacity-50"
                                style={{ color: ACCENT_DEEP }}
                              >
                                <Plus className="w-4 h-4 flex-shrink-0" />
                                {creatingEx ? 'Creating…' : `Create "${exSearch.trim()}" · ${newExCategory}`}
                              </button>
                            </div>
                          )}
                          {filteredExercises.length === 0 && !canCreateEx && (
                            <p className="px-3 py-3 text-sm" style={{ color: MUTED }}>No exercises found</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Last time + best of last 3 sessions */}
                  <ExerciseProgressCard sessions={recentSessions} />

                  {/* Reps × Weight */}
                  <div className="p-3" style={{ border: `2px solid ${ACCENT}`, background: ACCENT_TINT }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-800 uppercase tracking-[0.12em]" style={{ color: ACCENT_DEEP }}>Weight entry</p>
                        <p className="mt-0.5 text-sm font-800">Choose one mode</p>
                      </div>
                      <span
                        className="shrink-0 px-2.5 py-1 text-[11px] font-800 uppercase"
                        style={{ border: `2px solid ${INK}`, background: INK, color: GROUND }}
                      >
                        {activeLoadMode.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {LOAD_MODE_OPTIONS.map(option => {
                        const selected = loadMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setLoadMode(option.value)}
                            className="min-h-[64px] px-3 py-2 text-left transition-transform active:scale-[0.98]"
                            style={{
                              border: `2px solid ${INK}`,
                              background: selected ? INK : GROUND,
                              color: selected ? GROUND : INK,
                            }}
                          >
                            <span className="block text-sm font-800 leading-tight">{option.label}</span>
                            <span className="mt-1 block text-[11px] leading-tight opacity-70">
                              {option.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-xs leading-snug">
                      {LOAD_MODE_HELP[loadMode]}
                    </p>
                    {selectedEquipment && (
                      <p className="mt-1 text-[11px]" style={{ color: ACCENT_DEEP }}>
                        Auto-selected from exercise type: {selectedEquipment}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-800 uppercase tracking-[0.1em]">Set details</p>
                    <span className="px-2 py-1 text-[11px] font-800" style={{ border: `2px solid ${INK}` }}>
                      {activeLoadMode.label}
                    </span>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>Reps</label>
                      <input
                        ref={repsRef}
                        type="number"
                        inputMode="numeric"
                        placeholder="10"
                        value={currentReps}
                        onChange={e => setCurrentReps(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && logSet()}
                        className="w-full px-3 py-3 text-lg font-800 nums focus:outline-none text-center"
                        style={inputStyle}
                      />
                    </div>
                    <p className="pb-3 font-800" style={{ color: MUTED }}>×</p>
                    <div className="flex-1">
                      <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>{weightInputLabel}</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0"
                        value={currentWeight}
                        onChange={e => setCurrentWeight(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && logSet()}
                        className="w-full px-3 py-3 text-lg font-800 nums focus:outline-none text-center"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {loadMode === 'barbell_plates' && (
                    <div>
                      <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>Rod / bar weight (kg)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="20"
                        value={barWeight}
                        onChange={e => setBarWeight(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm nums focus:outline-none"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {loadMode === 'bodyweight' && (
                    <div>
                      <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>Bodyweight used (%)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="100"
                        value={bodyFactor}
                        onChange={e => setBodyFactor(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm nums focus:outline-none"
                        style={inputStyle}
                      />
                    </div>
                  )}

                  <div className="px-3 py-2" style={{ border: `2px solid ${RULE}`, background: PANEL }}>
                    <p className="text-xs" style={{ color: MUTED }}>
                      Saved as: <span className="font-800" style={{ color: INK }}>{loadPreview.load_label}</span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: MUTED }}>
                      Effective load: <span className="font-800 nums" style={{ color: INK }}>{Math.round(loadPreview.weight * 10) / 10} kg</span>
                    </p>
                    {loadMode === 'bodyweight' && !bodyWeightKg && (
                      <p className="text-[11px] font-800 mt-1" style={{ color: ACCENT_DEEP }}>Log body weight in metrics for bodyweight calorie estimates.</p>
                    )}
                  </div>

                  <button
                    onClick={logSet}
                    className="w-full py-3.5 font-800 text-sm transition-transform duration-200 flex items-center justify-center gap-2 active:scale-[0.97]"
                    style={{
                      border: `2px solid ${INK}`,
                      background: justAdded ? INK : ACCENT,
                      color: GROUND,
                    }}
                  >
                    {justAdded ? <><CheckCircle2 className="w-4 h-4" /> Set Logged!</> : '+ Log Set'}
                  </button>
                </div>

                {loggedSets.length > 0 && (
                  <div className="p-3" style={{ border: `2px solid ${ACCENT}`, background: ACCENT_TINT }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: ACCENT_DEEP }}>Burn estimate</p>
                        <p className="text-[11px] mt-0.5">
                          {strengthEstimateCopy}
                        </p>
                      </div>
                      <p className="text-lg font-800 nums flex-none">
                        {strengthCalories ? `${strengthCalories.calories} kcal` : '-- kcal'}
                      </p>
                    </div>
                    {!bodyWeightKg && (
                      <p className="text-[11px] font-800 mt-2" style={{ color: ACCENT_DEEP }}>Add body weight in metrics to calculate this.</p>
                    )}
                  </div>
                )}

                {/* Accumulated sets */}
                {exerciseOrder.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-800 uppercase tracking-[0.1em]">
                      This session · {loggedSets.length} set{loggedSets.length !== 1 ? 's' : ''}
                    </p>
                    {exerciseOrder.map(exId => (
                      <div key={exId} className="overflow-hidden" style={{ border: `2px solid ${INK}` }}>
                        <p className="px-3 py-2 text-xs font-800" style={{ background: INK, color: GROUND }}>
                          {grouped[exId].name}
                        </p>
                        {grouped[exId].sets.map((s, i) => (
                          <div key={s.uid} style={{ borderTop: i === 0 ? undefined : `2px solid ${RULE}`, background: PANEL }}>
                            {editUid === s.uid ? (
                              // Inline edit row
                              <div className="flex items-center gap-2 px-3 py-2">
                                <span className="text-xs font-800 w-5 flex-shrink-0" style={{ color: MUTED }}>S{i + 1}</span>
                                <input
                                  autoFocus
                                  type="number"
                                  inputMode="numeric"
                                  value={editReps}
                                  onChange={e => setEditReps(e.target.value)}
                                  className="w-14 px-2 py-1 text-sm nums text-center focus:outline-none"
                                  style={inputStyle}
                                  placeholder="reps"
                                />
                                <span className="text-xs font-800" style={{ color: MUTED }}>×</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={editWeight}
                                  onChange={e => setEditWeight(e.target.value)}
                                  className="w-16 px-2 py-1 text-sm nums text-center focus:outline-none"
                                  style={inputStyle}
                                  placeholder="kg"
                                />
                                <button onClick={saveEdit} className="p-1 ml-auto" style={{ color: ACCENT_DEEP }}>
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditUid(null)} className="p-1" style={{ color: MUTED }}>
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              // Normal row
                              <div className="flex items-center px-3 py-2.5 gap-3">
                                <span className="text-xs font-800 w-5 flex-shrink-0" style={{ color: MUTED }}>S{i + 1}</span>
                                <span className="text-sm flex-1 nums">
                                  <span className="font-800">{s.reps}</span> reps
                                  {s.weight > 0 && (
                                    <> × <span className="font-800">{s.weight} kg</span></>
                                  )}
                                </span>
                                <button onClick={() => startEdit(s)} className="p-1.5" style={{ color: MUTED }}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => removeSet(s.uid)} className="p-1.5" style={{ color: ACCENT_DEEP }}>
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

            {/* ── SWIM / RUN / CULT ── */}
            {!isStrengthUI && (
              <div className="px-4 pt-4 pb-3 space-y-3">
                <p className="text-[10px] font-800 uppercase tracking-[0.1em]">Session Details</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ...(type === 'swimming' || type === 'run'
                      ? [{ label: 'Distance (km)', placeholder: '5.0', value: distance, step: '0.01', set: setDistance }]
                      : []),
                    { label: 'Avg HR (bpm)',  placeholder: '145',  value: avgHr,     step: '1',    set: setAvgHr    },
                    { label: 'App kcal',      placeholder: '400',  value: calories,  step: '1',    set: setCalories },
                  ] as const).map(f => (
                    <div key={f.label}>
                      <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>{f.label}</label>
                      <input
                        type="number"
                        step={f.step}
                        placeholder={f.placeholder}
                        value={f.value}
                        onChange={e => f.set(e.target.value)}
                        className="w-full px-2 py-2.5 text-sm nums focus:outline-none text-center"
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <div className="p-3" style={{ border: `2px solid ${ACCENT}`, background: ACCENT_TINT }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: ACCENT_DEEP }}>Burn estimate</p>
                      <p className="text-[11px] mt-0.5">
                        {machineCalories != null
                          ? 'Using entered app kcal.'
                          : cardioEstimate
                            ? 'Estimated from latest body weight and session type.'
                            : 'Enter duration and body weight to estimate.'}
                      </p>
                    </div>
                    <p className="text-lg font-800 nums flex-none">
                      {cardioCalories != null ? `${cardioCalories} kcal` : '-- kcal'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Duration + Notes */}
            <div className="px-4 pt-3 pb-5 mt-1 space-y-3" style={{ borderTop: `2px solid ${INK}` }}>
              <div>
                <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>Duration (min)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Fill when done — e.g. 60"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  className="w-full px-3 py-2 text-sm nums focus:outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>Notes (optional)</label>
                <textarea
                  placeholder="How did it feel?"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm focus:outline-none resize-none"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 pb-8 pt-3" style={{ borderTop: `2px solid ${INK}` }}>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full h-12 text-sm font-800 disabled:opacity-50 transition-opacity"
              style={{ border: `2px solid ${INK}`, background: INK, color: GROUND }}
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
            if (tracked) {
              next.add(id);
            } else {
              next.delete(id);
            }
            return next;
          });
        }}
      />
    </>
  );
}
