import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { prefillFromTarget, repsLabel } from '@/lib/planMath';
import { activitiesService } from '@/services/activities';
import { exercisesService } from '@/services/exercises';
import { plansService, type PlanSet, type WorkoutPlan } from '@/services/plans';
import { toast } from 'sonner';

const GuidanceSheet = lazy(() => import('@/components/GuidanceSheet'));

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const PANEL = '#eae9e9';
const MUTED = 'rgba(32,30,29,0.55)';

interface Draft {
  reps: string;
  weight: string;
  rpe: string;
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
  draft: Draft;
}

function rowsFromPlan(plan: WorkoutPlan): Row[] {
  return plan.exercises.flatMap(exercise => exercise.sets.map(set => ({
    key: set.id,
    exerciseId: exercise.exercise_id,
    exerciseName: exercise.exercise_name,
    planSetId: set.id,
    setNumber: set.set_number,
    setType: set.set_type,
    targetLabel: `${repsLabel(set)}${set.target_weight_kg != null ? ` · ${Number(set.target_weight_kg)} kg` : ''}`,
    restSeconds: set.rest_seconds,
    rirLabel: set.target_rir_max == null ? '' : `RIR ${set.target_rir_min ?? set.target_rir_max}–${set.target_rir_max}`,
    draft: prefillFromTarget(set),
  })));
}

