import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { X, CheckCircle2, Trash2, ChevronDown, Plus, Pencil, Star, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Activity, CardioCalorieSource, Exercise, ExerciseCategory, WorkoutCategory, WorkoutSubType } from '@/types';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { toISODate } from '@/lib/utils';
import { calcCardioCalories, calcStrengthCalories } from '@/engines/calorieEngine';
// Lazy: this sheet owns the recharts dependency (~400 KB raw).
const ExerciseProgressSheet = lazy(() => import('./ExerciseProgressSheet'));
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

interface LoggedCardio {
  uid: string;
  exercise_id: string;
  exercise_name: string;
  minutes: number;
  calories: number | null;
  label: string;
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
  cardioEntries?: LoggedCardio[];
  notes?: string;
  savedAt: number;
}

const PENDING_CARDIO_ID = 'pending-cardio';

function isCardioName(name: string) {
  return name.trim().toLowerCase() === 'cardio';
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  autoResume?: boolean; // if true, auto-restore draft without asking
  initialType?: WorkoutCategory;
  initialExerciseName?: string;
}

const TYPES = [
  { value: 'gym',          label: 'Gym',          icon: '💪' },
  { value: 'cult_session', label: 'Cult',         icon: '🔥' },
  { value: 'swimming',     label: 'Swim',         icon: '🏊' },
  { value: 'run',          label: 'Run',          icon: '🏃' },
  { value: 'other',        label: 'Others',       icon: '✎' },
] as const;

