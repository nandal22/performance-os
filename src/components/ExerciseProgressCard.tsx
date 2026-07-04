import { format } from 'date-fns';

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
    <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2 space-y-2">
      <div>
        <p className="text-[10px] text-muted-foreground mb-1">
          Last time · {format(new Date(last.date + 'T12:00:00'), 'MMM d')}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {last.sets.map((s, i) => (
            <span key={i} className="text-xs text-white/70">
              S{i + 1}: {s.reps}×{s.weight > 0 ? `${s.weight}kg` : 'BW'}
            </span>
          ))}
        </div>
      </div>
      {bestOfRecent && (
        <div className="pt-1.5 border-t border-white/5">
          <p className="text-[10px] text-muted-foreground mb-0.5">
            Best of last {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
          <span className="text-xs font-semibold text-primary">
            {bestOfRecent.reps}×{bestOfRecent.weight > 0 ? `${bestOfRecent.weight}kg` : 'BW'}
          </span>
        </div>
      )}
    </div>
  );
}
