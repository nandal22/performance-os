import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CheckCircle2,
  Circle,
  Cloud,
  CloudOff,
  Dumbbell,
  ExternalLink,
  Footprints,
  Image as ImageIcon,
  Images,
  Loader2,
  RotateCcw,
  Save,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  cutPhaseTargets,
  getSuggestedPlanDay,
  progressionRules,
  type PlanExercise,
  type PlanMedia,
  type PlanPhase,
  type PlanItem,
  workoutPlan,
} from '@/data/workoutPlan';
import { toISODate } from '@/lib/utils';
import { useWorkoutReliability } from '@/hooks/useWorkoutReliability';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { guidedWorkoutDraftsService } from '@/services/guidedWorkoutDrafts';
import { calcStrengthCalories } from '@/engines/calorieEngine';
import type { Exercise, StrengthSet } from '@/types';

const DRAFT_KEY = 'perf-os-guided-plan-draft';
const PLAN_NAME = 'Final Optimized 5-Day Plan (Squat & Deadlift Separated)';
const MEDIA_SOURCE_URL = 'https://github.com/yuhonas/free-exercise-db';
const MEDIA_MODE_KEY = 'perf-os-workout-media-mode';

type MediaMode = 'image' | 'motion';
type DraftStatus = 'loading' | 'account' | 'local' | 'idle';
type LoadMode = 'total' | 'dumbbell_pair' | 'barbell_plates' | 'bodyweight';

const LOAD_MODE_OPTIONS: Array<{ value: LoadMode; label: string; detail: string }> = [
  { value: 'total', label: 'Total kg', detail: 'Full weight' },
  { value: 'dumbbell_pair', label: 'Dumbbells', detail: 'One DB' },
  { value: 'barbell_plates', label: 'Barbell', detail: 'Side + bar' },
  { value: 'bodyweight', label: 'Bodyweight', detail: 'Added kg' },
];

const LOAD_MODE_HELP: Record<LoadMode, string> = {
  total: 'Enter the full loaded weight once.',
  dumbbell_pair: 'Enter one dumbbell weight. The app counts both dumbbells.',
  barbell_plates: 'Enter plates on one side, then the rod or bar weight.',
  bodyweight: 'Enter added weight only. Bodyweight percent is used for the estimate.',
};

interface SetLog {
  reps: string;
  weight: string;
  done: boolean;
  loadMode?: LoadMode;
  barWeight?: string;
  bodyFactor?: string;
}

interface GuidedProgress {
  day: number;
  date: string;
  phase: PlanPhase;
  warmup: string[];
  stretch: string[];
  recovery: string[];
  sets: Record<string, SetLog[]>;
  notes: string;
  duration: string;
  savedAt: number;
}

interface LoggedSetRow {
  exercise: PlanExercise;
  setIndex: number;
  reps: number;
  weight: number;
  inputWeight: number;
  loadMode: LoadMode;
  barWeight?: number;
  bodyweightFactor?: number;
  bodyweightKg?: number | null;
  loadLabel: string;
}

interface LastPlannedSession {
  date: string;
  sets: Array<{ reps: number; weight: number; set_number: number }>;
}

type PlannedExerciseHistory = Record<string, LastPlannedSession | null>;
type StrengthSetWithActivity = StrengthSet & { activity?: { date?: string } | null };

interface PhaseTab {
  id: PlanPhase;
  label: string;
  total: number;
  done: number;
}

