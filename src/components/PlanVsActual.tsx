import { cardioTargetLabel, loggedSetLabel, repsLabel, setOutcome, targetWeightLabel, type PlanTarget } from '@/lib/planMath';
import type { ComparedExercise, PlanComparison } from '@/services/plans';

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const PANEL = '#eae9e9';
const ACCENT_DEEP = '#ae1800';
const MUTED = 'rgba(32,30,29,0.55)';
const RULE = 'rgba(32,30,29,0.15)';

function CardioRow({ exercise }: { exercise: ComparedExercise }) {
  const cardio = exercise.cardio;
  if (!cardio) return null;
  const actual = cardio.actual;
  const done = actual != null;
  return (
    <div className="px-3 py-2.5" style={{ background: PANEL, borderTop: `2px solid ${RULE}` }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-800 uppercase">cardio{cardio.label ? ` · ${cardio.label}` : ''}</p>
        <p className="text-[11px] font-800 uppercase" style={{ color: done ? ACCENT_DEEP : MUTED }}>{done ? 'done' : 'skipped'}</p>
      </div>
      <p className="text-sm mt-1 nums">Target {cardioTargetLabel(cardio) || 'open'}</p>
      <p className="text-sm nums" style={{ color: MUTED }}>
        {actual
          ? `Actual ${actual.minutes ?? '—'} min${actual.calories != null ? ` · ${actual.calories} kcal` : ''}${actual.label ? ` · ${actual.label}` : ''}`
          : 'Actual skipped'}
      </p>
    </div>
  );
}

export default function PlanVsActual({ comparison }: { comparison: PlanComparison }) {
  return (
    <section aria-label="Planned versus actual" className="space-y-2">
      <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>
        Planned vs actual · {comparison.day_type}
      </p>
      {comparison.exercises.map(exercise => (
        <div key={`${exercise.position}-${exercise.name}`} style={{ border: `2px solid ${INK}` }}>
          <p className="px-3 py-2 text-xs font-800" style={{ background: INK, color: GROUND }}>{exercise.name}</p>
          <CardioRow exercise={exercise} />
          {exercise.sets.map(set => {
            const measure = exercise.measure ?? 'reps';
            const outcome = setOutcome(set as PlanTarget, set.actual, exercise.load_type, measure);
            const tone = outcome === 'hit' ? ACCENT_DEEP : MUTED;
            const weightLabel = targetWeightLabel(set.target_weight_kg, exercise.load_type);
            return (
              <div key={set.id} className="px-3 py-2.5" style={{ background: PANEL, borderTop: `2px solid ${RULE}` }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-800 uppercase">{set.set_type} · set {set.set_number}</p>
                  <p className="text-[11px] font-800 uppercase" style={{ color: tone }}>{outcome}</p>
                </div>
                <p className="text-sm mt-1 nums">
                  Target {repsLabel(set as PlanTarget, measure)}
                  {weightLabel ? ` · ${weightLabel}` : ''}
                  {set.target_rir_max != null ? ` · RIR ${set.target_rir_min ?? set.target_rir_max}–${set.target_rir_max}` : ''}
                </p>
                <p className="text-sm nums" style={{ color: MUTED }}>
                  {set.actual
                    ? `Actual ${loggedSetLabel(set.actual, exercise.load_type)}${set.actual.rpe != null ? ` · RPE ${set.actual.rpe}` : ''}`
                    : 'Actual skipped'}
                </p>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
