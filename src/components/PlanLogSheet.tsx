import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  addedLoadOf, bodyweightLabel, cardioTargetCalories, cardioTargetLabel, estimatePlanCalories, isTimedTarget, loggedWeightFor,
  perDumbbell, prefillFromTarget, repsLabel, targetWeightLabel,
} from '@/lib/planMath';
import { strengthSessionMetrics } from '@/lib/sessionMetrics';
import { clearSession, newId, planActivityId, wasEnded, type SessionSet, type WorkoutSession } from '@/lib/workoutSession';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { exercisesService } from '@/services/exercises';
import { plansService, type LoadType, type Measure, type PlanExercise, type PlanSet, type WorkoutPlan } from '@/services/plans';
import { sessionsService, sessionStore } from '@/services/sessions';
import { toast } from 'sonner';

const GuidanceSheet = lazy(() => import('@/components/GuidanceSheet'));

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const PANEL = '#eae9e9';
const ACCENT = '#ec3013';
const ACCENT_TINT = '#ffe0d9';
const ACCENT_DEEP = '#ae1800';
const MUTED = 'rgba(32,30,29,0.55)';
const RULE = 'rgba(32,30,29,0.15)';

const inputStyle = { border: `2px solid ${INK}`, background: GROUND, color: INK };

interface Draft {
  reps: string;
  /** Total kg, the pair for per-dumbbell moves, or the ADDED kg for bodyweight moves ('' = BW). */
  weight: string;
  rpe: string;
  seconds: string;
}

interface CardioDraft {
  label: string;
  minutes: string;
  kcal: string;
}

interface Row {
  key: string;
  exerciseId: string;
  exerciseName: string;
  planSetId: string | null;
  setNumber: number;
  setType: PlanSet['set_type'] | 'extra';
  targetLabel: string;
  restSeconds: number | null;
  rirLabel: string;
  loadType: LoadType;
  timed: boolean;
  prefill: Draft;
  logged: SessionSet | undefined;
}

interface Group {
  exerciseId: string;
  name: string;
  loadType: LoadType;
  measure: Measure;
  rows: Row[];
}

