import { format } from 'date-fns';
import type { PlanSummary } from '@/services/plans';

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const PANEL = '#eae9e9';
const MUTED = 'rgba(32,30,29,0.55)';

export default function PlanListSheet({
  plans,
  today,
  onClose,
  onOpen,
}: {
  plans: PlanSummary[];
  today: string;
  onClose: () => void;
  onOpen: (plan: PlanSummary) => void;
}) {
  const upcoming = plans.filter(plan => plan.plan_date >= today);
  const past = plans.filter(plan => plan.plan_date < today).slice().reverse();
  return (
    <div className="sheet-overlay z-50">
      <div className="sheet-safe-bar" aria-hidden="true" />
      <div className="sheet-stage">
        <button type="button" aria-label="Close plans" className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="sheet-panel relative max-w-lg mx-auto" style={{ background: GROUND, color: INK, border: `2px solid ${INK}` }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `2px solid ${INK}` }}>
            <h2 className="text-base font-800">Plans</h2>
            <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm font-800">Close</button>
          </div>
          <div className="overflow-y-auto px-4 py-4 space-y-4">
            <PlanGroup title="Upcoming" plans={upcoming} onOpen={onOpen} />
            <PlanGroup title="Past" plans={past} onOpen={onOpen} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanGroup({ title, plans, onOpen }: { title: string; plans: PlanSummary[]; onOpen: (plan: PlanSummary) => void }) {
  return (
    <section>
      <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-2" style={{ color: MUTED }}>{title}</p>
      {plans.length === 0 ? (
        <p className="text-sm" style={{ color: MUTED }}>None</p>
      ) : plans.map(plan => (
        <button
          key={plan.id}
          type="button"
          onClick={() => onOpen(plan)}
          className="w-full min-h-11 mb-2 px-3 py-2 text-left"
          style={{ border: `2px solid ${INK}`, background: PANEL }}
        >
          <p className="text-sm font-800">{plan.day_type}</p>
          <p className="text-[11px]" style={{ color: MUTED }}>
            {format(new Date(plan.plan_date + 'T12:00:00'), 'EEE, MMM d')} · {plan.exercise_count} exercises · {plan.status.replace('_', ' ')}
          </p>
        </button>
      ))}
    </section>
  );
}
