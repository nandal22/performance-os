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
}

interface SessionData {
  date: string;
  maxWeight: number;
  totalSets: number;
  totalReps: number;
  estMax1RM: number;
}

export default function ExerciseProgressSheet({ exercise, onClose, onTrackToggle }: Props) {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    setTracked(exercisesService.isTracked(exercise.id));
    setLoading(true);
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
        setSessions(result);
      })
      .catch(() => toast.error('Failed to load progress'))
      .finally(() => setLoading(false));
  }, [exercise?.id]);

  if (!exercise) return null;

  const handleToggleTracked = () => {
    const newTracked = exercisesService.toggleTracked(exercise.id);
    setTracked(newTracked);
    onTrackToggle?.(exercise.id, newTracked);
    toast.success(newTracked ? 'Exercise tracked ⭐' : 'Removed from tracked');
  };

  const chartData = sessions.slice(-20).map(s => ({
    date: format(new Date(s.date + 'T12:00:00'), 'M/d'),
    weight: s.maxWeight,
    oneRM: s.estMax1RM,
  }));

  const bestWeight = sessions.length > 0 ? Math.max(...sessions.map(s => s.maxWeight)) : 0;
  const bestOneRM  = sessions.length > 0 ? Math.max(...sessions.map(s => s.estMax1RM)) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-h-[90vh] bg-[#111111] rounded-t-3xl flex flex-col overflow-hidden max-w-lg mx-auto">
        {/* Handle */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-2 pb-3 border-b border-white/5">
          <h2 className="text-base font-semibold text-white flex-1 min-w-0 truncate pr-2">{exercise.name}</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleToggleTracked}
              className={`p-1.5 rounded-lg transition-colors ${tracked ? 'text-yellow-400' : 'text-white/30 hover:text-white/60'}`}
            >
              <Star className={`w-4 h-4 ${tracked ? 'fill-yellow-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm text-muted-foreground">No sets logged for this exercise yet</p>
            </div>
          ) : (
            <>
              {/* Best stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                  <p className="text-lg font-bold text-white">{bestWeight}</p>
                  <p className="text-[10px] text-muted-foreground">Best kg</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                  <p className="text-lg font-bold text-white">{bestOneRM}</p>
                  <p className="text-[10px] text-muted-foreground">Est. 1RM</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                  <p className="text-lg font-bold text-white">{sessions.length}</p>
                  <p className="text-[10px] text-muted-foreground">Sessions</p>
                </div>
              </div>

              {/* Weight progression chart */}
              {chartData.length > 1 && (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Weight Progression</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(217 91% 60%)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'hsl(220 9% 45%)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                        contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`${Number(v ?? 0)} kg`, 'Max weight'] as [string, string]}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recent sessions */}
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Recent Sessions</p>
                <div className="space-y-1.5">
                  {sessions.slice(-10).reverse().map(s => (
                    <div key={s.date} className="flex items-center justify-between rounded-xl bg-white/5 border border-white/8 px-3 py-2.5">
                      <div>
                        <p className="text-sm text-white">{format(new Date(s.date + 'T12:00:00'), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-muted-foreground">{s.totalSets} sets · {s.totalReps} reps</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{s.maxWeight} kg</p>
                        {s.estMax1RM > 0 && (
                          <p className="text-[10px] text-muted-foreground">~{s.estMax1RM} 1RM</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