export default function LogWorkoutSheet({ open, onClose, onSuccess, autoResume = false, initialType, initialExerciseName }: Props) {
  const { user } = useAuth();
  // Session metadata
  const [type,     setType]     = useState<WorkoutCategory>(initialType ?? 'gym');
  const [subType,  setSubType]  = useState<WorkoutSubType>('burn');
  const [date,     setDate]     = useState(toISODate(new Date()));
  const [duration, setDuration] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  // Exercise picker
  const [exercises,  setExercises]  = useState<Exercise[]>([]);
  const [exSearch,   setExSearch]   = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [currentEx,  setCurrentEx]  = useState<{ id: string; name: string } | null>(
    initialExerciseName ? { id: PENDING_CARDIO_ID, name: initialExerciseName } : null,
  );
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
  const [cardioEntries, setCardioEntries] = useState<LoggedCardio[]>([]);
  const [cardioMinutes, setCardioMinutes] = useState('');
  const [cardioKcal, setCardioKcal] = useState('');
  const [cardioLabel, setCardioLabel] = useState('');

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
  const isOther = type === 'other';
  const isCardioExercise = currentEx ? isCardioName(currentEx.name) : false;
  const cardioMethod = cardioMethodFor(type, subType);

  // Load exercises once
  useEffect(() => {
    if (open && exercises.length === 0) {
      exercisesService.getAll().then(list => {
        setExercises(list);
        if (initialExerciseName) {
          const found = list.find(exercise => exercise.name.toLowerCase() === initialExerciseName.toLowerCase());
          setCurrentEx(found
            ? { id: found.id, name: found.name }
            : { id: PENDING_CARDIO_ID, name: initialExerciseName });
        }
      }).catch(() => {
        if (initialExerciseName) setCurrentEx({ id: PENDING_CARDIO_ID, name: initialExerciseName });
      });
    }
  }, [open, exercises.length, initialExerciseName]);

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
          setCardioEntries(draft.cardioEntries ?? []);
          if (draft.notes) setNotes(draft.notes);
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
    if (!currentExerciseId || currentExerciseId === PENDING_CARDIO_ID || isCardioName(currentEx?.name ?? '')) {
      setRecentSessions([]);
      return;
    }
    strengthSetsService.getRecentSessions(currentExerciseId, 3)
      .then(setRecentSessions)
      .catch(() => setRecentSessions([]));
  }, [currentExerciseId, currentEx?.name]);

  useEffect(() => {
    if (!currentExerciseId || !selectedEquipment) return;
    const nextMode = DEFAULT_MODE_BY_EQUIPMENT[selectedEquipment] ?? 'total';
    setLoadMode(current => (current === nextMode ? current : nextMode));
  }, [currentExerciseId, selectedEquipment]);

  if (!open) return null;

  const exerciseCatalog = exercises.some(exercise => isCardioName(exercise.name))
    ? exercises
    : [
        {
          id: PENDING_CARDIO_ID,
          name: 'Cardio',
          category: 'cardio' as const,
          primary_muscle: 'Cardio',
          secondary_muscles: [] as string[],
          is_custom: false,
          created_at: '',
        },
        ...exercises,
      ];
  const filteredExercises = exerciseCatalog
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

  const saveDraft = (sets: LoggedSet[], entries: LoggedCardio[], t: Activity['type'], d: string, note = notes) => {
    if (sets.length === 0 && entries.length === 0 && !note.trim()) { localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      type: t, subType, date: d, loggedSets: sets, cardioEntries: entries, notes: note, savedAt: Date.now(),
    }));
  };

  const restoreDraft = () => {
    if (!draftToRestore) return;
    setType(draftToRestore.type);
    setSubType(draftToRestore.subType ?? 'burn');
    setDate(draftToRestore.date);
    setLoggedSets(draftToRestore.loggedSets);
    setCardioEntries(draftToRestore.cardioEntries ?? []);
    if (draftToRestore.notes) setNotes(draftToRestore.notes);
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
      saveDraft(next, cardioEntries, type, date);
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
      saveDraft(next, cardioEntries, type, date);
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
      saveDraft(next, cardioEntries, type, date);
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
    setCardioEntries([]);
    setCardioMinutes('');
    setCardioKcal('');
    setCardioLabel('');
    setEditUid(null);
    setDraftToRestore(null);
    localStorage.removeItem(DRAFT_KEY);
  };

  const logCardio = () => {
    if (!currentEx || !isCardioName(currentEx.name)) return toast.error('Pick Cardio first');
    const minutes = Number(cardioMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return toast.error('Enter minutes');
    const label = cardioLabel.trim();
    if (!label) return toast.error('Enter a cardio type');
    const parsedCalories = cardioKcal.trim() === '' ? null : Number(cardioKcal);
    if (parsedCalories != null && !Number.isFinite(parsedCalories)) return toast.error('Enter calories');
    const entry: LoggedCardio = {
      uid: `${Date.now()}-${Math.random()}`,
      exercise_id: currentEx.id,
      exercise_name: currentEx.name,
      minutes,
      calories: parsedCalories,
      label,
    };
    setCardioEntries(prev => {
      const next = [...prev, entry];
      saveDraft(loggedSets, next, type, date);
      return next;
    });
    setCardioMinutes('');
    setCardioKcal('');
    setCardioLabel('');
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 900);
  };

  const removeCardio = (uid: string) => {
    setCardioEntries(prev => {
      const next = prev.filter(entry => entry.uid !== uid);
      saveDraft(loggedSets, next, type, date);
      return next;
    });
  };

  const handleFinish = async () => {
    if (!date) return toast.error('Please set a date');
    if (!user) return toast.error('Sign in required');
    if (isOther && !notes.trim()) return toast.error('Write what you did');
    if (isStrengthUI && loggedSets.length === 0 && cardioEntries.length === 0) return toast.error('Log at least one set');
    if (!isStrengthUI && !isOther && durationMins <= 0) return toast.error('Enter duration');

    const cardioKcalTotal = cardioEntries.reduce((sum, entry) => sum + (entry.calories ?? 0), 0);
    const listedCalories = isStrengthUI
      ? ((strengthCalories?.calories ?? 0) + cardioKcalTotal) || null
      : cardioCalories ?? null;

    setSaving(true);
    try {
      await activitiesService.saveWorkout({
        userId: user.id,
        activity: {
          date,
          type,
          sub_type: type === 'cult_session' ? subType : undefined,
          duration: duration ? parseInt(duration, 10) : undefined,
          notes: notes || undefined,
          tags: [],
          structured_metrics: isStrengthUI ? {
            calorieEstimate: listedCalories != null ? {
              calories: listedCalories,
              met: strengthCalories?.met ?? null,
              method: strengthCalories?.method ?? 'cardio_entries',
              durationHours: strengthCalories?.duration_hrs ?? null,
              activeDurationHours: strengthCalories?.active_duration_hrs ?? null,
              totalVolumeKg: strengthCalories?.total_volume_kg ?? 0,
              totalReps: strengthCalories?.total_reps ?? 0,
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
            calorieEstimate: listedCalories != null ? {
              calories: listedCalories,
              source: cardioCalorieSource,
              machineCalories: machineCalories ?? null,
              estimatedCalories: cardioEstimate?.calories ?? null,
              met: cardioEstimate?.met ?? null,
              method: cardioEstimate?.method ?? null,
              durationHours: cardioEstimate?.duration_hrs ?? durationMins / 60,
              bodyWeightKg,
            } : null,
          },
        },
        sets: loggedSets.map((s, i) => ({
          exercise_id: s.exercise_id,
          set_number: i + 1,
          reps: s.reps,
          weight: s.weight || undefined,
        })),
        cardio: cardioEntries.map((entry, index) => ({
          exercise_id: entry.exercise_id,
          position: index + 1,
          duration_minutes: entry.minutes,
          calories: entry.calories,
          label: entry.label,
        })),
        legacyCardio: !isStrengthUI && !isOther ? {
          distance: distanceKm,
          avg_heart_rate: avgHeartRate,
          calories: cardioCalories,
        } : null,
      });

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
      <div className="sheet-overlay z-50">
        <div className="sheet-safe-bar" aria-hidden="true" />
        <div className="sheet-stage">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        <div
          className="sheet-panel relative max-w-lg mx-auto"
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
            <button onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center" style={{ color: MUTED }} aria-label="Close workout">
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
                    className="flex min-h-11 items-center gap-1 px-2.5 text-xs font-800"
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
                      className="min-h-11 px-2.5 text-xs font-800"
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
                              onClick={() => {
                                setCurrentEx({ id: ex.id, name: ex.name });
                                setShowPicker(false);
                                setTimeout(() => repsRef.current?.focus(), 50);
                              }}
                              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-600"
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
                                      onClick={() => setNewExCategory(cat)}
                                      className="min-h-11 px-2 text-xs font-800 capitalize"
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
                                onClick={createExercise}
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

                  {!isCardioExercise && <ExerciseProgressCard sessions={recentSessions} />}

                  {isCardioExercise && (
                    <div className="space-y-3" data-testid="cardio-entry">
                      <p className="text-[10px] font-800 uppercase tracking-[0.1em]">Cardio</p>
                      <label className="block text-[10px] font-800 uppercase tracking-[0.08em]" style={{ color: MUTED }}>
                        Type
                        <input
                          aria-label="Cardio type"
                          value={cardioLabel}
                          onChange={e => setCardioLabel(e.target.value)}
                          placeholder="Treadmill incline walk"
                          className="mt-1 w-full px-3 py-2 text-sm focus:outline-none"
                          style={inputStyle}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[10px] font-800 uppercase tracking-[0.08em]" style={{ color: MUTED }}>
                          Minutes
                          <input
                            aria-label="Cardio minutes"
                            type="number"
                            inputMode="numeric"
                            value={cardioMinutes}
                            onChange={e => setCardioMinutes(e.target.value)}
                            placeholder="20"
                            className="mt-1 w-full px-3 py-2 text-sm nums focus:outline-none"
                            style={inputStyle}
                          />
                        </label>
                        <label className="block text-[10px] font-800 uppercase tracking-[0.08em]" style={{ color: MUTED }}>
                          Calories
                          <input
                            aria-label="Cardio calories"
                            type="number"
                            inputMode="decimal"
                            value={cardioKcal}
                            onChange={e => setCardioKcal(e.target.value)}
                            placeholder="180"
                            className="mt-1 w-full px-3 py-2 text-sm nums focus:outline-none"
                            style={inputStyle}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={logCardio}
                        className="flex min-h-11 w-full items-center justify-center text-sm font-800"
                        style={{ border: `2px solid ${INK}`, background: ACCENT, color: GROUND }}
                      >
                        Add cardio
                      </button>
                      {cardioEntries.length > 0 && (
                        <ul aria-label="Cardio entries">
                          {cardioEntries.map(entry => (
                            <li key={entry.uid} className="flex min-h-11 items-center gap-2 py-2" style={{ borderTop: `2px solid ${RULE}` }}>
                              <span className="flex-1 text-sm">
                                <span className="font-800">{entry.label}</span>
                                <span style={{ color: MUTED }}> · {entry.minutes} min{entry.calories != null ? ` · ${entry.calories} kcal` : ''}</span>
                              </span>
                              <button type="button" onClick={() => removeCardio(entry.uid)} className="min-h-11 min-w-11" style={{ color: ACCENT_DEEP }} aria-label={`Remove ${entry.label}`}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {!isCardioExercise && <>
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
                  </>}

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
              </div>
            )}

            {/* ── SWIM / RUN / CULT ── */}
            {!isStrengthUI && !isOther && (
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
                        inputMode={f.step === '1' ? 'numeric' : 'decimal'}
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

            {isOther && (
              <div className="px-4 pt-4" data-testid="other-session">
                <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>What did you do?</label>
                <textarea
                  aria-label="Others notes"
                  placeholder="A paragraph about the session"
                  value={notes}
                  rows={6}
                  onChange={e => {
                    setNotes(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  className="min-h-[9rem] w-full px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                />
              </div>
            )}

            {!isOther && (
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
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 pt-3" style={{ borderTop: `2px solid ${INK}`, paddingBottom: 'max(0.75rem, var(--sab))' }}>
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
      </div>

      {/* Exercise progress sheet (z-[60] so it layers above the workout sheet).
          Mounted only while open: it pulls in recharts, and rendering it
          unconditionally kept that in the main bundle even though the sheet is
          opened on demand. It already returns null without an exercise and has
          no close animation, so gating the mount changes nothing visually. */}
      {showProgress && (
      <Suspense fallback={null}>
      <ExerciseProgressSheet
        exercise={currentEx}
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
      </Suspense>
      )}
    </>
  );
}