function draftFromSet(set: SessionSet, loadType: LoadType, bodyWeightKg: number | null): Draft {
  let weight = set.weight == null ? '' : String(set.weight);
  if (loadType === 'bodyweight') {
    // Sets logged before the split carry only the total; read the added part off today's body weight.
    const added = addedLoadOf({ ...set, bodyweight_kg: set.bodyweight_kg ?? (set.added_weight_kg == null ? bodyWeightKg : null) });
    weight = added != null && added >= 0.05 ? String(added) : added == null ? weight : '';
  }
  return {
    reps: set.reps == null ? '' : String(set.reps),
    weight,
    rpe: set.rpe == null ? '' : String(set.rpe),
    seconds: set.duration_sec == null ? '' : String(set.duration_sec),
  };
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

// A second tap this soon after the first is a double tap, not an undo.
const DOUBLE_TAP_MS = 450;

function sameDraft(a: Draft, b: Draft) {
  return a.reps === b.reps && a.weight === b.weight && a.rpe === b.rpe && a.seconds === b.seconds;
}

function cardioSkipKey(planExerciseId: string) {
  return `cardio:${planExerciseId}`;
}

function SyncLine({ activityId, loggedCount }: { activityId: string; loggedCount: number }) {
  const sync = useSyncStatus(activityId);
  return (
    <p data-testid="sync-status" className="text-[11px] font-800" style={{ color: sync.pending > 0 ? ACCENT_DEEP : MUTED }}>
      {sync.pending > 0
        ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync${typeof navigator !== 'undefined' && navigator.onLine === false ? ' · offline' : ''}`
        : `${loggedCount} logged · saved`}
    </p>
  );
}

function buildGroups(plan: WorkoutPlan, session: WorkoutSession | null): Group[] {
  const groups = new Map<string, Group>();
  const group = (exerciseId: string, name: string, loadType: LoadType, measure: Measure) => {
    if (!groups.has(exerciseId)) groups.set(exerciseId, { exerciseId, name, loadType, measure, rows: [] });
    return groups.get(exerciseId) as Group;
  };
  const sets = session?.sets ?? [];
  for (const exercise of plan.exercises.filter(item => !item.is_cardio)) {
    const measure = exercise.measure ?? 'reps';
    const target = group(exercise.exercise_id, exercise.exercise_name, exercise.load_type, measure);
    for (const set of exercise.sets) {
      target.rows.push({
        key: set.id,
        exerciseId: exercise.exercise_id,
        exerciseName: exercise.exercise_name,
        planSetId: set.id,
        setNumber: set.set_number,
        setType: set.set_type,
        targetLabel: [repsLabel(set, measure), targetWeightLabel(set.target_weight_kg, exercise.load_type)].filter(Boolean).join(' · '),
        restSeconds: set.rest_seconds,
        rirLabel: set.target_rir_max == null ? '' : `RIR ${set.target_rir_min ?? set.target_rir_max}–${set.target_rir_max}`,
        loadType: exercise.load_type,
        timed: isTimedTarget(set, measure),
        prefill: prefillFromTarget(set, exercise.load_type, measure),
        logged: sets.find(item => item.plan_set_id === set.id),
      });
    }
  }
  const extras = [
    ...(session?.extras ?? []),
    ...sets
      .filter(set => set.plan_set_id == null && !(session?.extras ?? []).some(extra => extra.id === set.id))
      .map(set => ({ id: set.id, exercise_id: set.exercise_id, exercise_name: set.exercise_name })),
  ];
  for (const extra of extras) {
    const known = groups.get(extra.exercise_id);
    const target = group(extra.exercise_id, extra.exercise_name, known?.loadType ?? 'total', known?.measure ?? 'reps');
    target.rows.push({
      key: extra.id,
      exerciseId: extra.exercise_id,
      exerciseName: extra.exercise_name,
      planSetId: null,
      setNumber: target.rows.length + 1,
      setType: 'extra',
      targetLabel: 'Extra set',
      restSeconds: null,
      rirLabel: '',
      loadType: target.loadType,
      timed: target.measure === 'time',
      prefill: { reps: '', weight: '', rpe: '', seconds: '' },
      logged: sets.find(set => set.id === extra.id),
    });
  }
  return [...groups.values()];
}

export default function PlanLogSheet({
  plan,
  onClose,
  onSaved,
  autoStart = false,
  bodyWeightKg: knownBodyWeightKg,
}: {
  plan: WorkoutPlan;
  onClose: () => void;
  onSaved: () => void;
  autoStart?: boolean;
  bodyWeightKg?: number | null;
}) {
  const closed = plan.status === 'done' || plan.status === 'skipped' || wasEnded(planActivityId(plan));
  const [session, setSession] = useState<WorkoutSession | null>(() => (closed ? null : sessionStore.read(plan.id)));
  const sessionRef = useRef(session);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [cardioDrafts, setCardioDrafts] = useState<Record<string, CardioDraft>>({});
  const [fetchedBodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const bodyWeightKg = knownBodyWeightKg ?? fetchedBodyWeightKg;
  const [guidanceFor, setGuidanceFor] = useState<{ id: string; name: string } | null>(null);
  const [guidance, setGuidance] = useState<Awaited<ReturnType<typeof plansService.guidance>>>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [exerciseChoices, setExerciseChoices] = useState<{ id: string; name: string }[]>([]);
  // A finished plan never opens the logger, even if this phone still has a copy or the list still says in progress.
  const readOnly = closed;
  // A planned workout opened without Start: read it, write nothing until Start is tapped.
  const [starting, setStarting] = useState(!closed && (autoStart || plan.status === 'in_progress'));
  const viewOnly = closed || (!session && !starting);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);

  const lastTap = useRef<Record<string, number>>({});
  const isDoubleTap = (key: string) => {
    const now = Date.now();
    const previous = lastTap.current[key] ?? -Infinity;
    lastTap.current[key] = now;
    return now - previous < DOUBLE_TAP_MS;
  };

  const commit = (next: WorkoutSession | null) => {
    sessionRef.current = next;
    setSession(next);
  };

  const ensureSession = () => {
    if (plan.status === 'done' || plan.status === 'skipped' || wasEnded(planActivityId(plan))) return null;
    if (sessionRef.current) return sessionRef.current;
    const started = sessionStore.begin({
      activityId: plan.activity_id ?? plan.id,
      planId: plan.id,
      type: 'gym',
      date: plan.plan_date,
      notes: plan.notes ?? plan.day_type,
      tags: [plan.day_type],
    });
    commit(started);
    return started;
  };

  useEffect(() => {
    if (knownBodyWeightKg != null) return;
    bodyMetricsService.getLatestProfile()
      .then(profile => setBodyWeightKg(profile.weight))
      .catch(() => setBodyWeightKg(null));
  }, [knownBodyWeightKg]);

  useEffect(() => {
    if (closed) {
      clearSession(plan.id);
      return;
    }
    if (sessionRef.current) return;
    let cancelled = false;
    const resume = async () => {
      if (wasEnded(planActivityId(plan))) return;
      if (plan.status === 'in_progress' && plan.activity_id && !wasEnded(plan.activity_id)) {
        const remote = await sessionsService.load(plan.activity_id, plan.id).catch(() => null);
        if (cancelled || sessionRef.current || wasEnded(planActivityId(plan))) return;
        if (remote && !wasEnded(remote.activityId)) {
          commit(sessionStore.adopt(remote));
          return;
        }
      }
      if (cancelled || wasEnded(planActivityId(plan))) return;
      if (autoStart || plan.status === 'in_progress') ensureSession();
      else setStarting(false);
    };
    void resume();
    return () => { cancelled = true; };
    // Runs once per plan; ensureSession reads the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, closed]);

  // A set save re-renders the sheet. iOS sometimes resets the scroller to the top,
  // which looks like the workout loaded again. Only correct that jump; a later
  // scrollIntoView to the next set is left alone.
  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (node && node.scrollTop === 0 && scrollTopRef.current > 0) node.scrollTop = scrollTopRef.current;
  });

  const groups = useMemo(() => buildGroups(plan, session), [plan, session]);
  const cardioItems = plan.exercises.filter(exercise => exercise.is_cardio);
  const plannedKcal = estimatePlanCalories(plan.exercises, bodyWeightKg);
  const loggedMetrics = session ? strengthSessionMetrics({ sets: session.sets, cardio: session.cardio, bodyWeightKg }) : null;

  const loggedDraft = (row: Row) => (row.logged ? draftFromSet(row.logged, row.loadType, bodyWeightKg) : row.prefill);
  const valueOf = (row: Row) => drafts[row.key] ?? loggedDraft(row);

  // Light hold timer: one at a time, fills the seconds field when stopped.
  const [timer, setTimer] = useState<{ key: string; startedAt: number } | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setTick(tick => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer]);
  const timerSeconds = (startedAt: number) => Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  const updateDraft = (row: Row, patch: Partial<Draft>) => {
    setDrafts(current => ({ ...current, [row.key]: { ...valueOf(row), ...patch } }));
  };

  const logRow = (row: Row) => {
    if (isDoubleTap(`log:${row.key}`)) return;
    const draft = valueOf(row);
    const reps = Number(draft.reps);
    const seconds = Math.round(Number(draft.seconds));
    if (row.timed ? !Number.isFinite(seconds) || seconds <= 0 : !Number.isFinite(reps) || reps <= 0) {
      toast.error(row.timed ? 'Enter seconds' : 'Enter reps');
      return;
    }
    const added = draft.weight.trim() === '' ? 0 : Number(draft.weight);
    if (row.loadType === 'bodyweight' && (!Number.isFinite(added) || added < 0)) {
      toast.error('Enter added kg, or leave it empty for BW');
      return;
    }
    // Tapping a logged, unchanged set again undoes it: the row is deleted and the set is pending again.
    if (row.logged && sameDraft(draft, loggedDraft(row))) {
      deleteRow(row);
      return;
    }
    let current = ensureSession();
    if (!current) return;
    if (current.skipped.includes(row.key)) current = sessionStore.patch(current, { skipped: current.skipped.filter(key => key !== row.key) });
    const set: SessionSet = {
      id: row.logged?.id ?? (row.planSetId ? newId() : row.key),
      exercise_id: row.exerciseId,
      exercise_name: row.exerciseName,
      set_number: row.setNumber,
      reps: row.timed ? null : reps,
      weight: draft.weight === '' ? null : Number(draft.weight),
      rpe: draft.rpe === '' ? null : Number(draft.rpe),
      plan_set_id: row.planSetId,
      load_mode: row.loadType === 'per_dumbbell' ? 'dumbbell_pair' : 'total',
      input_weight: draft.weight === '' ? undefined : row.loadType === 'per_dumbbell' ? perDumbbell(Number(draft.weight)) : Number(draft.weight),
      ...(row.timed ? { duration_sec: seconds } : {}),
      ...(row.loadType === 'bodyweight' ? {
        // weight stays the total load so volume, Progress and calories read it as before.
        weight: bodyWeightKg ? loggedWeightFor(added, 'bodyweight', bodyWeightKg) : added > 0 ? added : null,
        added_weight_kg: added,
        bodyweight_kg: bodyWeightKg ?? null,
        load_mode: 'bodyweight' as const,
        input_weight: added,
        load_label: bodyweightLabel(added),
      } : {}),
    };
    if (timer?.key === row.key) setTimer(null);
    const wasNew = !row.logged;
    commit(sessionStore.saveSet(current, set));
    setDrafts(currentDrafts => withoutKey(currentDrafts, row.key));
    if (!wasNew) return;
    const rows = groups.flatMap(group => group.rows);
    const index = rows.findIndex(item => item.key === row.key);
    const next = rows.slice(index + 1).find(item => !item.logged && !current.skipped.includes(item.key));
    if (!next) return;
    const label = next.timed ? `${next.exerciseName} set ${next.setNumber} seconds` : `${next.exerciseName} set ${next.setNumber} reps`;
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLInputElement>(`[aria-label="${label.replace(/"/g, '\\"')}"]`);
      field?.focus();
      if (typeof field?.scrollIntoView === 'function') field.scrollIntoView({ block: 'center' });
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollTopRef.current = scrollerRef.current.scrollTop;
      });
    });
  };

  function deleteRow(row: Row) {
    if (!row.logged || !sessionRef.current) return;
    commit(sessionStore.deleteSet(sessionRef.current, row.logged.id));
    setDrafts(current => withoutKey(current, row.key));
  }

  const toggleSkip = (row: Row) => {
    if (isDoubleTap(`skip:${row.key}`)) return;
    const current = ensureSession();
    if (!current) return;
    const skipped = current.skipped.includes(row.key)
      ? current.skipped.filter(key => key !== row.key)
      : [...current.skipped, row.key];
    commit(sessionStore.patch(current, { skipped }));
  };

  const addExtra = (exerciseId: string, name: string) => {
    const current = ensureSession();
    if (!current) return;
    commit(sessionStore.patch(current, { extras: [...current.extras, { id: newId(), exercise_id: exerciseId, exercise_name: name }] }));
  };

  const openPicker = () => {
    setPickerOpen(true);
    if (exerciseChoices.length > 0) return;
    void exercisesService.getAll()
      .then(list => setExerciseChoices(list.filter(exercise => exercise.category !== 'cardio').map(exercise => ({ id: exercise.id, name: exercise.name }))))
      .catch(() => setExerciseChoices([]));
  };

  const visibleChoices = exerciseChoices
    .filter(exercise => exercise.name.toLowerCase().includes(exerciseQuery.trim().toLowerCase()))
    .slice(0, 8);

  const openGuidance = (exerciseId: string, name: string) => {
    setGuidanceFor({ id: exerciseId, name });
    setGuidance(null);
    void plansService.guidance(exerciseId).then(setGuidance).catch(() => setGuidance(null));
  };

  const cardioPrefill = (exercise: PlanExercise): CardioDraft => {
    const label = exercise.note ?? exercise.exercise_name;
    const kcal = cardioTargetCalories(exercise, bodyWeightKg, label);
    return {
      label,
      minutes: exercise.target_duration_min == null ? '' : String(Number(exercise.target_duration_min)),
      kcal: kcal == null ? '' : String(kcal),
    };
  };

  const cardioValue = (exercise: PlanExercise): CardioDraft => {
    const logged = session?.cardio.find(entry => entry.plan_exercise_id === exercise.id);
    return cardioDrafts[exercise.id]
      ?? (logged ? { label: logged.label, minutes: String(logged.minutes), kcal: logged.calories == null ? '' : String(logged.calories) } : cardioPrefill(exercise));
  };

  const logCardio = (exercise: PlanExercise) => {
    const draft = cardioValue(exercise);
    const minutes = Number(draft.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      toast.error('Enter minutes');
      return;
    }
    if (!draft.label.trim()) {
      toast.error('Enter a cardio type');
      return;
    }
    let current = ensureSession();
    if (!current) return;
    const skipKey = cardioSkipKey(exercise.id);
    if (current.skipped.includes(skipKey)) current = sessionStore.patch(current, { skipped: current.skipped.filter(key => key !== skipKey) });
    const logged = current.cardio.find(entry => entry.plan_exercise_id === exercise.id);
    commit(sessionStore.saveCardio(current, {
      id: logged?.id ?? newId(),
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.exercise_name,
      position: logged?.position ?? current.cardio.length + 1,
      minutes,
      calories: draft.kcal.trim() === '' ? null : Math.round(Number(draft.kcal)),
      label: draft.label.trim(),
      plan_exercise_id: exercise.id,
    }));
    setCardioDrafts(current => withoutKey(current, exercise.id));
  };

  const toggleCardioSkip = (exercise: PlanExercise) => {
    const key = cardioSkipKey(exercise.id);
    if (isDoubleTap(`skip:${key}`)) return;
    const current = ensureSession();
    if (!current) return;
    const skipped = current.skipped.includes(key)
      ? current.skipped.filter(item => item !== key)
      : [...current.skipped, key];
    commit(sessionStore.patch(current, { skipped }));
  };

  const deleteCardio = (exercise: PlanExercise) => {
    const current = sessionRef.current;
    const logged = current?.cardio.find(entry => entry.plan_exercise_id === exercise.id);
    if (!current || !logged) return;
    commit(sessionStore.deleteCardio(current, logged.id));
  };

  const finish = () => {
    const current = sessionRef.current;
    if (!current || (current.sets.length === 0 && current.cardio.length === 0)) {
      toast.error('Log at least one set');
      return;
    }
    const order = groups.flatMap(group => group.rows.map(row => row.logged?.id)).filter(Boolean) as string[];
    const sets = current.sets.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const metrics = strengthSessionMetrics({ sets, cardio: current.cardio, bodyWeightKg });
    sessionStore.finish({ ...current, sets }, {
      duration: null,
      notes: plan.notes ?? plan.day_type,
      structuredMetrics: metrics.structuredMetrics,
      numberSet: (set, index, all) => all.slice(0, index + 1).filter(item => item.exercise_id === set.exercise_id).length,
    });
    commit(null);
    toast.success('Workout saved');
    onSaved();
  };

  const discard = () => {
    const current = sessionRef.current;
    if (!current) return;
    if (!window.confirm('Discard this workout? Logged sets are deleted.')) return;
    sessionStore.discard(current);
    commit(null);
    onClose();
  };

  const loggedCount = (session?.sets.length ?? 0) + (session?.cardio.length ?? 0);

  const start = () => {
    if (closed) return;
    setStarting(true);
    ensureSession();
  };

  return (
    <div className="sheet-overlay z-50">
      <div className="sheet-safe-bar" aria-hidden="true" />
      <div className="sheet-stage">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="sheet-panel relative max-w-lg mx-auto" style={{ background: GROUND, color: INK, border: `2px solid ${INK}` }}>
          <div data-testid="sheet-header" className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `2px solid ${INK}` }}>
            <div className="min-w-0">
              <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                {plan.plan_date}{closed ? (plan.status === 'skipped' ? ' · skipped' : ' · done') : session ? ' · in progress' : viewOnly ? ' · view only' : ''}
              </p>
              <h2 className="text-base font-800">{plan.day_type}</h2>
            </div>
            <button type="button" aria-label="Close workout" onClick={onClose} className="min-h-11 min-w-11 text-sm font-800">Close</button>
          </div>
          <div
            ref={scrollerRef}
            onScroll={event => { scrollTopRef.current = event.currentTarget.scrollTop; }}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
          >
            <div data-testid="plan-calories" className="flex items-center justify-between gap-3 p-3" style={{ border: `2px solid ${ACCENT}`, background: ACCENT_TINT }}>
              <div className="min-w-0">
                <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: ACCENT_DEEP }}>Burn estimate</p>
                <p className="text-[11px] mt-0.5">
                  {bodyWeightKg ? 'App estimate from the plan targets and body weight.' : 'Add body weight in metrics to calculate this.'}
                </p>
              </div>
              <div className="text-right flex-none">
                <p className="text-lg font-800 nums">{plannedKcal != null ? `${plannedKcal} kcal` : '-- kcal'}</p>
                {session && loggedMetrics?.calories != null && (
                  <p className="text-[11px] font-800 nums">Logged {loggedMetrics.calories} kcal</p>
                )}
              </div>
            </div>
            {session && !closed && <SyncLine activityId={session.activityId} loggedCount={loggedCount} />}
            {closed && (
              <p className="text-sm font-800 p-3" style={{ border: `2px solid ${INK}`, background: PANEL }}>
                {plan.status === 'skipped'
                  ? 'This plan is skipped. Its session is in your workout history.'
                  : 'This workout is finished. Logged sets are in your history.'}
              </p>
            )}
            {groups.map(group => (
              <section key={group.exerciseId} style={{ border: `2px solid ${INK}` }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ background: INK, color: GROUND }}>
                  <p className="text-xs font-800">
                    {group.name}{group.loadType === 'per_dumbbell' ? ' · per DB' : group.loadType === 'bodyweight' ? ' · BW' : ''}{group.measure === 'time' ? ' · timed' : ''}
                  </p>
                  <button
                    type="button"
                    aria-label={`Guidance for ${group.name}`}
                    onClick={() => openGuidance(group.exerciseId, group.name)}
                    className="min-h-11 min-w-11 text-[11px] font-800"
                  >
                    Info
                  </button>
                </div>
                {viewOnly && group.rows.map(row => (
                  <div key={row.key} data-testid="plan-view-set" className="flex items-start justify-between gap-3 px-3 py-2.5" style={{ borderTop: `2px solid ${RULE}`, background: PANEL }}>
                    <p className="text-[11px] font-800 uppercase flex-none">Set {row.setNumber} · {row.setType}</p>
                    <div className="text-right min-w-0">
                      <p className="text-sm font-800 nums">{row.targetLabel}</p>
                      <p className="text-[11px] nums" style={{ color: MUTED }}>
                        {[row.rirLabel, row.restSeconds != null ? `Rest ${row.restSeconds}s` : ''].filter(Boolean).join(' · ')}
                        {row.loadType === 'per_dumbbell' && row.prefill.weight !== '' ? `${row.rirLabel || row.restSeconds != null ? ' · ' : ''}log ${row.prefill.weight} kg pair` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {!viewOnly && group.rows.map(row => {
                  const value = valueOf(row);
                  const skipped = session?.skipped.includes(row.key) ?? false;
                  const changed = row.logged ? !sameDraft(value, loggedDraft(row)) : false;
                  const running = timer?.key === row.key;
                  const weightNumber = Number(value.weight);
                  return (
                    <div key={row.key} data-testid="plan-set-row" data-state={row.logged ? 'logged' : skipped ? 'skipped' : 'pending'} className="px-3 py-3 space-y-2" style={{ borderTop: `2px solid ${RULE}`, borderLeft: `6px solid ${row.logged ? INK : skipped ? MUTED : 'transparent'}`, background: PANEL, opacity: skipped ? 0.7 : 1 }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-800 uppercase">{row.setType}</p>
                        <p className="text-[11px] text-right" style={{ color: MUTED }}>{row.targetLabel}{row.rirLabel ? ` · ${row.rirLabel}` : ''}</p>
                      </div>
                      {row.restSeconds != null && (
                        <p className="text-[11px] font-800" aria-label="Rest timer">Rest {row.restSeconds}s</p>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        {row.timed ? (
                          <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                            Sec
                            <input
                              aria-label={`${row.exerciseName} set ${row.setNumber} seconds`}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              enterKeyHint="next"
                              value={running && timer ? String(timerSeconds(timer.startedAt)) : value.seconds}
                              disabled={readOnly || running}
                              onChange={event => updateDraft(row, { seconds: event.target.value })}
                              className="mt-1 w-full min-h-11 px-2 text-sm nums"
                              style={inputStyle}
                            />
                            {!readOnly && (
                              <button
                                type="button"
                                data-testid="hold-timer"
                                aria-label={running ? `Stop timer for ${row.exerciseName} set ${row.setNumber}` : `Start timer for ${row.exerciseName} set ${row.setNumber}`}
                                onClick={() => {
                                  if (running && timer) {
                                    updateDraft(row, { seconds: String(timerSeconds(timer.startedAt)) });
                                    setTimer(null);
                                  } else {
                                    setTimer({ key: row.key, startedAt: Date.now() });
                                  }
                                }}
                                className="mt-1 w-full min-h-11 text-[11px] font-800 normal-case"
                                style={{ border: `2px solid ${INK}`, background: running ? ACCENT : GROUND, color: running ? GROUND : INK }}
                              >
                                {running ? 'Stop' : 'Timer'}
                              </button>
                            )}
                          </label>
                        ) : (
                          <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                            Reps
                            <input
                              aria-label={`${row.exerciseName} set ${row.setNumber} reps`}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              enterKeyHint="next"
                              value={value.reps}
                              disabled={readOnly}
                              onChange={event => updateDraft(row, { reps: event.target.value })}
                              className="mt-1 w-full min-h-11 px-2 text-sm nums"
                              style={inputStyle}
                            />
                          </label>
                        )}
                        <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                          {row.loadType === 'per_dumbbell' ? 'Kg (pair)' : row.loadType === 'bodyweight' ? '+ Kg' : 'Kg'}
                          <input
                            aria-label={`${row.exerciseName} set ${row.setNumber} ${row.loadType === 'bodyweight' ? 'added weight' : 'weight'}`}
                            inputMode="decimal"
                            placeholder={row.loadType === 'bodyweight' ? 'BW' : undefined}
                            value={value.weight}
                            disabled={readOnly}
                            onChange={event => updateDraft(row, { weight: event.target.value })}
                            className="mt-1 w-full min-h-11 px-2 text-sm nums"
                            style={inputStyle}
                          />
                          {row.loadType === 'bodyweight' && (
                            <span data-testid="bw-load" className="mt-1 block text-[11px] font-800 normal-case nums" style={{ color: INK }}>
                              {value.weight.trim() === '' || Number.isFinite(weightNumber) ? bodyweightLabel(value.weight.trim() === '' ? 0 : weightNumber) : 'BW + kg'}
                            </span>
                          )}
                          {row.loadType === 'per_dumbbell' && (
                            <span data-testid="per-db" className="mt-1 block text-[11px] font-800 normal-case nums" style={{ color: INK }}>
                              {value.weight !== '' && Number.isFinite(weightNumber) ? `= ${perDumbbell(weightNumber)} kg / DB` : 'kg / DB = half'}
                            </span>
                          )}
                        </label>
                        <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                          RPE
                          <input
                            aria-label={`${row.exerciseName} set ${row.setNumber} rpe`}
                            inputMode="decimal"
                            value={value.rpe}
                            disabled={readOnly}
                            onChange={event => updateDraft(row, { rpe: event.target.value })}
                            className="mt-1 w-full min-h-11 px-2 text-sm nums"
                            style={inputStyle}
                          />
                        </label>
                      </div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            aria-pressed={Boolean(row.logged) && !changed}
                            aria-label={!row.logged ? `Log set ${row.setNumber}` : changed ? `Update set ${row.setNumber}` : `Logged set ${row.setNumber}, tap to undo`}
                            data-state={!row.logged ? 'pending' : changed ? 'changed' : 'logged'}
                            onClick={() => logRow(row)}
                            disabled={skipped}
                            className="min-h-11 flex-1 text-sm font-800 disabled:opacity-40"
                            style={{
                              background: row.logged && !changed ? INK : changed ? ACCENT : GROUND,
                              color: row.logged || changed ? GROUND : INK,
                              border: `2px solid ${INK}`,
                            }}
                          >
                            {!row.logged ? `Log set ${row.setNumber}` : changed ? `Update set ${row.setNumber}` : `✓ Logged set ${row.setNumber} · undo`}
                          </button>
                          {row.logged ? (
                            changed && (
                              <button
                                type="button"
                                aria-label={`Undo ${row.exerciseName} set ${row.setNumber}`}
                                onClick={() => deleteRow(row)}
                                className="min-h-11 min-w-11 px-3 text-sm font-800"
                                style={{ border: `2px solid ${INK}`, color: ACCENT_DEEP }}
                              >
                                Undo
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              aria-pressed={skipped}
                              aria-label={skipped ? `Skipped set ${row.setNumber}, tap to undo` : `Skip set ${row.setNumber}`}
                              data-state={skipped ? 'skipped' : 'pending'}
                              onClick={() => toggleSkip(row)}
                              className="min-h-11 px-3 text-sm font-800"
                              style={{ border: `2px solid ${INK}`, background: skipped ? INK : GROUND, color: skipped ? GROUND : INK }}
                            >
                              {skipped ? '✓ Skipped · undo' : `Skip set ${row.setNumber}`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!readOnly && !viewOnly && (
                  <button type="button" onClick={() => addExtra(group.exerciseId, group.name)} className="w-full min-h-11 text-[11px] font-800" style={{ borderTop: `2px solid ${INK}` }}>
                    Add set
                  </button>
                )}
              </section>
            ))}
            {cardioItems.map(exercise => {
              const value = cardioValue(exercise);
              const logged = session?.cardio.find(entry => entry.plan_exercise_id === exercise.id);
              const skipped = session?.skipped.includes(cardioSkipKey(exercise.id)) ?? false;
              const changed = logged
                ? value.label !== logged.label || value.minutes !== String(logged.minutes) || value.kcal !== (logged.calories == null ? '' : String(logged.calories))
                : false;
              return (
                <section key={exercise.id} data-testid="plan-cardio" data-state={logged ? 'logged' : skipped ? 'skipped' : 'pending'} style={{ border: `2px solid ${INK}`, opacity: skipped ? 0.7 : 1 }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: INK, color: GROUND }}>
                    <p className="text-xs font-800">{exercise.note || exercise.exercise_name}</p>
                    <p className="text-[11px] font-800 uppercase">Cardio</p>
                  </div>
                  <div className="px-3 py-3 space-y-2" style={{ background: PANEL }}>
                    <p className={viewOnly ? 'text-sm font-800 nums' : 'text-[11px]'} style={viewOnly ? undefined : { color: MUTED }}>Target {cardioTargetLabel(exercise) || 'as you feel'}</p>
                    {viewOnly && value.kcal !== '' && exercise.target_kcal == null && (
                      <p className="text-[11px] nums" style={{ color: MUTED }}>≈ {value.kcal} kcal est.</p>
                    )}
                    {skipped && (
                      <p className="text-[11px] font-800">Skipped. Finishing still completes this workout.</p>
                    )}
                    {!viewOnly && <>
                    <label className="block text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                      Type
                      <input
                        aria-label="Plan cardio type"
                        value={value.label}
                        disabled={readOnly || skipped}
                        onChange={event => setCardioDrafts(current => ({ ...current, [exercise.id]: { ...value, label: event.target.value } }))}
                        className="mt-1 w-full min-h-11 px-2 text-sm"
                        style={inputStyle}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                        Minutes
                        <input
                          aria-label="Plan cardio minutes"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={value.minutes}
                          disabled={readOnly || skipped}
                          onChange={event => setCardioDrafts(current => ({ ...current, [exercise.id]: { ...value, minutes: event.target.value } }))}
                          className="mt-1 w-full min-h-11 px-2 text-sm nums"
                          style={inputStyle}
                        />
                      </label>
                      <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                        Calories
                        <input
                          aria-label="Plan cardio calories"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={value.kcal}
                          disabled={readOnly || skipped}
                          onChange={event => setCardioDrafts(current => ({ ...current, [exercise.id]: { ...value, kcal: event.target.value } }))}
                          className="mt-1 w-full min-h-11 px-2 text-sm nums"
                          style={inputStyle}
                        />
                      </label>
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => logCardio(exercise)}
                          disabled={skipped}
                          className="min-h-11 flex-1 text-sm font-800 disabled:opacity-40"
                          style={{ background: logged && !changed ? INK : ACCENT, color: GROUND, border: `2px solid ${INK}` }}
                        >
                          {!logged ? 'Log cardio' : changed ? 'Update cardio' : 'Logged cardio'}
                        </button>
                        {logged ? (
                          <button
                            type="button"
                            aria-label={`Delete ${exercise.exercise_name}`}
                            onClick={() => deleteCardio(exercise)}
                            className="min-h-11 min-w-11 px-3 text-sm font-800"
                            style={{ border: `2px solid ${INK}`, color: ACCENT_DEEP }}
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-pressed={skipped}
                            aria-label={skipped ? 'Skipped cardio, tap to undo' : 'Skip cardio'}
                            onClick={() => toggleCardioSkip(exercise)}
                            className="min-h-11 px-3 text-sm font-800"
                            style={{ border: `2px solid ${INK}`, background: skipped ? INK : GROUND, color: skipped ? GROUND : INK }}
                          >
                            {skipped ? '✓ Skipped · undo' : 'Skip cardio'}
                          </button>
                        )}
                      </div>
                    )}
                    </>}
                  </div>
                </section>
              );
            })}
            {!readOnly && !viewOnly && (
              <button type="button" onClick={openPicker} className="w-full min-h-11 text-sm font-800" style={{ border: `2px solid ${INK}` }}>
                Add exercise
              </button>
            )}
            {pickerOpen && (
              <div className="space-y-2" style={{ border: `2px solid ${INK}`, background: PANEL }}>
                <input
                  aria-label="Search exercises"
                  value={exerciseQuery}
                  onChange={event => setExerciseQuery(event.target.value)}
                  placeholder="Search exercises"
                  className="w-full min-h-11 px-3 text-sm"
                  style={{ borderBottom: `2px solid ${INK}`, background: GROUND }}
                />
                {visibleChoices.map(exercise => (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => { addExtra(exercise.id, exercise.name); setPickerOpen(false); setExerciseQuery(''); }}
                    className="w-full min-h-11 px-3 text-left text-sm font-800"
                  >
                    {exercise.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {viewOnly && !closed && (
            <div className="px-4 pt-3" style={{ borderTop: `2px solid ${INK}`, paddingBottom: 'max(0.75rem, var(--sab))' }}>
              <button type="button" onClick={start} className="w-full min-h-11 text-sm font-800" style={{ background: ACCENT, color: GROUND, border: `2px solid ${INK}` }}>
                Start workout
              </button>
            </div>
          )}
          {!readOnly && !viewOnly && (
            <div className="flex gap-2 px-4 pt-3" style={{ borderTop: `2px solid ${INK}`, paddingBottom: 'max(0.75rem, var(--sab))' }}>
              {session && (
                <button type="button" onClick={discard} className="min-h-11 px-3 text-sm font-800" style={{ border: `2px solid ${INK}`, color: ACCENT_DEEP }}>
                  Discard
                </button>
              )}
              <button type="button" onClick={finish} className="flex-1 min-h-11 text-sm font-800" style={{ background: INK, color: GROUND }}>
                {session ? `Finish workout${loggedCount > 0 ? ` · ${loggedCount}` : ''}` : 'Finish workout'}
              </button>
            </div>
          )}
        </div>
      </div>
      {guidanceFor && (
        <Suspense fallback={null}>
          <GuidanceSheet name={guidanceFor.name} guidance={guidance} onClose={() => setGuidanceFor(null)} />
        </Suspense>
      )}
    </div>
  );
}
