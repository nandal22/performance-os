import { repsLabel, setOutcome, type PlanTarget } from '@/lib/planMath';
import type { PlanComparison } from '@/services/plans';

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const PANEL = '#eae9e9';
const ACCENT_DEEP = '#ae1800';
const MUTED = 'rgba(32,30,29,0.55)';

export default function PlanVsActual({ comparison }: { comparison: PlanComparison }) {
  return (
    <section aria-label="Planned versus actual" className="space-y-2">
      <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>
        Planned vs actual · {comparison.day_type}
      </p>
      {comparison.exercises.map(exercise => (
        <div key={`${exercise.position}-${exercise.name}`} style={{ border: `2px solid ${INK}` }}>
          <p className="px-3 py-2 text-xs font-800" style={{ background: INK, color: GROUND }}>{exercise.name}</p>
          {exercise.sets.map(set => {
            const outcome = setOutcome(set as PlanTarget, set.actual);
            const tone = outcome === 'hit' ? ACCENT_DEEP : MUTED;
            return (
              <div key={set.id} className="px-3 py-2.5" style={{ background: PANEL, borderTop: `2px solid rgba(32,30,29,0.15)` }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-800 uppercase">{set.set_type} · set {set.set_number}</p>
                  <p className="text-[11px] font-800 uppercase" style={{ color: tone }}>{outcome}</p>
                </div>
                <p className="text-sm mt-1 nums">
                  Target {repsLabel(set)}
                  {set.target_weight_kg != null ? ` · ${Number(set.target_weight_kg)} kg` : ''}
                  {set.target_rir_max != null ? ` · RIR ${set.target_rir_min ?? set.target_rir_max}–${set.target_rir_max}` : ''}
                </p>
                <p className="text-sm nums" style={{ color: MUTED }}>
                  {set.actual
                    ? `Actual ${set.actual.reps} reps${set.actual.weight != null ? ` · ${set.actual.weight} kg` : ''}${set.actual.rpe != null ? ` · RPE ${set.actual.rpe}` : ''}`
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