function readMediaMode(): MediaMode {
  return localStorage.getItem(MEDIA_MODE_KEY) === 'motion' ? 'motion' : 'image';
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function firstPhaseForDay(day: number): PlanPhase {
  const planDay = workoutPlan.find(item => item.day === day) ?? workoutPlan[0];
  if (planDay.warmup.length > 0) return 'warmup';
  if (planDay.workout.length > 0) return 'workout';
  if ((planDay.recovery ?? []).length > 0) return 'recovery';
  return 'stretch';
}

function buildProgress(day: number, date: string): GuidedProgress {
  const planDay = workoutPlan.find(item => item.day === day) ?? workoutPlan[0];
  const sets: Record<string, SetLog[]> = {};
  for (const exercise of planDay.workout) {
    sets[exercise.id] = Array.from({ length: exercise.sets }, () => buildSetLog(exercise));
  }

  return {
    day,
    date,
    phase: firstPhaseForDay(day),
    warmup: [],
    stretch: [],
    recovery: [],
    sets,
    notes: '',
    duration: '',
    savedAt: Date.now(),
  };
}

function isPlanPhase(value: unknown): value is PlanPhase {
  return value === 'warmup' || value === 'workout' || value === 'stretch' || value === 'recovery';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isSetLog(value: unknown): value is SetLog {
  if (typeof value !== 'object' || value === null) return false;
  const set = value as Partial<SetLog>;
  return (
    typeof set.reps === 'string' &&
    typeof set.weight === 'string' &&
    typeof set.done === 'boolean' &&
    (set.loadMode === undefined || isLoadMode(set.loadMode)) &&
    (set.barWeight === undefined || typeof set.barWeight === 'string') &&
    (set.bodyFactor === undefined || typeof set.bodyFactor === 'string')
  );
}

function mergeProgress(day: number, date: string, value: unknown): GuidedProgress {
  const base = buildProgress(day, date);
  if (typeof value !== 'object' || value === null) return base;

  const draft = value as Partial<GuidedProgress>;
  const incomingSets = typeof draft.sets === 'object' && draft.sets !== null ? draft.sets : {};
  const sets = { ...base.sets };

  for (const exerciseId of Object.keys(sets)) {
    const incoming = (incomingSets as Record<string, unknown>)[exerciseId];
    if (Array.isArray(incoming)) {
      sets[exerciseId] = sets[exerciseId].map((set, index) => (
        isSetLog(incoming[index]) ? { ...set, ...incoming[index] } : set
      ));
    }
  }

  return {
    ...base,
    phase: isPlanPhase(draft.phase) ? draft.phase : base.phase,
    warmup: stringArray(draft.warmup),
    stretch: stringArray(draft.stretch),
    recovery: stringArray(draft.recovery),
    sets,
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    duration: typeof draft.duration === 'string' ? draft.duration : '',
    savedAt: typeof draft.savedAt === 'number' ? draft.savedAt : Date.now(),
  };
}

function hasProgress(progress: GuidedProgress) {
  return (
    progress.warmup.length > 0 ||
    progress.stretch.length > 0 ||
    progress.recovery.length > 0 ||
    progress.notes.trim().length > 0 ||
    progress.duration.trim().length > 0 ||
    Object.values(progress.sets).some(sets =>
      sets.some(set => set.done || set.reps.trim().length > 0 || set.weight.trim().length > 0),
    )
  );
}

function readProgress(day: number, date: string): GuidedProgress | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsedRaw = JSON.parse(raw) as Partial<GuidedProgress>;
    if (parsedRaw.day !== day || parsedRaw.date !== date) return null;
    const parsed = mergeProgress(day, date, parsedRaw);
    const fresh = Date.now() - parsed.savedAt < 36 * 60 * 60 * 1000;
    if (!fresh) return null;
    return parsed;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

function draftStatusText(status: DraftStatus) {
  if (status === 'loading') return 'Checking saved progress';
  if (status === 'account') return 'Saved to account';
  if (status === 'local') return 'Saved on this device';
  return 'Ready to start';
}

function parsePositive(value: string) {
  return Math.max(0, Number.parseFloat(value) || 0);
}

function isLoadMode(value: unknown): value is LoadMode {
  return value === 'total' || value === 'dumbbell_pair' || value === 'barbell_plates' || value === 'bodyweight';
}

function defaultLoadModeForExercise(exercise: PlanExercise): LoadMode {
  if (exercise.equipment === 'dumbbell') return 'dumbbell_pair';
  if (exercise.equipment === 'barbell') return 'barbell_plates';
  if (exercise.equipment === 'bodyweight') return 'bodyweight';
  return 'total';
}

function buildSetLog(exercise: PlanExercise): SetLog {
  return {
    reps: '',
    weight: '',
    done: false,
    loadMode: defaultLoadModeForExercise(exercise),
    barWeight: exercise.equipment === 'barbell' ? '20' : '',
    bodyFactor: exercise.equipment === 'bodyweight' ? '100' : '',
  };
}

function buildLoad(set: SetLog, bodyWeightKg: number | null) {
  const mode = set.loadMode ?? 'total';
  const inputWeight = parsePositive(set.weight);
  const barWeight = parsePositive(set.barWeight || '20');
  const bodyFactorPercent = parsePositive(set.bodyFactor || '100') || 100;

  if (mode === 'dumbbell_pair') {
    const effectiveWeight = Math.round(inputWeight * 2 * 10) / 10;
    return {
      mode,
      inputWeight,
      effectiveWeight,
      loadLabel: inputWeight > 0 ? `${inputWeight} kg x 2 DB` : 'Dumbbells',
    };
  }

  if (mode === 'barbell_plates') {
    const effectiveWeight = Math.round((inputWeight * 2 + barWeight) * 10) / 10;
    return {
      mode,
      inputWeight,
      barWeight,
      effectiveWeight,
      loadLabel: `${inputWeight} kg/side + ${barWeight} kg bar`,
    };
  }

  if (mode === 'bodyweight') {
    const bodyweightFactor = bodyFactorPercent / 100;
    const bodyweightLoad = bodyWeightKg ? Math.round(bodyWeightKg * bodyweightFactor * 10) / 10 : 0;
    const effectiveWeight = Math.round((bodyweightLoad + inputWeight) * 10) / 10;
    const bodyLabel = bodyWeightKg
      ? `${bodyFactorPercent}% bodyweight (${bodyweightLoad} kg)`
      : `${bodyFactorPercent}% bodyweight`;
    return {
      mode,
      inputWeight,
      bodyweightFactor,
      bodyweightKg: bodyWeightKg,
      effectiveWeight,
      loadLabel: inputWeight > 0 ? `${bodyLabel} + ${inputWeight} kg` : bodyLabel,
    };
  }

  return {
    mode,
    inputWeight,
    effectiveWeight: inputWeight,
    loadLabel: inputWeight > 0 ? `${inputWeight} kg total` : 'Bodyweight / unloaded',
  };
}

function weightInputLabel(mode: LoadMode) {
  if (mode === 'dumbbell_pair') return 'One DB kg';
  if (mode === 'barbell_plates') return 'Plates / side';
  if (mode === 'bodyweight') return 'Added kg';
  return 'Total kg';
}

function planExerciseAliases(exercise: PlanExercise) {
  return [exercise.dbName, exercise.name, ...exercise.aliases].map(normalizeName);
}

function findExistingExercise(exercise: PlanExercise, existing: Exercise[]) {
  const aliases = planExerciseAliases(exercise);
  return existing.find(item => aliases.includes(normalizeName(item.name))) ?? null;
}

function buildLastSessionBefore(rawSets: StrengthSet[], beforeDate: string): LastPlannedSession | null {
  const byDate: Record<string, LastPlannedSession['sets']> = {};

  for (const raw of rawSets as StrengthSetWithActivity[]) {
    const activityDate = raw.activity?.date;
    if (!activityDate || activityDate >= beforeDate) continue;
    if (!byDate[activityDate]) byDate[activityDate] = [];
    byDate[activityDate].push({
      reps: raw.reps ?? 0,
      weight: raw.weight ?? 0,
      set_number: raw.set_number ?? 0,
    });
  }

  const latestDate = Object.keys(byDate).sort().reverse()[0];
  if (!latestDate) return null;

  return {
    date: latestDate,
    sets: byDate[latestDate].sort((a, b) => a.set_number - b.set_number),
  };
}

function formatLastSet(set: LastPlannedSession['sets'][number], exercise: PlanExercise) {
  if (exercise.logUnit === 'seconds') {
    return `${set.reps}s`;
  }

  const load = set.weight > 0 ? `${Math.round(set.weight * 10) / 10}kg` : 'BW';
  return `${set.reps}x${load}`;
}

function lowerRepTarget(repRange: string) {
  const match = repRange.match(/\d+/);
  return match ? match[0] : '';
}

function ChecklistItem({
  item,
  checked,
  onToggle,
  mediaMode,
}: {
  item: PlanItem;
  checked: boolean;
  onToggle: () => void;
  mediaMode: MediaMode;
}) {
  return (
    <motion.div
      layout
      whileTap={{ scale: 0.98 }}
      className={`relative w-full rounded-2xl border p-3.5 text-left transition-colors ${
        checked
          ? 'border-emerald-400/25 bg-emerald-400/10'
          : 'border-white/[0.08] bg-white/[0.035]'
      }`}
    >
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-start gap-3">
          {checked ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-white/25 mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white">{item.name}</p>
              <p className="text-xs text-primary font-semibold whitespace-nowrap">{item.target}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">{item.cue}</p>
          </div>
        </div>
        {item.media && (
          <MediaArtwork media={item.media} alt={`${item.name} demo`} mediaMode={mediaMode} compact />
        )}
      </button>
      {item.media && (
        <a
          href={item.media.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute right-5 bottom-5 rounded-xl bg-black/65 backdrop-blur px-2 py-1 text-[10px] text-white/75 flex items-center gap-1"
          aria-label={`${item.name} media source`}
        >
          <ExternalLink className="w-3 h-3" />
          {item.media.source}
        </a>
      )}
    </motion.div>
  );
}

function LastSessionCard({
  exercise,
  session,
  loading,
}: {
  exercise: PlanExercise;
  session: LastPlannedSession | null | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Last time</p>
        {session && (
          <p className="text-[11px] font-semibold text-primary">
            {format(new Date(`${session.date}T12:00:00`), 'MMM d')}
          </p>
        )}
      </div>
      {loading ? (
        <p className="mt-1 text-xs text-muted-foreground">Checking previous sets...</p>
      ) : session ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {session.sets.map((set, index) => (
            <span
              key={`${session.date}-${set.set_number}-${index}`}
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-white nums"
            >
              S{index + 1}: {formatLastSet(set, exercise)}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No previous logged sets yet.</p>
      )}
    </div>
  );
}

function MediaArtwork({
  media,
  alt,
  mediaMode,
  compact = false,
}: {
  media: PlanMedia;
  alt: string;
  mediaMode: MediaMode;
  compact?: boolean;
}) {
  const frames = mediaMode === 'motion' && media.frames.length > 1 ? media.frames : [media.url];
  const duration = `${Math.max(2, frames.length * 1.15)}s`;

  return (
    <div className={`${compact ? 'mt-3 rounded-xl' : 'rounded-2xl'} relative aspect-[16/9] overflow-hidden bg-black/25 border border-white/[0.08]`}>
      {frames.length > 1 ? (
        <div className="absolute inset-0">
          {frames.map((frame, index) => (
            <img
              key={frame}
              src={frame}
              alt={index === 0 ? alt : ''}
              aria-hidden={index > 0}
              loading="lazy"
              className="motion-media-frame w-full h-full object-contain bg-black/25"
              style={{
                animationDelay: `${index * 1.15}s`,
                animationDuration: duration,
              }}
              onError={event => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ))}
        </div>
      ) : (
        <img
          src={media.url}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-contain bg-black/25"
          onError={event => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
      {frames.length > 1 && (
        <div className="absolute left-2 bottom-2 rounded-xl bg-black/65 backdrop-blur px-2 py-1 text-[10px] text-white/75 flex items-center gap-1">
          <Images className="w-3 h-3" />
          Motion
        </div>
      )}
    </div>
  );
}

function MediaSourceLink({ media, label }: { media: PlanMedia; label: string }) {
  return (
    <a
      href={media.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="absolute right-5 bottom-5 rounded-xl bg-black/65 backdrop-blur px-2 py-1 text-[10px] text-white/75 flex items-center gap-1"
      aria-label={`${label} media source`}
    >
      <ExternalLink className="w-3 h-3" />
      {media.source}
    </a>
  );
}

function MediaPanel({ exercise, mediaMode }: { exercise: PlanExercise; mediaMode: MediaMode }) {
  if (!exercise.media) {
    return (
      <div className="aspect-[16/9] rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
        <Dumbbell className="w-7 h-7 text-white/20" />
      </div>
    );
  }

  return (
    <div className="relative">
      <MediaArtwork media={exercise.media} alt={exercise.name} mediaMode={mediaMode} />
      <MediaSourceLink media={exercise.media} label={exercise.name} />
    </div>
  );
}

export default function WorkoutPlanPage() {
  const suggestedDay = getSuggestedPlanDay();
  const [selectedDay, setSelectedDay] = useState(suggestedDay.day);
  const [date, setDate] = useState(toISODate(new Date()));
  const [progress, setProgress] = useState<GuidedProgress>(() => readProgress(suggestedDay.day, toISODate(new Date())) ?? buildProgress(suggestedDay.day, toISODate(new Date())));
  const [saving, setSaving] = useState(false);
  const [mediaMode, setMediaMode] = useState<MediaMode>(readMediaMode);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('loading');
  const [plannedHistory, setPlannedHistory] = useState<PlannedExerciseHistory>({});
  const [plannedHistoryLoading, setPlannedHistoryLoading] = useState(false);

  const planDay = useMemo(
    () => workoutPlan.find(item => item.day === selectedDay) ?? workoutPlan[0],
    [selectedDay],
  );
  const reliability = useWorkoutReliability(true, `${date}-day-${planDay.day}`);

  useEffect(() => {
    let cancelled = false;
    const localProgress = readProgress(selectedDay, date) ?? buildProgress(selectedDay, date);

    setDraftReady(false);
    setDraftStatus('loading');
    setProgress(localProgress);

    guidedWorkoutDraftsService.get<GuidedProgress>(date, selectedDay)
      .then(remote => {
        if (cancelled) return;
        if (remote) {
          setProgress(mergeProgress(selectedDay, date, remote.progress));
          setDraftStatus('account');
          return;
        }
        setDraftStatus(hasProgress(localProgress) ? 'local' : 'idle');
      })
      .catch(() => {
        if (!cancelled) setDraftStatus(hasProgress(localProgress) ? 'local' : 'idle');
      })
      .finally(() => {
        if (!cancelled) setDraftReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDay, date]);

  useEffect(() => {
    if (!draftReady) return undefined;

    const nextProgress = { ...progress, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(nextProgress));

    if (!hasProgress(nextProgress)) {
      setDraftStatus('idle');
      return undefined;
    }

    setDraftStatus(guidedWorkoutDraftsService.getStorageMode() === 'database' ? 'account' : 'local');
    const timeout = window.setTimeout(() => {
      void guidedWorkoutDraftsService.upsert(date, selectedDay, nextProgress)
        .then(saved => setDraftStatus(saved ? 'account' : 'local'));
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [date, draftReady, progress, selectedDay]);

  useEffect(() => {
    localStorage.setItem(MEDIA_MODE_KEY, mediaMode);
  }, [mediaMode]);

  useEffect(() => {
    bodyMetricsService.getLatestProfile()
      .then(profile => setBodyWeightKg(profile.weight))
      .catch(() => setBodyWeightKg(null));
  }, []);

  useEffect(() => {
    if (planDay.workout.length === 0) {
      setPlannedHistory({});
      setPlannedHistoryLoading(false);
      return undefined;
    }

    let cancelled = false;
    setPlannedHistory({});
    setPlannedHistoryLoading(true);

    exercisesService.getAll()
      .then(async existing => {
        const entries = await Promise.all(planDay.workout.map(async exercise => {
          const matched = findExistingExercise(exercise, existing);
          if (!matched) return [exercise.id, null] as const;
          const rawSets = await strengthSetsService.getByExercise(matched.id, 120);
          return [exercise.id, buildLastSessionBefore(rawSets, date)] as const;
        }));

        if (!cancelled) {
          setPlannedHistory(Object.fromEntries(entries));
        }
      })
      .catch(() => {
        if (!cancelled) setPlannedHistory({});
      })
      .finally(() => {
        if (!cancelled) setPlannedHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, planDay.workout]);

  const loggedRows = useMemo<LoggedSetRow[]>(() => {
    return planDay.workout.flatMap(exercise =>
      (progress.sets[exercise.id] ?? [])
        .flatMap((set, setIndex) => {
          const reps = parsePositive(set.reps);
          if (!set.done || reps <= 0) return [];
          const load = buildLoad(set, bodyWeightKg);
          return [{
            exercise,
            setIndex,
            reps,
            weight: load.effectiveWeight,
            inputWeight: load.inputWeight,
            loadMode: load.mode,
            barWeight: load.barWeight,
            bodyweightFactor: load.bodyweightFactor,
            bodyweightKg: load.bodyweightKg,
            loadLabel: load.loadLabel,
          }];
        }),
    );
  }, [bodyWeightKg, planDay.workout, progress.sets]);
  const strengthCalories = bodyWeightKg && loggedRows.length > 0
    ? calcStrengthCalories({
        sets: loggedRows.map(row => ({ reps: row.reps, weight: row.weight })),
        duration: progress.duration ? Number.parseInt(progress.duration, 10) : undefined,
      }, bodyWeightKg)
    : null;

  const totalSets = planDay.workout.reduce((sum, exercise) => sum + exercise.sets, 0);
  const completedSets = loggedRows.length;
  const recoveryItems = planDay.recovery ?? [];
  const completedItems = progress.warmup.length + completedSets + progress.stretch.length + progress.recovery.length;
  const totalItems = planDay.warmup.length + totalSets + planDay.stretch.length + recoveryItems.length;
  const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const DraftIcon = draftStatus === 'local' ? CloudOff : Cloud;

  const phaseTabs = useMemo<PhaseTab[]>(() => {
    return [
      { id: 'warmup' as const, label: 'Warm-up', total: planDay.warmup.length, done: progress.warmup.length },
      { id: 'workout' as const, label: 'Workout', total: totalSets, done: completedSets },
      { id: 'stretch' as const, label: 'Stretch', total: planDay.stretch.length, done: progress.stretch.length },
      { id: 'recovery' as const, label: 'Recovery', total: recoveryItems.length, done: progress.recovery.length },
    ].filter(tab => tab.total > 0);
  }, [completedSets, planDay.stretch.length, planDay.warmup.length, progress.recovery.length, progress.stretch.length, progress.warmup.length, recoveryItems.length, totalSets]);

  useEffect(() => {
    const valid = phaseTabs.some(tab => tab.id === progress.phase);
    if (!valid) {
      setProgress(prev => ({ ...prev, phase: firstPhaseForDay(planDay.day) }));
    }
  }, [phaseTabs, planDay.day, progress.phase]);

  const toggleListItem = (field: 'warmup' | 'stretch' | 'recovery', id: string) => {
    setProgress(prev => {
      const exists = prev[field].includes(id);
      return {
        ...prev,
        [field]: exists ? prev[field].filter(item => item !== id) : [...prev[field], id],
      };
    });
  };

  const updateSet = (exerciseId: string, index: number, patch: Partial<SetLog>) => {
    setProgress(prev => ({
      ...prev,
      sets: {
        ...prev.sets,
        [exerciseId]: (prev.sets[exerciseId] ?? []).map((set, setIndex) =>
          setIndex === index ? { ...set, ...patch } : set,
        ),
      },
    }));
  };

  const updateExerciseLoadSettings = (exerciseId: string, patch: Partial<Pick<SetLog, 'loadMode' | 'barWeight' | 'bodyFactor'>>) => {
    setProgress(prev => ({
      ...prev,
      sets: {
        ...prev.sets,
        [exerciseId]: (prev.sets[exerciseId] ?? []).map(set => ({ ...set, ...patch, done: false })),
      },
    }));
  };

  const toggleSetDone = (exercise: PlanExercise, index: number) => {
    const current = progress.sets[exercise.id]?.[index];
    if (!current) return;
    if (!current.done && parsePositive(current.reps) <= 0) {
      toast.error(`Enter ${exercise.logUnit === 'seconds' ? 'seconds' : 'reps'} first`);
      return;
    }
    updateSet(exercise.id, index, { done: !current.done });
  };

  const fillTarget = (exercise: PlanExercise, index: number) => {
    const target = lowerRepTarget(exercise.repRange);
    if (!target) return;
    updateSet(exercise.id, index, { reps: target });
  };

  const resetDay = () => {
    localStorage.removeItem(DRAFT_KEY);
    void guidedWorkoutDraftsService.remove(date, planDay.day).then(saved => {
      setDraftStatus(saved ? 'idle' : 'local');
    });
    setProgress(buildProgress(planDay.day, date));
  };

  const findOrCreateExercise = async (exercise: PlanExercise, existing: Exercise[]) => {
    const aliases = [exercise.dbName, exercise.name, ...exercise.aliases].map(normalizeName);
    const match = existing.find(item => aliases.includes(normalizeName(item.name)));
    if (match) return { exercise: match, existing };

    const created = await exercisesService.createCustom({
      name: exercise.dbName,
      category: exercise.category,
      primary_muscle: exercise.primaryMuscle,
      secondary_muscles: exercise.secondaryMuscles,
      equipment: exercise.equipment,
    });
    return { exercise: created, existing: [...existing, created] };
  };

  const saveSession = async () => {
    if (planDay.workout.length > 0 && loggedRows.length === 0) {
      toast.error('Log at least one working set');
      return;
    }
    if (planDay.workout.length === 0 && progress.recovery.length === 0) {
      toast.error('Complete at least one recovery item');
      return;
    }

    setSaving(true);
    try {
      const activity = await activitiesService.create({
        date,
        type: planDay.workout.length > 0 ? 'strength' : 'mobility',
        duration: progress.duration ? Number.parseInt(progress.duration, 10) : undefined,
        notes: progress.notes.trim() || `${planDay.title} guided session`,
        tags: ['cut-phase', 'guided-plan', `day-${planDay.day}`],
        structured_metrics: {
          guided_plan: true,
          plan: {
            name: PLAN_NAME,
            day: planDay.day,
            title: planDay.title,
            focus: planDay.focus,
          },
          completed: {
            warmup: progress.warmup,
            stretch: progress.stretch,
            recovery: progress.recovery,
            strengthSets: loggedRows.map(row => ({
              exerciseId: row.exercise.id,
              exerciseName: row.exercise.name,
              set: row.setIndex + 1,
              reps: row.reps,
              weight: row.weight,
              mode: row.loadMode,
              inputWeight: row.inputWeight,
              barWeight: row.barWeight,
              bodyweightFactor: row.bodyweightFactor,
              bodyweightKg: row.bodyweightKg,
              label: row.loadLabel,
              unit: row.exercise.logUnit ?? 'reps',
            })),
          },
          strengthLoad: {
            bodyWeightKg,
            sets: loggedRows.map((row, index) => ({
              set: index + 1,
              exerciseSet: row.setIndex + 1,
              exerciseId: row.exercise.id,
              exerciseName: row.exercise.name,
              reps: row.reps,
              effectiveWeight: row.weight,
              mode: row.loadMode,
              inputWeight: row.inputWeight,
              barWeight: row.barWeight,
              bodyweightFactor: row.bodyweightFactor,
              bodyweightKg: row.bodyweightKg,
              label: row.loadLabel,
            })),
          },
          calorieEstimate: strengthCalories ? {
            calories: strengthCalories.calories,
            met: strengthCalories.met,
            method: strengthCalories.method,
            durationHours: strengthCalories.duration_hrs,
            totalVolumeKg: strengthCalories.total_volume_kg ?? 0,
            bodyWeightKg,
          } : null,
          targets: {
            calories: `${cutPhaseTargets.caloriesMin}-${cutPhaseTargets.caloriesMax}`,
            protein: cutPhaseTargets.protein,
            steps: cutPhaseTargets.steps,
            sleep: cutPhaseTargets.sleep,
          },
          progressionRules,
          mediaSource: {
            name: 'Free Exercise DB',
            url: MEDIA_SOURCE_URL,
          },
        },
      });

      if (loggedRows.length > 0) {
        let existing = await exercisesService.getAll();
        const exerciseIds = new Map<string, string>();

        for (const row of loggedRows) {
          if (exerciseIds.has(row.exercise.id)) continue;
          const result = await findOrCreateExercise(row.exercise, existing);
          existing = result.existing;
          exerciseIds.set(row.exercise.id, result.exercise.id);
        }

        await strengthSetsService.createMany(
          loggedRows.map((row, index) => ({
            activity_id: activity.id,
            exercise_id: exerciseIds.get(row.exercise.id) ?? '',
            set_number: index + 1,
            reps: Math.round(row.reps),
            weight: row.weight > 0 ? row.weight : undefined,
          })),
        );
      }

      localStorage.removeItem(DRAFT_KEY);
      await guidedWorkoutDraftsService.remove(date, planDay.day).catch(() => false);
      setProgress(buildProgress(planDay.day, date));
      setDraftStatus('idle');
      toast.success(`${planDay.title} saved`);
    } catch {
      toast.error('Failed to save guided workout');
    } finally {
      setSaving(false);
    }
  };

  const currentPhase = progress.phase;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Cut phase plan</p>
            <h1 className="text-xl font-bold text-white tracking-tight">Workout Guide</h1>
          </div>
          <button
            onClick={saveSession}
            disabled={saving}
            className="h-10 px-3 rounded-xl bg-primary text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {workoutPlan.map(day => {
            const active = day.day === selectedDay;
            return (
              <button
                key={day.day}
                onClick={() => setSelectedDay(day.day)}
                className={`flex-shrink-0 min-w-[74px] rounded-2xl px-3 py-2 border transition-colors ${
                  active ? 'border-primary/45 bg-primary/15 text-white' : 'border-white/[0.08] bg-white/[0.035] text-muted-foreground'
                }`}
              >
                <p className="text-[10px] font-semibold">Day {day.day}</p>
                <p className="text-xs font-bold mt-0.5">{day.shortLabel}</p>
              </button>
            );
          })}
        </div>

        <section className={`rounded-2xl border border-white/[0.08] bg-gradient-to-br ${planDay.accent} p-4 overflow-hidden`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                <Timer className="w-3.5 h-3.5" />
                <span>{planDay.duration}</span>
                <span>·</span>
                <span>{format(new Date(date + 'T12:00:00'), 'EEE, MMM d')}</span>
              </div>
              <h2 className="text-2xl font-bold text-white leading-tight">{planDay.title}</h2>
              <p className="text-sm text-white/65 mt-1 leading-relaxed">{planDay.focus}</p>
            </div>
            <div className="w-16 h-16 rounded-3xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center flex-shrink-0">
              {planDay.workout.length > 0 ? <Dumbbell className="w-7 h-7 text-white/75" /> : <Footprints className="w-7 h-7 text-white/75" />}
            </div>
          </div>

          <div className="mt-4 h-2.5 rounded-full bg-white/[0.09] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPct}%` }}
              className="h-full bg-primary"
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
            <span>{completedItems}/{totalItems || 1} complete</span>
            <span>{completionPct}%</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
          />
          <input
            type="number"
            inputMode="numeric"
            placeholder="Duration min"
            value={progress.duration}
            onChange={event => setProgress(prev => ({ ...prev, duration: event.target.value }))}
            className="bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.035] border border-white/[0.07]">
            {([
              { id: 'image' as const, label: 'Image', icon: ImageIcon },
              { id: 'motion' as const, label: 'Motion', icon: Images },
            ]).map(option => {
              const active = mediaMode === option.id;
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => setMediaMode(option.id)}
                  className="relative flex-1 rounded-xl py-2 text-[11px] font-semibold"
                >
                  {active && (
                    <motion.div
                      layoutId="media-mode"
                      className="absolute inset-0 rounded-xl bg-primary"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className={`relative z-10 flex items-center justify-center gap-1.5 ${active ? 'text-white' : 'text-muted-foreground'}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="min-w-[108px] rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 flex items-center justify-center gap-2">
            {reliability.online ? <Wifi className="w-4 h-4 text-emerald-300" /> : <WifiOff className="w-4 h-4 text-orange-300" />}
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Workout</p>
              <p className="text-xs font-semibold text-white mt-0.5">
                {reliability.otherTabs > 0 ? `${reliability.otherTabs + 1} tabs` : reliability.wakeLock === 'active' ? 'Awake' : 'Ready'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <DraftIcon className={`w-4 h-4 flex-shrink-0 ${
              draftStatus === 'account' ? 'text-emerald-300' : draftStatus === 'local' ? 'text-orange-300' : 'text-white/35'
            }`} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">Guided progress</p>
              <p className="text-[11px] text-muted-foreground truncate">{draftStatusText(draftStatus)}</p>
            </div>
          </div>
          {hasProgress(progress) && (
            <span className="rounded-xl bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary nums">
              {completionPct}%
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Calories</p>
            <p className="text-lg font-bold text-white nums mt-1">{cutPhaseTargets.caloriesMin}-{cutPhaseTargets.caloriesMax}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Protein</p>
            <p className="text-lg font-bold text-white nums mt-1">{cutPhaseTargets.protein}g</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Steps</p>
            <p className="text-lg font-bold text-white nums mt-1">{cutPhaseTargets.steps}</p>
          </div>
        </div>

        {completedSets > 0 && (
          <section className="rounded-2xl bg-orange-400/10 border border-orange-400/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-orange-200">Burn estimate</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Uses latest body weight, duration, reps, and logged load.
                </p>
              </div>
              <p className="text-lg font-bold text-white nums">
                {strengthCalories ? `${strengthCalories.calories} kcal` : '-- kcal'}
              </p>
            </div>
            {!bodyWeightKg && (
              <p className="text-[11px] text-orange-200 mt-2">Add body weight in metrics to calculate this.</p>
            )}
          </section>
        )}

        <div className="flex gap-2 p-1 rounded-2xl bg-white/[0.035] border border-white/[0.07]">
          {phaseTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setProgress(prev => ({ ...prev, phase: tab.id }))}
              className="flex-1 min-w-0 rounded-xl py-2 relative text-[11px] font-semibold"
            >
              {currentPhase === tab.id && (
                <motion.div
                  layoutId="plan-phase"
                  className="absolute inset-0 rounded-xl bg-primary"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className={`relative z-10 ${currentPhase === tab.id ? 'text-white' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
              <span className={`relative z-10 ml-1 ${currentPhase === tab.id ? 'text-white/75' : 'text-white/25'}`}>
                {tab.done}/{tab.total}
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {currentPhase === 'warmup' && (
            <motion.section
              key="warmup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {planDay.warmup.map(item => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  checked={progress.warmup.includes(item.id)}
                  onToggle={() => toggleListItem('warmup', item.id)}
                  mediaMode={mediaMode}
                />
              ))}
            </motion.section>
          )}

          {currentPhase === 'workout' && (
            <motion.section
              key="workout"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {planDay.workout.map(exercise => {
                const exerciseSets = progress.sets[exercise.id] ?? [];
                const exerciseLoadMode = exerciseSets[0]?.loadMode ?? defaultLoadModeForExercise(exercise);
                const activeLoadMode = LOAD_MODE_OPTIONS.find(option => option.value === exerciseLoadMode) ?? LOAD_MODE_OPTIONS[0];
                const barWeight = exerciseSets[0]?.barWeight || '20';
                const bodyFactor = exerciseSets[0]?.bodyFactor || '100';
                const hasHistory = Object.prototype.hasOwnProperty.call(plannedHistory, exercise.id);
                const lastSession = plannedHistory[exercise.id];
                return (
                <div key={exercise.id} className="rounded-2xl glass p-3.5 space-y-3">
                  <MediaPanel exercise={exercise} mediaMode={mediaMode} />

                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-white">{exercise.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{exercise.primaryMuscle} · {exercise.equipment}</p>
                      </div>
                      <span className="rounded-xl bg-primary/10 border border-primary/25 px-2.5 py-1 text-xs font-bold text-primary whitespace-nowrap">
                        {exercise.target}
                      </span>
                    </div>
                    <p className="text-xs text-white/58 leading-relaxed mt-2">{exercise.cue}</p>
                  </div>

                  <LastSessionCard
                    exercise={exercise}
                    session={lastSession}
                    loading={plannedHistoryLoading && !hasHistory}
                  />

                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.07] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Weight entry</p>
                        <p className="mt-0.5 text-sm font-semibold text-white">Choose how to log this exercise</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
                        {activeLoadMode.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {LOAD_MODE_OPTIONS.map(option => {
                        const selected = exerciseLoadMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => updateExerciseLoadSettings(exercise.id, { loadMode: option.value })}
                            className={`min-h-[58px] rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.98] ${
                              selected
                                ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                                : 'border-white/10 bg-white/[0.06] text-white hover:border-white/20'
                            }`}
                          >
                            <span className="block text-sm font-bold leading-tight">{option.label}</span>
                            <span className={`mt-1 block text-[11px] leading-tight ${selected ? 'text-primary-foreground/80' : 'text-white/55'}`}>
                              {option.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-xs leading-snug text-white/70">{LOAD_MODE_HELP[exerciseLoadMode]}</p>

                    {exerciseLoadMode === 'barbell_plates' && (
                      <div className="mt-3">
                        <label className="block text-[10px] text-muted-foreground mb-1">Rod / bar weight (kg)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={barWeight}
                          onChange={event => updateExerciseLoadSettings(exercise.id, { barWeight: event.target.value })}
                          className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    )}

                    {exerciseLoadMode === 'bodyweight' && (
                      <div className="mt-3">
                        <label className="block text-[10px] text-muted-foreground mb-1">Bodyweight used (%)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={bodyFactor}
                          onChange={event => updateExerciseLoadSettings(exercise.id, { bodyFactor: event.target.value })}
                          className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {exerciseSets.map((set, index) => {
                      const done = set.done;
                      const repsLabel = exercise.logUnit === 'seconds' ? 'Sec' : 'Reps';
                      const load = buildLoad(set, bodyWeightKg);
                      return (
                        <div
                          key={`${exercise.id}-${index}`}
                          className={`rounded-xl border p-2.5 ${
                            done ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-white/[0.07] bg-white/[0.025]'
                          }`}
                        >
                          <div className="grid grid-cols-[34px_minmax(0,1fr)_38px] gap-2 items-end">
                            <span className="pb-2 text-xs text-muted-foreground text-center font-semibold">S{index + 1}</span>
                            <div className="grid grid-cols-2 gap-2 min-w-0">
                              <div className="min-w-0">
                                <label className="block truncate text-[10px] text-muted-foreground mb-1">{repsLabel}</label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={set.reps}
                                  onFocus={() => {
                                    if (!set.reps) fillTarget(exercise, index);
                                  }}
                                  onChange={event => updateSet(exercise.id, index, { reps: event.target.value, done: false })}
                                  className="h-11 w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-2 text-base font-semibold text-white text-center focus:outline-none focus:border-primary/50"
                                />
                              </div>
                              <div className="min-w-0">
                                <label className="block truncate text-[10px] text-muted-foreground mb-1">{weightInputLabel(exerciseLoadMode)}</label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={set.weight}
                                  onChange={event => updateSet(exercise.id, index, { weight: event.target.value, done: false })}
                                  className="h-11 w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-2 text-base font-semibold text-white text-center focus:outline-none focus:border-primary/50"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => toggleSetDone(exercise, index)}
                              className={`mb-0.5 w-9 h-9 rounded-xl flex items-center justify-center ${
                                done ? 'bg-emerald-400 text-black' : 'bg-white/[0.06] text-white/30'
                              }`}
                              aria-label={`${done ? 'Unmark' : 'Mark'} ${exercise.name} set ${index + 1}`}
                            >
                              {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="mt-2 ml-[42px] mr-[46px] rounded-lg bg-white/[0.04] px-2 py-1 text-center text-[11px] font-medium text-white/60">
                            {load.loadLabel}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </motion.section>
          )}

          {currentPhase === 'stretch' && (
            <motion.section
              key="stretch"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {planDay.stretch.map(item => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  checked={progress.stretch.includes(item.id)}
                  onToggle={() => toggleListItem('stretch', item.id)}
                  mediaMode={mediaMode}
                />
              ))}
            </motion.section>
          )}

          {currentPhase === 'recovery' && (
            <motion.section
              key="recovery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {recoveryItems.map(item => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  checked={progress.recovery.includes(item.id)}
                  onToggle={() => toggleListItem('recovery', item.id)}
                  mediaMode={mediaMode}
                />
              ))}
            </motion.section>
          )}
        </AnimatePresence>

        <section className="rounded-2xl glass p-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Progression</p>
            <div className="space-y-1.5">
              {progressionRules.map(rule => (
                <div key={rule} className="flex gap-2 text-xs text-white/65 leading-relaxed">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>
          <a
            href={MEDIA_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-primary"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Exercise media from Free Exercise DB
          </a>
        </section>

        <textarea
          value={progress.notes}
          onChange={event => setProgress(prev => ({ ...prev, notes: event.target.value }))}
          placeholder="Session notes"
          rows={3}
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-2xl px-3 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-primary/50"
        />

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            onClick={saveSession}
            disabled={saving}
            className="h-12 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save guided session
          </button>
          <button
            onClick={resetDay}
            className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white/45 flex items-center justify-center"
            aria-label="Reset day"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
