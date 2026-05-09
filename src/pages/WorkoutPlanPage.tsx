import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  CheckCircle2,
  Circle,
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
import type { Exercise } from '@/types';

const DRAFT_KEY = 'perf-os-guided-plan-draft';
const PLAN_NAME = '5-Day Strength Workout Plan (Cut Phase)';
const MEDIA_SOURCE_URL = 'https://github.com/yuhonas/free-exercise-db';
const MEDIA_MODE_KEY = 'perf-os-workout-media-mode';

type MediaMode = 'image' | 'motion';

interface SetLog {
  reps: string;
  weight: string;
  done: boolean;
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
}

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
    sets[exercise.id] = Array.from({ length: exercise.sets }, () => ({ reps: '', weight: '', done: false }));
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

function readProgress(day: number, date: string): GuidedProgress | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuidedProgress;
    const fresh = Date.now() - parsed.savedAt < 36 * 60 * 60 * 1000;
    if (!fresh || parsed.day !== day || parsed.date !== date) return null;
    return parsed;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

function parsePositive(value: string) {
  return Math.max(0, Number.parseFloat(value) || 0);
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

  const planDay = useMemo(
    () => workoutPlan.find(item => item.day === selectedDay) ?? workoutPlan[0],
    [selectedDay],
  );
  const reliability = useWorkoutReliability(true, `${date}-day-${planDay.day}`);

  useEffect(() => {
    setProgress(readProgress(selectedDay, date) ?? buildProgress(selectedDay, date));
  }, [selectedDay, date]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...progress, savedAt: Date.now() }));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(MEDIA_MODE_KEY, mediaMode);
  }, [mediaMode]);

  const loggedRows = useMemo<LoggedSetRow[]>(() => {
    return planDay.workout.flatMap(exercise =>
      (progress.sets[exercise.id] ?? [])
        .flatMap((set, setIndex) => {
          const reps = parsePositive(set.reps);
          if (!set.done || reps <= 0) return [];
          return [{ exercise, setIndex, reps, weight: parsePositive(set.weight) }];
        }),
    );
  }, [planDay.workout, progress.sets]);

  const totalSets = planDay.workout.reduce((sum, exercise) => sum + exercise.sets, 0);
  const completedSets = loggedRows.length;
  const recoveryItems = planDay.recovery ?? [];
  const completedItems = progress.warmup.length + completedSets + progress.stretch.length + progress.recovery.length;
  const totalItems = planDay.warmup.length + totalSets + planDay.stretch.length + recoveryItems.length;
  const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

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
              unit: row.exercise.logUnit ?? 'reps',
            })),
          },
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
      setProgress(buildProgress(planDay.day, date));
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
              {planDay.workout.map(exercise => (
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

                  <div className="space-y-2">
                    {(progress.sets[exercise.id] ?? []).map((set, index) => {
                      const done = set.done;
                      const repsLabel = exercise.logUnit === 'seconds' ? 'Sec' : 'Reps';
                      return (
                        <div
                          key={`${exercise.id}-${index}`}
                          className={`grid grid-cols-[38px_minmax(0,1fr)_minmax(0,1fr)_38px] gap-2 items-center rounded-xl border p-2 ${
                            done ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-white/[0.07] bg-white/[0.025]'
                          }`}
                        >
                          <span className="text-xs text-muted-foreground text-center font-semibold">S{index + 1}</span>
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-1">{repsLabel}</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={set.reps}
                              onFocus={() => {
                                if (!set.reps) fillTarget(exercise, index);
                              }}
                              onChange={event => updateSet(exercise.id, index, { reps: event.target.value, done: false })}
                              className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-1">Kg</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={set.weight}
                              onChange={event => updateSet(exercise.id, index, { weight: event.target.value, done: false })}
                              className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          <button
                            onClick={() => toggleSetDone(exercise, index)}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              done ? 'bg-emerald-400 text-black' : 'bg-white/[0.06] text-white/30'
                            }`}
                            aria-label={`${done ? 'Unmark' : 'Mark'} ${exercise.name} set ${index + 1}`}
                          >
                            {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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
