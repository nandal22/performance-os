import { useEffect, useState } from 'react';
import { X, Star } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { strengthSetsService } from '@/services/strengthSets';
import { exercisesService } from '@/services/exercises';

interface Props {
  exercise: { id: string; name: string } | null;
  onClose: () => void;
  onTrackToggle?: (id: string, tracked: boolean) => void;
  onLogSet?: (exercise: { id: string; name: string }) => void;
}

interface SessionData {
  date: string;
  maxWeight: number;
  totalSets: number;
  totalReps: number;
  estMax1RM: number;
}

export default function ExerciseProgressSheet({ exercise, onClose, onTrackToggle, onLogSet }: Props) {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loadedExerciseId, setLoadedExerciseId] = useState<string | null>(null);
  const [trackedByExercise, setTrackedByExercise] = useState<Record<string, boolean>>({});
  const tracked = exercise
    ? trackedByExercise[exercise.id] ?? exercisesService.isTracked(exercise.id)
    : false;
  const loading = Boolean(exercise && loadedExerciseId !== exercise.id);

  useEffect(() => {
    if (!exercise) return;
    let cancelled = false;
    strengthSetsService.getByExercise(exercise.id, 300)
      .then(sets => {
        const byDate: Record<string, { weights: number[]; reps: number[] }> = {};
        for (const s of sets) {
          const date = ((s as unknown as { activity?: { date: string } }).activity?.date) ?? '';
          if (!date) continue;
          if (!byDate[date]) byDate[date] = { weights: [], reps: [] };
          if (s.weight) byDate[date].weights.push(s.weight);
          if (s.reps) byDate[date].reps.push(s.reps);
        }
        const result: SessionData[] = Object.entries(byDate)
          .map(([date, d]) => {
            const maxWeight = d.weights.length > 0 ? Math.max(...d.weights) : 0;
            const maxReps = d.reps.length > 0 ? Math.max(...d.reps) : 0;
            return {
              date,
              maxWeight,
              totalSets: d.weights.length,
              totalReps: d.reps.reduce((a, b) => a + b, 0),
              estMax1RM: maxWeight > 0 && maxReps > 0
                ? Math.round(maxWeight * (1 + maxReps / 30))
                : 0,
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));
        if (!cancelled) {
          setSessions(result);
          setLoadedExerciseId(exercise.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([]);
          setLoadedExerciseId(exercise.id);
          toast.error('Failed to load progress');
        }
      });
    return () => { cancelled = true; };
  }, [exercise]);

  if (!exercise) return null;

  const handleToggleTracked = () => {
    const newTracked = exercisesService.toggleTracked(exercise.id);
    setTrackedByExercise(prev => ({ ...prev, [exercise.id]: newTracked }));
    onTrackToggle?.(exercise.id, newTracked);
    toast.success(newTracked ? 'Exercise tracked ⭐' : 'Removed from tracked');
  };

  const chartData = sessions.slice(-20).map(s => ({
    date: format(new Date(s.date + 'T12:00:00'), 'M/d'),
    weight: s.maxWeight,
    oneRM: s.estMax1RM,
  }));

  const bestWeight = sessions.length > 0 ? Math.max(...sessions.map(s => s.maxWeight)) : 0;
  const ordered = sessions.slice().reverse(); // newest first
  const latest = ordered[0] ?? null;
  const previous = ordered[1] ?? null;
  const prTrend = latest && previous
    ? latest.maxWeight > previous.maxWeight
      ? `+${(latest.maxWeight - previous.maxWeight).toFixed(1)} kg on the last PR`
      : `Holding at ${bestWeight} kg`
    : latest ? 'First logged session' : '';

  const INK = '#201e1d';
  const GROUND = '#f3f2f2';
  const MUTED = 'rgba(32,30,29,0.55)';
  const RULE = 'rgba(32,30,29,0.15)';

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="relative w-full md:max-w-[620px] max-h-[90vh] flex flex-col overflow-hidden max-w-lg mx-auto"
        style={{ background: GROUND, color: INK, border: `2px solid ${INK}`, boxShadow: '0 12px 32px rgba(45,43,43,0.25)' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 pt-4 pb-3" style={{ borderBottom: `2px solid ${INK}` }}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-800 uppercase tracking-[0.12em]" style={{ color: MUTED }}>Exercise history</p>
            <h2 className="text-2xl font-800 truncate">{exercise.name}</h2>
            <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>
              {latest ? `Last logged ${format(new Date(latest.date + 'T12:00:00'), 'MMM d')}` : 'Not logged yet'}
            </p>
          </div>
          <div className="text-right flex-none">
            <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>Max PR</p>
            <p className="text-xl font-800 nums">{bestWeight > 0 ? `${bestWeight} kg` : '—'}</p>
            {prTrend && <p className="text-[11px]" style={{ color: '#ae1800' }}>{prTrend}</p>}
          </div>
          <div className="flex items-center gap-1 flex-none">
            <button onClick={handleToggleTracked} className="p-1.5" style={{ color: tracked ? '#ae1800' : MUTED }}>
              <Star className="w-4 h-4" fill={tracked ? '#ae1800' : 'none'} />
            </button>
            <button onClick={onClose} className="p-1.5" style={{ color: MUTED }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12" style={{ border: `2px solid ${RULE}` }} />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-10 text-center" style={{ border: `2px dashed ${MUTED}` }}>
              <p className="text-sm" style={{ color: MUTED }}>
                No sets logged for {exercise.name} yet. Log one and it starts a history here.
              </p>
            </div>
          ) : (
            <>
              {chartData.length > 1 && (
                <div className="p-4" style={{ border: `2px solid ${INK}` }}>
                  <p className="text-[11px] font-800 uppercase tracking-[0.1em] mb-3" style={{ color: MUTED }}>Weight progression</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <Line type="monotone" dataKey="weight" stroke="#ec3013" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        cursor={{ stroke: RULE }}
                        contentStyle={{ background: GROUND, border: `2px solid ${INK}`, borderRadius: 0, fontSize: 12 }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`${Number(v ?? 0)} kg`, 'Max weight'] as [string, string]}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div>
                <p className="text-[11px] font-800 uppercase tracking-[0.1em] mb-2" style={{ color: MUTED }}>Recent sessions</p>
                <div className="space-y-1.5">
                  {ordered.slice(0, 10).map((s, i) => (
                    <div key={s.date} className="px-3 py-2.5" style={{ border: `2px solid ${INK}`, background: '#eae9e9' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-800">{format(new Date(s.date + 'T12:00:00'), 'MMM d, yyyy')}</p>
                          {i === 0 && (
                            <span className="px-1.5 py-0.5 text-[9px] font-800 uppercase" style={{ background: INK, color: GROUND }}>
                              Latest
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: MUTED }}>
                          Top set {s.maxWeight} kg · {s.totalReps.toLocaleString()} kg volume
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: s.totalSets }).map((_, idx) => (
                          <span key={idx} className="px-2 py-1 text-xs font-600 nums" style={{ border: `2px solid ${INK}` }}>
                            {s.maxWeight} × {Math.round(s.totalReps / Math.max(s.totalSets, 1))}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-2 px-4 py-3" style={{ borderTop: `2px solid ${INK}` }}>
          <button
            onClick={() => onLogSet?.(exercise)}
            className="h-11 flex-1 px-4 text-sm font-800 text-left"
            style={{ background: INK, color: GROUND, border: `2px solid ${INK}` }}
          >
            Log a set for this
          </button>
          <button onClick={onClose} className="h-11 px-4 text-sm font-800" style={{ border: `2px solid ${INK}` }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