export default function PlanLogSheet({
  plan,
  onClose,
  onSaved,
}: {
  plan: WorkoutPlan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState(() => rowsFromPlan(plan));
  const [logged, setLogged] = useState<Record<string, boolean>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [guidanceFor, setGuidanceFor] = useState<{ id: string; name: string } | null>(null);
  const [guidance, setGuidance] = useState<Awaited<ReturnType<typeof plansService.guidance>>>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [exerciseChoices, setExerciseChoices] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (plan.status === 'planned') void plansService.start(plan.id).catch(() => undefined);
  }, [plan.id, plan.status]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byName = new Map<string, Row[]>();
    for (const row of rows) {
      if (!byName.has(row.exerciseName)) {
        byName.set(row.exerciseName, []);
        order.push(row.exerciseName);
      }
      byName.get(row.exerciseName)?.push(row);
    }
    return order.map(name => ({ name, rows: byName.get(name) ?? [] }));
  }, [rows]);

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setRows(current => current.map(row => row.key === key ? { ...row, draft: { ...row.draft, ...patch } } : row));
  };

  const addSet = (exerciseName: string) => {
    const sample = rows.find(row => row.exerciseName === exerciseName);
    if (!sample) return;
    const setNumber = rows.filter(row => row.exerciseName === exerciseName).length + 1;
    setRows(current => [...current, {
      key: `extra-${exerciseName}-${setNumber}`,
      exerciseId: sample.exerciseId,
      exerciseName,
      planSetId: null,
      setNumber,
      setType: 'extra',
      targetLabel: 'Extra set',
      restSeconds: null,
      rirLabel: '',
      draft: { reps: '', weight: '', rpe: '' },
    }]);
  };

  const openPicker = () => {
    setPickerOpen(true);
    if (exerciseChoices.length > 0) return;
    void exercisesService.getAll()
      .then(list => setExerciseChoices(list.map(exercise => ({ id: exercise.id, name: exercise.name }))))
      .catch(() => setExerciseChoices([]));
  };

  const addExercise = (exercise: { id: string; name: string }) => {
    const setNumber = rows.filter(row => row.exerciseId === exercise.id).length + 1;
    setRows(current => [...current, {
      key: `extra-${exercise.id}-${current.length + 1}`,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      planSetId: null,
      setNumber,
      setType: 'extra',
      targetLabel: 'Extra set',
      restSeconds: null,
      rirLabel: '',
      draft: { reps: '', weight: '', rpe: '' },
    }]);
    setPickerOpen(false);
    setExerciseQuery('');
  };

  const visibleChoices = exerciseChoices
    .filter(exercise => exercise.name.toLowerCase().includes(exerciseQuery.trim().toLowerCase()))
    .slice(0, 8);

  const openGuidance = (exerciseId: string, name: string) => {
    setGuidanceFor({ id: exerciseId, name });
    setGuidance(null);
    void plansService.guidance(exerciseId).then(setGuidance).catch(() => setGuidance(null));
  };

  const save = async () => {
    if (!user) return;
    const sets = groups.flatMap(group => group.rows
      .filter(row => logged[row.key] && !skipped[row.key])
      .map((row, index) => ({
        exercise_id: row.exerciseId,
        set_number: index + 1,
        reps: Number(row.draft.reps),
        weight: row.draft.weight === '' ? undefined : Number(row.draft.weight),
        rpe: row.draft.rpe === '' ? null : Number(row.draft.rpe),
        plan_set_id: row.planSetId,
      })));
    if (sets.length === 0) {
      toast.error('Log at least one set');
      return;
    }
    setSaving(true);
    try {
      await activitiesService.saveWorkout({
        userId: user.id,
        planId: plan.id,
        activity: {
          date: plan.plan_date,
          type: 'gym',
          notes: plan.notes ?? plan.day_type,
          tags: [plan.day_type],
          structured_metrics: {},
        },
        sets,
        cardio: [],
      });
      toast.success('Workout saved');
      onSaved();
    } catch {
      toast.error('Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-overlay z-50">
      <div className="sheet-safe-bar" aria-hidden="true" />
      <div className="sheet-stage">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="sheet-panel relative max-w-lg mx-auto" style={{ background: GROUND, color: INK, border: `2px solid ${INK}` }}>
          <div data-testid="sheet-header" className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `2px solid ${INK}` }}>
            <div>
              <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>{plan.plan_date}</p>
              <h2 className="text-base font-800">{plan.day_type}</h2>
            </div>
            <button type="button" aria-label="Close workout" onClick={onClose} className="min-h-11 min-w-11 text-sm font-800">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {groups.map(group => (
              <section key={group.name} style={{ border: `2px solid ${INK}` }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ background: INK, color: GROUND }}>
                  <p className="text-xs font-800">{group.name}</p>
                  <button
                    type="button"
                    aria-label={`Guidance for ${group.name}`}
                    onClick={() => openGuidance(group.rows[0].exerciseId, group.name)}
                    className="min-h-11 min-w-11 text-[11px] font-800"
                  >
                    Info
                  </button>
                </div>
                {group.rows.map(row => (
                  <div key={row.key} className="px-3 py-3 space-y-2" style={{ borderTop: `2px solid rgba(32,30,29,0.15)`, background: PANEL }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-800 uppercase">{row.setType}</p>
                      <p className="text-[11px]" style={{ color: MUTED }}>{row.targetLabel}{row.rirLabel ? ` · ${row.rirLabel}` : ''}</p>
                    </div>
                    {row.restSeconds != null && (
                      <p className="text-[11px] font-800" aria-label="Rest timer">Rest {row.restSeconds}s</p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                        Reps
                        <input
                          aria-label={`Set ${row.setNumber} reps`}
                          inputMode="numeric"
                          value={row.draft.reps}
                          onChange={event => updateDraft(row.key, { reps: event.target.value })}
                          className="mt-1 w-full min-h-11 px-2 text-sm"
                          style={{ border: `2px solid ${INK}`, background: GROUND }}
                        />
                      </label>
                      <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                        Kg
                        <input
                          aria-label={`Set ${row.setNumber} weight`}
                          inputMode="decimal"
                          value={row.draft.weight}
                          onChange={event => updateDraft(row.key, { weight: event.target.value })}
                          className="mt-1 w-full min-h-11 px-2 text-sm"
                          style={{ border: `2px solid ${INK}`, background: GROUND }}
                        />
                      </label>
                      <label className="text-[10px] font-800 uppercase" style={{ color: MUTED }}>
                        RPE
                        <input
                          aria-label={`Set ${row.setNumber} rpe`}
                          inputMode="decimal"
                          value={row.draft.rpe}
                          onChange={event => updateDraft(row.key, { rpe: event.target.value })}
                          className="mt-1 w-full min-h-11 px-2 text-sm"
                          style={{ border: `2px solid ${INK}`, background: GROUND }}
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setLogged(current => ({ ...current, [row.key]: true }))}
                        className="min-h-11 flex-1 text-sm font-800"
                        style={{ background: logged[row.key] ? INK : GROUND, color: logged[row.key] ? GROUND : INK, border: `2px solid ${INK}` }}
                      >
                        {logged[row.key] ? `Logged set ${row.setNumber}` : `Log set ${row.setNumber}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkipped(current => ({ ...current, [row.key]: !current[row.key] }))}
                        className="min-h-11 px-3 text-sm font-800"
                        style={{ border: `2px solid ${INK}` }}
                      >
                        {skipped[row.key] ? 'Skipped' : `Skip set ${row.setNumber}`}
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => addSet(group.name)} className="w-full min-h-11 text-[11px] font-800" style={{ borderTop: `2px solid ${INK}` }}>
                  Add set
                </button>
              </section>
            ))}
            <button type="button" onClick={openPicker} className="w-full min-h-11 text-sm font-800" style={{ border: `2px solid ${INK}` }}>
              Add exercise
            </button>
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
                    onClick={() => addExercise(exercise)}
                    className="w-full min-h-11 px-3 text-left text-sm font-800"
                  >
                    {exercise.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 pt-3" style={{ borderTop: `2px solid ${INK}`, paddingBottom: 'max(0.75rem, var(--sab))' }}>
            <button type="button" onClick={save} disabled={saving} className="w-full min-h-11 text-sm font-800" style={{ background: INK, color: GROUND }}>
              {saving ? 'Saving…' : 'Save workout'}
            </button>
          </div>
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
