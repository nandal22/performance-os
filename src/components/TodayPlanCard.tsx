import { estimatePlanCalories } from '@/lib/planMath';
import type { PlanSummary } from '@/services/plans';

const INK = '#201e1d';
const ACCENT = '#ec3013';
const ACCENT_TINT = '#ffe0d9';
const ACCENT_DEEP = '#ae1800';
const MUTED = 'rgba(32,30,29,0.55)';

export default function TodayPlanCard({
  plan,
  onStart,
  onBrowse,
  bodyWeightKg = null,
}: {
  plan: PlanSummary;
  bodyWeightKg?: number | null;
  onStart: () => void;
  onBrowse: () => void;
}) {
  const starting = plan.status === 'planned' || plan.status === 'in_progress';
  const kcal = estimatePlanCalories(plan.planned, bodyWeightKg);
  const cardio = plan.planned.filter(item => item.is_cardio).length;
  const strength = plan.exercise_count - cardio;
  return (
    <section data-testid="today-plan" className="p-4" style={{ border: `2px solid ${INK}`, background: ACCENT_TINT }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: ACCENT_DEEP }}>
            {plan.plan_date} · {plan.status.replace('_', ' ')}
          </p>
          <h2 className="text-lg font-800 leading-tight mt-1">{plan.day_type}</h2>
          {plan.title && <p className="text-sm mt-0.5">{plan.title}</p>}
          <p className="text-[11px] mt-1" style={{ color: MUTED }}>
            {strength} exercise{strength === 1 ? '' : 's'}{cardio > 0 ? ` + ${cardio} cardio` : ''}
            {kcal != null && <> · <span data-testid="plan-kcal" className="font-800 nums" style={{ color: INK }}>≈ {kcal} kcal est.</span></>}
          </p>
        </div>
        <button
          type="button"
          onClick={onBrowse}
          className="min-h-11 px-3 text-[11px] font-800"
          style={{ border: `2px solid ${INK}` }}
        >
          All plans
        </button>
      </div>
      {starting && (
        <button
          type="button"
          onClick={onStart}
          className="mt-3 w-full min-h-11 text-sm font-800"
          style={{ background: ACCENT, color: '#f3f2f2', border: `2px solid ${INK}` }}
        >
          {plan.status === 'in_progress' ? 'Continue' : 'Start'}
        </button>
      )}
    </section>
  );
}
