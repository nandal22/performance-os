import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  cardioTargetCalories, cardioTargetLabel, estimatePlanCalories, perDumbbell, prefillFromTarget, repsLabel, targetWeightLabel,
} from '@/lib/planMath';
import { strengthSessionMetrics } from '@/lib/sessionMetrics';
import { newId, type SessionSet, type WorkoutSession } from '@/lib/workoutSession';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { exercisesService } from '@/services/exercises';
import { plansService, type LoadType, type PlanExercise, type PlanSet, type WorkoutPlan } from '@/services/plans';
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
  weight: string;
  rpe: string;
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
  prefill: Draft;
  logged: SessionSet | undefined;
}

interface Group {
  exerciseId: string;
  name: string;
  loadType: LoadType;
  rows: Row[];
}

function draftFromSet(set: SessionSet): Draft {
  return {
    reps: String(set.reps),
    weight: set.weight == null ? '' : String(set.weight),
    rpe: set.rpe == null ? '' : String(set.rpe),
  };
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function sameDraft(a: Draft, b: Draft) {
  return a.reps === b.reps && a.weight === b.weight && a.rpe === b.rpe;
}

function buildGroups(plan: WorkoutPlan, session: WorkoutSession | null): Group[] {
  const groups = new Map<string, Group>();
  const group = (exerciseId: string, name: string, loadType: LoadType) => {
    if (!groups.has(exerciseId)) groups.set(exerciseId, { exerciseId, name, loadType, rows: [] });
    return groups.get(exerciseId) as Group;
  };
  const sets = session?.sets ?? [];
  for (const exercise of plan.exercises.filter(item => !item.is_cardio)) {
    const target = group(exercise.exercise_id, exercise.exercise_name, exercise.load_type);
    for (const set of exercise.sets) {
      target.rows.push({
        key: set.id,
        exerciseId: exercise.exercise_id,
        exerciseName: exercise.exercise_name,
        planSetId: set.id,
        setNumber: set.set_number,
        setType: set.set_type,
        targetLabel: [repsLabel(set), targetWeightLabel(set.target_weight_kg, exercise.load_type)].filter(Boolean).join(' · '),
        restSeconds: set.rest_seconds,
        rirLabel: set.target_rir_max == null ? '' : `RIR ${set.target_rir_min ?? set.target_rir_max}–${set.target_rir_max}`,
        loadType: exercise.load_type,
        prefill: prefillFromTarget(set, exercise.load_type),
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
    const target = group(extra.exercise_id, extra.exercise_name, groups.get(extra.exercise_id)?.loadType ?? 'total');
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
      prefill: { reps: '', weight: '', rpe: '' },
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
  const [session, setSession] = useState<WorkoutSession | null>(() => sessionStore.read(plan.id));
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
  const sync = useSyncStatus(session?.activityId ?? null);
  const readOnly = !session && (plan.status === 'done' || plan.status === 'skipped');

  const commit = (next: WorkoutSession | null) => {
    sessionRef.current = next;
    setSession(next);
  };

  const ensureSession = () => {
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
    if (sessionRef.current) return;
    let cancelled = false;
    const resume = async () => {
      if (plan.status === 'in_progress' && plan.activity_id) {
        const remote = await sessionsService.load(plan.activity_id, plan.id).catch(() => null);
        if (cancelled || sessionRef.current) return;
        if (remote) {
          commit(sessionStore.adopt(remote));
          return;
        }
      }
      if (autoStart || plan.status === 'in_progress') ensureSession();
    };
    void resume();
    return () => { cancelled = true; };
    // Runs once per plan; ensureSession reads the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  const groups = useMemo(() => buildGroups(plan, session), [plan, session]);
  const cardioItems = plan.exercises.filter(exercise => exercise.is_cardio);
  const plannedKcal = estimatePlanCalories(plan.exercises, bodyWeightKg);
  const loggedMetrics = session ? strengthSessionMetrics({ sets: session.sets, cardio: session.cardio, bodyWeightKg }) : null;

  const valueOf = (row: Row) => drafts[row.key] ?? (row.logged ? draftFromSet(row.logged) : row.prefill);

  const updateDraft = (row: Row, patch: Partial<Draft>) => {
    setDrafts(current => ({ ...current, [row.key]: { ...valueOf(row), ...patch } }));
  };

  const logRow = (row: Row) => {
    const draft = valueOf(row);
    const reps = Number(draft.reps);
    if (!Number.isFinite(reps) || reps <= 0) {
      toast.error('Enter reps');
      return;
    }
    if (row.logged && sameDraft(draft, draftFromSet(row.logged))) return;
    const current = ensureSession();
    const set: SessionSet = {
      id: row.logged?.id ?? (row.planSetId ? newId() : row.key),
      exercise_id: row.exerciseId,
      exercise_name: row.exerciseName,
      set_number: row.setNumber,
      reps,
      weight: draft.weight === '' ? null : Number(draft.weight),
      rpe: draft.rpe === '' ? null : Number(draft.rpe),
      plan_set_id: row.planSetId,
      load_mode: row.loadType === 'per_dumbbell' ? 'dumbbell_pair' : 'total',
      input_weight: draft.weight === '' ? undefined : row.loadType === 'per_dumbbell' ? perDumbbell(Number(draft.weight)) : Number(draft.weight),
    };
    commit(sessionStore.saveSet(current, set));
    setDrafts(current => withoutKey(current, row.key));
  };

  const deleteRow = (row: Row) => {
    if (!row.logged || !sessionRef.current) return;
    commit(sessionStore.deleteSet(sessionRef.current, row.logged.id));
    setDrafts(current => withoutKey(current, row.key));
  };

  const toggleSkip = (row: Row) => {
    const current = ensureSession();
    const skipped = current.skipped.includes(row.key)
      ? current.skipped.filter(key => key !== row.key)
      : [...current.skipped, row.key];
    commit(sessionStore.patch(current, { skipped }));
  };

  const addExtra = (exerciseId: string, name: string) => {
    const current = ensureSession();
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
    const current = ensureSession();
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

  return (
    <div className="sheet-overlay z-50">
      <div className="sheet-safe-bar" aria-hidden="true" />
      <div className="sheet-stage">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="sheet-panel relative max-w-lg mx-auto" style={{ background: GROUND, color: INK, border: `2px solid ${INK}` }}>
          <div data-testid="sheet-header" className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `2px solid ${INK}` }}>
            <div className="min-w-0">
              <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                {plan.plan_date}{session ? ' · in progress' : ''}
              </p>
              <h2 className="text-base font-800">{plan.day_type}</h2>
            </div>
            <button type="button" aria-label="Close workout" onClick={onClose} className="min-h-11 min-w-11 text-sm font-800">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
            {session && (
              <p data-testid="sync-status" className="text-[11px] font-800" style={{ color: sync.pending > 0 ? ACCENT_DEEP : MUTED }}>
                {sync.pending > 0
                  ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync${typeof navigator !== 'undefined' && navigator.onLine === false ? ' · offline' : ''}`
                  : `${loggedCount} logged · saved`}
              </p>
            )}
            {readOnly && (
              <p className="text-sm font-800 p-3" style={{ border: `2px solid ${INK}`, background: PANEL }}>
                This plan is {plan.status}. Its session is in your workout history.
              </p>
            )}
            {groups.map(group => (
              <section key={group.exerciseId} style={{ border: `2px solid ${INK}` }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ background: INK, color: GROUND }}>
                  <p className="text-xs font-800">{group.name}{group.loadType === 'per_dumbbell' ? ' · per DB' : ''}</p>
                  <button
                    type="button"
                    aria-label={`Guidance for ${group.name}`}
                    onClick={() => openGuidance(group.exerciseId, group.name)}
                    className="min-h-11 min-w-11 text-[11px] font-800"
                  >
                    Info
                  </button>
                </div>
                {group.rows.map(row => {
                  const value = valueOf(row);
                  const skipped = session?.skipped.includes(row.key) ?? false;
                  const changed = row.logged ? !sameDraft(value, draftFromSet(row.logged)) : false;
                  const weightNumber = Number(value.weight);
                  return (
                    <div key={row.key} className="px-3 py-3 space-y-2" style={{ borderTop: `2px solid ${RULE}`, background: PANEL }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-800 uppercase">{row.setType}</p>
                        <p className="text-[11px] text-right" style={{ color: MUTED }}>{row.targetLabel}{row.rirLabel ? ` · ${row.rirLabel}` : ''}</p>
                      </div>
                      {row.restSeconds != null && (
                        <p className="text-[11px] font-800" aria-label="Rest timer">Rest {row.restSeconds}s</p>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                          Reps
                          <input
                            aria-label={`${row.exerciseName} set ${row.setNumber} reps`}
                            inputMode="numeric"
                            value={value.reps}
                            disabled={readOnly}
                            onChange={event => updateDraft(row, { reps: event.target.value })}
                            className="mt-1 w-full min-h-11 px-2 text-sm nums"
                            style={inputStyle}
                          />
                        </label>
                        <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                          {row.loadType === 'per_dumbbell' ? 'Kg (pair)' : 'Kg'}
                          <input
                            aria-label={`${row.exerciseName} set ${row.setNumber} weight`}
                            inputMode="decimal"
                            value={value.weight}
                            disabled={readOnly}
                            onChange={event => updateDraft(row, { weight: event.target.value })}
                            className="mt-1 w-full min-h-11 px-2 text-sm nums"
                            style={inputStyle}
                          />
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
                            onClick={() => logRow(row)}
                            className="min-h-11 flex-1 text-sm font-800"
                            style={{
                              background: row.logged && !changed ? INK : GROUND,
                              color: row.logged && !changed ? GROUND : INK,
                              border: `2px solid ${INK}`,
                            }}
                          >
                            {!row.logged ? `Log set ${row.setNumber}` : changed ? `Update set ${row.setNumber}` : `Logged set ${row.setNumber}`}
                          </button>
                          {row.logged ? (
                            <button
                              type="button"
                              aria-label={`Delete ${row.exerciseName} set ${row.setNumber}`}
                              onClick={() => deleteRow(row)}
                              className="min-h-11 min-w-11 px-3 text-sm font-800"
                              style={{ border: `2px solid ${INK}`, color: ACCENT_DEEP }}
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleSkip(row)}
                              className="min-h-11 px-3 text-sm font-800"
                              style={{ border: `2px solid ${INK}` }}
                            >
                              {skipped ? 'Skipped' : `Skip set ${row.setNumber}`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!readOnly && (
                  <button type="button" onClick={() => addExtra(group.exerciseId, group.name)} className="w-full min-h-11 text-[11px] font-800" style={{ borderTop: `2px solid ${INK}` }}>
                    Add set
                  </button>
                )}
              </section>
            ))}
            {cardioItems.map(exercise => {
              const value = cardioValue(exercise);
              const logged = session?.cardio.find(entry => entry.plan_exercise_id === exercise.id);
              const changed = logged
                ? value.label !== logged.label || value.minutes !== String(logged.minutes) || value.kcal !== (logged.calories == null ? '' : String(logged.calories))
                : false;
              return (
                <section key={exercise.id} data-testid="plan-cardio" style={{ border: `2px solid ${INK}` }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: INK, color: GROUND }}>
                    <p className="text-xs font-800">{exercise.note || exercise.exercise_name}</p>
                    <p className="text-[11px] font-800 uppercase">Cardio</p>
                  </div>
                  <div className="px-3 py-3 space-y-2" style={{ background: PANEL }}>
                    <p className="text-[11px]" style={{ color: MUTED }}>Target {cardioTargetLabel(exercise) || 'as you feel'}</p>
                    <label className="block text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                      Type
                      <input
                        aria-label="Plan cardio type"
                        value={value.label}
                        disabled={readOnly}
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
                          inputMode="decimal"
                          value={value.minutes}
                          disabled={readOnly}
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
                          value={value.kcal}
                          disabled={readOnly}
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
                          className="min-h-11 flex-1 text-sm font-800"
                          style={{ background: logged && !changed ? INK : ACCENT, color: GROUND, border: `2px solid ${INK}` }}
                        >
                          {!logged ? 'Log cardio' : changed ? 'Update cardio' : 'Logged cardio'}
                        </button>
                        {logged && (
                          <button
                            type="button"
                            aria-label={`Delete ${exercise.exercise_name}`}
                            onClick={() => deleteCardio(exercise)}
                            className="min-h-11 min-w-11 px-3 text-sm font-800"
                            style={{ border: `2px solid ${INK}`, color: ACCENT_DEEP }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
            {!readOnly && (
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
          {!readOnly && (
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
