import { format } from 'date-fns';

const INK = '#201e1d';
const PANEL = '#eae9e9';
const MUTED = 'rgba(32,30,29,0.55)';
const RULE = 'rgba(32,30,29,0.15)';
const ACCENT_DEEP = '#ae1800';

interface SetRecord {
  reps: number;
  weight: number;
  set_number: number;
}

interface Session {
  date: string;
  sets: SetRecord[];
}

interface Props {
  sessions: Session[]; // most recent first, up to last 3
}

function bestSet(sets: SetRecord[]): SetRecord | null {
  return sets.reduce<SetRecord | null>((best, s) => {
    if (s.weight <= 0 && s.reps <= 0) return best;
    if (!best || s.weight > best.weight) return s;
    return best;
  }, null);
}

export default function ExerciseProgressCard({ sessions }: Props) {
  if (sessions.length === 0) return null;

  const [last] = sessions;
  const bestOfRecent = sessions
    .map(session => bestSet(session.sets))
    .reduce<SetRecord | null>((best, s) => (s && (!best || s.weight > best.weight) ? s : best), null);

  return (
    <div className="px-3 py-2 space-y-2" style={{ border: `2px solid ${INK}`, background: PANEL, color: INK }}>
      <div>
        <p className="text-[10px] font-800 uppercase tracking-[0.08em] mb-1" style={{ color: MUTED }}>
          Last time · {format(new Date(last.date + 'T12:00:00'), 'MMM d')}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {last.sets.map((s, i) => (
            <span key={i} className="text-xs font-600 nums">
              S{i + 1}: {s.reps}×{s.weight > 0 ? `${s.weight}kg` : 'BW'}
            </span>
          ))}
        </div>
      </div>
      {bestOfRecent && (
        <div className="pt-1.5" style={{ borderTop: `2px solid ${RULE}` }}>
          <p className="text-[10px] font-800 uppercase tracking-[0.08em] mb-0.5" style={{ color: MUTED }}>
            Best of last {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
          <span className="text-xs font-800 nums" style={{ color: ACCENT_DEEP }}>
            {bestOfRecent.reps}×{bestOfRecent.weight > 0 ? `${bestOfRecent.weight}kg` : 'BW'}
          </span>
        </div>
      )}
    </div>
  );
}
