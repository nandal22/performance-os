import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { X, CheckCircle2, Trash2, ChevronDown, Plus, Pencil, Star, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import type { CardioCalorieSource, Exercise, ExerciseCategory, WorkoutCategory, WorkoutSubType } from '@/types';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { sessionStore } from '@/services/sessions';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { toISODate } from '@/lib/utils';
import { calcCardioCalories } from '@/engines/calorieEngine';
import { strengthSessionMetrics } from '@/lib/sessionMetrics';
import { bodyweightLabel } from '@/lib/planMath';
import { clearSession, globalSetNumber, newId, wasEnded, type LoadMode, type SessionCardio, type SessionSet, type WorkoutSession } from '@/lib/workoutSession';
// Lazy: this sheet owns the recharts dependency (~400 KB raw).
const ExerciseProgressSheet = lazy(() => import('./ExerciseProgressSheet'));
import ExerciseProgressCard from './ExerciseProgressCard';

// Written by builds before sessions persisted set by set. Read once and moved into a session.
const LEGACY_DRAFT_KEY = 'perf-os-draft';

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

interface LegacyDraft {
  type: WorkoutCategory;
  subType?: WorkoutSubType;
  date: string;
  loggedSets: Array<Omit<SessionSet, 'id' | 'set_number' | 'rpe' | 'plan_set_id' | 'weight'> & { weight: number }>;
  cardioEntries?: Array<{ exercise_id: string; exercise_name: string; minutes: number; calories: number | null; label: string }>;
  notes?: string;
  savedAt: number;
}

function readLegacyDraft(): LegacyDraft | null {
  try {
    const raw = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as LegacyDraft;
    if (Date.now() - draft.savedAt > 86400000) return null;
    return (draft.loggedSets?.length ?? 0) + (draft.cardioEntries?.length ?? 0) > 0 ? draft : null;
  } catch {
    return null;
  }
}

const PENDING_CARDIO_ID = 'pending-cardio';

function isCardioName(name: string) {
  return name.trim().toLowerCase() === 'cardio';
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
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

export default function LogWorkoutSheet({ open, onClose, onSuccess, initialType, initialExerciseName }: Props) {
  const { user } = useAuth();
  // The unfinished session, if any. Every logged set is already in the database (or queued for it).
  const [session, setSession] = useState<WorkoutSession | null>(() => {
    const existing = sessionStore.read(null);
    if (!existing) return null;
    if (!wasEnded(existing.activityId)) return existing;
    clearSession(null);
    return null;
  });
  const sessionRef = useRef(session);
  const commit = (next: WorkoutSession | null) => {
    sessionRef.current = next;
    setSession(next);
  };
  const sync = useSyncStatus(session?.activityId ?? null);
  // Session metadata
  const [type,     setType]     = useState<WorkoutCategory>((session?.type as WorkoutCategory | undefined) ?? initialType ?? 'gym');
  const [subType,  setSubType]  = useState<WorkoutSubType>((session?.subType as WorkoutSubType | null) ?? 'burn');
  const [date,     setDate]     = useState(session?.date ?? toISODate(new Date()));
  const [duration, setDuration] = useState('');
  const [notes,    setNotes]    = useState(session?.notes ?? '');
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
  const loggedSets = session?.sets ?? [];
  const cardioEntries = session?.cardio ?? [];
  const [cardioMinutes, setCardioMinutes] = useState('');
  const [cardioKcal, setCardioKcal] = useState('');
  const [cardioLabel, setCardioLabel] = useState('');

  // Set editing
  const [editUid,    setEditUid]    = useState<string | null>(null);
  const [editReps,   setEditReps]   = useState('');
  const [editWeight, setEditWeight] = useState('');

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
  const selectedEquipment = selectedExercise?.load_type === 'per_dumbbell'
    ? 'dumbbell'
    : selectedExercise?.load_type === 'bodyweight' ? 'bodyweight' : selectedExercise?.equipment ?? null;
  // Timed moves (planks, holds, carries) log seconds instead of reps.
  const timed = selectedExercise?.measure === 'time';
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

  // A draft left by the previous build never reached the database. Move it into a session once.
  useEffect(() => {
    if (!open || sessionRef.current) return;
    const draft = readLegacyDraft();
    localStorage.removeItem(LEGACY_DRAFT_KEY);
    if (!draft) return;
    let next = sessionStore.begin({
      planId: null,
      type: draft.type,
      subType: draft.type === 'cult_session' ? draft.subType ?? 'burn' : null,
      date: draft.date,
      notes: draft.notes ?? '',
    });
    draft.loggedSets.forEach((set, index) => {
      next = sessionStore.saveSet(next, { ...set, id: newId(), set_number: index + 1, rpe: null, plan_set_id: null });
    });
    (draft.cardioEntries ?? []).forEach((entry, index) => {
      next = sessionStore.saveCardio(next, { ...entry, id: newId(), position: index + 1, plan_exercise_id: null });
    });
    commit(next);
    setType(draft.type);
    setSubType(draft.subType ?? 'burn');
    setDate(draft.date);
    setNotes(draft.notes ?? '');
  }, [open]);

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
        // The split is stored with the set; weight stays the total effective load.
        added_weight_kg: currentWeightValue,
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

  const ensureSession = () => {
    if (sessionRef.current) return sessionRef.current;
    const started = sessionStore.begin({
      planId: null,
      type,
      subType: type === 'cult_session' ? subType : null,
      date,
      notes,
    });
    commit(started);
    return started;
  };

  const changeMeta = (meta: { type?: WorkoutCategory; subType?: WorkoutSubType; date?: string }) => {
    const nextType = meta.type ?? type;
    const nextSub = meta.subType ?? subType;
    const current = sessionRef.current;
    if (current && !isStrengthCategory(nextType, nextSub)) {
      toast.error('Finish or discard this workout first');
      return;
    }
    if (meta.type) setType(meta.type);
    if (meta.subType) setSubType(meta.subType);
    if (meta.date) setDate(meta.date);
    if (current && (meta.date ?? date)) {
      commit(sessionStore.updateMeta(current, {
        date: meta.date ?? date,
        type: nextType,
        subType: nextType === 'cult_session' ? nextSub : null,
      }));
    }
  };

  const changeNotes = (value: string) => {
    setNotes(value);
    if (sessionRef.current) commit(sessionStore.patch(sessionRef.current, { notes: value }));
  };

  const discardSession = () => {
    const current = sessionRef.current;
    if (!current) return;
    if (!window.confirm('Discard this workout? Logged sets are deleted.')) return;
    sessionStore.discard(current);
    resetForm();
  };

  const logSet = () => {
    if (!currentEx) return toast.error('Pick an exercise first');
    if (!currentReps || parseInt(currentReps) <= 0) return toast.error(timed ? 'Enter seconds' : 'Enter reps');
    const load = buildLoad();
    if (loadMode === 'bodyweight' && !bodyWeightKg) {
      toast.message('Bodyweight set saved without bodyweight load estimate');
    }

    const current = ensureSession();
    const newSet: SessionSet = {
      id:            newId(),
      exercise_id:   currentEx.id,
      exercise_name: currentEx.name,
      set_number:    current.sets.length + 1,
      reps:          timed ? null : parseInt(currentReps),
      ...(timed ? { duration_sec: parseInt(currentReps) } : {}),
      ...('added_weight_kg' in load ? { added_weight_kg: load.added_weight_kg } : {}),
      weight:        load.weight,
      rpe:           null,
      plan_set_id:   null,
      load_mode:     loadMode,
      input_weight:  load.input_weight,
      bar_weight:    load.bar_weight,
      bodyweight_factor: load.bodyweight_factor,
      bodyweight_kg: load.bodyweight_kg,
      load_label:    load.load_label,
    };

    commit(sessionStore.saveSet(current, newSet));

    setCurrentReps('');
    if (loadMode !== 'barbell_plates') setCurrentWeight('');
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 900);
    setTimeout(() => repsRef.current?.focus(), 50);
  };

  const removeSet = (id: string) => {
    if (!sessionRef.current) return;
    commit(sessionStore.deleteSet(sessionRef.current, id));
  };

  const startEdit = (s: SessionSet) => {
    setEditUid(s.id);
    setEditReps(String(s.reps ?? s.duration_sec ?? ''));
    // Bodyweight sets edit the added kg; the rest edit the total.
    const shown = s.added_weight_kg != null ? s.added_weight_kg : s.weight ?? 0;
    setEditWeight(shown > 0 ? String(shown) : '');
  };

  const saveEdit = () => {
    const current = sessionRef.current;
    const original = current?.sets.find(s => s.id === editUid);
    if (!current || !original) { setEditUid(null); return; }
    const entered = parseFloat(editWeight) || 0;
    const count = parseInt(editReps);
    const isTimedSet = original.reps == null && original.duration_sec != null;
    if (original.added_weight_kg != null) {
      const base = Math.round(((original.weight ?? 0) - original.added_weight_kg) * 100) / 100;
      commit(sessionStore.saveSet(current, {
        ...original,
        ...(isTimedSet ? { duration_sec: count || original.duration_sec } : { reps: count || original.reps }),
        weight: Math.round((base + entered) * 100) / 100,
        added_weight_kg: entered,
        input_weight: entered,
      }));
      setEditUid(null);
      return;
    }
    const weight = entered;
    commit(sessionStore.saveSet(current, {
      ...original,
      ...(isTimedSet ? { duration_sec: count || original.duration_sec } : { reps: count || original.reps }),
      weight,
      input_weight: original.load_mode === 'dumbbell_pair' ? weight / 2 : original.load_mode === 'total' ? weight : original.input_weight,
    }));
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
  const grouped: Record<string, { name: string; sets: SessionSet[] }> = {};
  for (const s of loggedSets) {
    if (!grouped[s.exercise_id]) {
      grouped[s.exercise_id] = { name: s.exercise_name, sets: [] };
      exerciseOrder.push(s.exercise_id);
    }
    grouped[s.exercise_id].sets.push(s);
  }
  const durationMins = duration ? parseInt(duration, 10) : 0;
  const strengthMetrics = isStrengthUI
    ? strengthSessionMetrics({ sets: loggedSets, cardio: cardioEntries, bodyWeightKg, durationMins })
    : null;
  const strengthCalories = strengthMetrics?.strength ?? null;
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
    commit(null);
    setCurrentEx(null);
    setRecentSessions([]);
    setCurrentReps('');
    setCurrentWeight('');
    setExSearch('');
    setDistance('');
    setAvgHr('');
    setCalories('');
    setCardioMinutes('');
    setCardioKcal('');
    setCardioLabel('');
    setEditUid(null);
  };

  const logCardio = () => {
    if (!currentEx || !isCardioName(currentEx.name)) return toast.error('Pick Cardio first');
    const minutes = Number(cardioMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return toast.error('Enter minutes');
    const label = cardioLabel.trim();
    if (!label) return toast.error('Enter a cardio type');
    const parsedCalories = cardioKcal.trim() === '' ? null : Number(cardioKcal);
    if (parsedCalories != null && !Number.isFinite(parsedCalories)) return toast.error('Enter calories');
    const current = ensureSession();
    const entry: SessionCardio = {
      id: newId(),
      exercise_id: currentEx.id,
      exercise_name: currentEx.name,
      position: current.cardio.length + 1,
      minutes,
      calories: parsedCalories,
      label,
      plan_exercise_id: null,
    };
    commit(sessionStore.saveCardio(current, entry));
    setCardioMinutes('');
    setCardioKcal('');
    setCardioLabel('');
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 900);
  };

  const removeCardio = (id: string) => {
    if (!sessionRef.current) return;
    commit(sessionStore.deleteCardio(sessionRef.current, id));
  };

  const handleFinish = async () => {
    if (!date) return toast.error('Please set a date');
    if (!user) return toast.error('Sign in required');
    if (isOther && !notes.trim()) return toast.error('Write what you did');
    if (isStrengthUI && loggedSets.length === 0 && cardioEntries.length === 0) return toast.error('Log at least one set');
    if (!isStrengthUI && !isOther && durationMins <= 0) return toast.error('Enter duration');

    if (isStrengthUI) {
      const current = sessionRef.current;
      if (!current) return toast.error('Log at least one set');
      const metrics = strengthSessionMetrics({ sets: current.sets, cardio: current.cardio, bodyWeightKg, durationMins });
      sessionStore.finish(current, {
        duration: durationMins > 0 ? durationMins : null,
        notes: notes || null,
        structuredMetrics: metrics.structuredMetrics,
        numberSet: globalSetNumber,
      });
      const setLabel = current.sets.length > 0 ? ` · ${current.sets.length} sets` : '';
      toast.success(`Workout saved${setLabel}`);
      resetForm();
      onSuccess();
      onClose();
      return;
    }

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
          structured_metrics: {
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
        },
        sets: [],
        cardio: [],
        legacyCardio: !isOther ? {
          distance: distanceKm,
          avg_heart_rate: avgHeartRate,
          calories: cardioCalories,
        } : null,
      });

      toast.success('Workout saved');
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
          <div data-testid="sheet-header" className="flex-shrink-0 flex items-center justify-between gap-2 px-4 pt-2 pb-3" style={{ borderBottom: `2px solid ${INK}` }}>
            <div className="min-w-0">
              <h2 className="text-base font-800 leading-tight tracking-tight">{session ? 'Workout in progress' : 'Active Workout'}</h2>
              {session && (
                <p data-testid="sync-status" className="text-[11px] font-800" style={{ color: sync.pending > 0 ? ACCENT_DEEP : MUTED }}>
                  {loggedSets.length} set{loggedSets.length !== 1 ? 's' : ''}{cardioEntries.length > 0 ? ` · ${cardioEntries.length} cardio` : ''}
                  {sync.pending > 0 ? ` · ${sync.pending} waiting to sync` : ' · saved'}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {session && (
                <button type="button" onClick={discardSession} className="min-h-11 px-2 text-xs font-800" style={{ color: ACCENT_DEEP }}>
                  Discard
                </button>
              )}
              <button onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center" style={{ color: MUTED }} aria-label="Close workout">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">

            {/* Session meta */}
            <div className="px-4 pt-4 pb-3 space-y-3" style={{ borderBottom: `2px solid ${INK}` }}>
              <div className="flex gap-1.5 flex-wrap">
                {TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => changeMeta({ type: t.value })}
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
                      onClick={() => changeMeta({ subType: st.value })}
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
                onChange={e => changeMeta({ date: e.target.value })}
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
                            <li key={entry.id} className="flex min-h-11 items-center gap-2 py-2" style={{ borderTop: `2px solid ${RULE}` }}>
                              <span className="flex-1 text-sm">
                                <span className="font-800">{entry.label}</span>
                                <span style={{ color: MUTED }}> · {entry.minutes} min{entry.calories != null ? ` · ${entry.calories} kcal` : ''}</span>
                              </span>
                              <button type="button" onClick={() => removeCardio(entry.id)} className="min-h-11 min-w-11" style={{ color: ACCENT_DEEP }} aria-label={`Remove ${entry.label}`}>
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
                      <label className="text-[10px] font-800 uppercase tracking-[0.08em] block mb-1" style={{ color: MUTED }}>{timed ? 'Sec' : 'Reps'}</label>
                      <input
                        ref={repsRef}
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label={timed ? 'Seconds' : 'Reps'}
                        placeholder={timed ? '45' : '10'}
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
                        aria-label={weightInputLabel}
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
                          <div key={s.id} style={{ borderTop: i === 0 ? undefined : `2px solid ${RULE}`, background: PANEL }}>
                            {editUid === s.id ? (
                              // Inline edit row
                              <div className="flex items-center gap-2 px-3 py-2">
                                <span className="text-xs font-800 w-5 flex-shrink-0" style={{ color: MUTED }}>S{i + 1}</span>
                                <input
                                  autoFocus
                                  type="number"
                                  inputMode="numeric"
                                  value={editReps}
                                  onChange={e => setEditReps(e.target.value)}
                                  aria-label={s.reps == null && s.duration_sec != null ? 'Edit seconds' : 'Edit reps'}
                                  className="w-14 min-h-11 px-2 py-1 text-sm nums text-center focus:outline-none"
                                  style={inputStyle}
                                  placeholder={s.reps == null && s.duration_sec != null ? 'sec' : 'reps'}
                                />
                                <span className="text-xs font-800" style={{ color: MUTED }}>×</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={editWeight}
                                  onChange={e => setEditWeight(e.target.value)}
                                  aria-label={s.added_weight_kg != null ? 'Edit added weight' : 'Edit weight'}
                                  className="w-16 min-h-11 px-2 py-1 text-sm nums text-center focus:outline-none"
                                  style={inputStyle}
                                  placeholder={s.added_weight_kg != null ? 'BW' : 'kg'}
                                />
                                <button onClick={saveEdit} className="inline-flex min-h-11 min-w-11 items-center justify-center ml-auto" style={{ color: ACCENT_DEEP }} aria-label="Save set">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditUid(null)} className="inline-flex min-h-11 min-w-11 items-center justify-center" style={{ color: MUTED }} aria-label="Cancel edit">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              // Normal row
                              <div className="flex items-center px-3 py-2.5 gap-3">
                                <span className="text-xs font-800 w-5 flex-shrink-0" style={{ color: MUTED }}>S{i + 1}</span>
                                <span className="text-sm flex-1 nums">
                                  {s.reps == null && s.duration_sec != null
                                    ? <><span className="font-800">{s.duration_sec}</span> s</>
                                    : <><span className="font-800">{s.reps}</span> reps</>}
                                  {s.added_weight_kg != null ? (
                                    <> × <span className="font-800">{bodyweightLabel(s.added_weight_kg)}</span></>
                                  ) : (s.weight ?? 0) > 0 && (
                                    <> × <span className="font-800">{s.weight} kg</span>{s.load_mode === 'dumbbell_pair' && <span style={{ color: MUTED }}> ({(s.weight ?? 0) / 2} / DB)</span>}</>
                                  )}
                                </span>
                                <button onClick={() => startEdit(s)} className="inline-flex min-h-11 min-w-11 items-center justify-center" style={{ color: MUTED }} aria-label={`Edit ${s.exercise_name} set ${i + 1}`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => removeSet(s.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center" style={{ color: ACCENT_DEEP }} aria-label={`Delete ${s.exercise_name} set ${i + 1}`}>
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
                    changeNotes(e.target.value);
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
                  onChange={e => changeNotes(e.target.value)}
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
