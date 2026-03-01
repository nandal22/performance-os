import { useCallback, useEffect, useState } from 'react';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import type { Exercise } from '@/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ChevronDown, Search } from 'lucide-react';
import { toast } from 'sonner';

interface SessionStat {
  date: string;
  maxWeight: number;
  totalSets: number;
}

interface PR {
  weight: number;
  reps: number;
  estimated_1rm: number;
}

export default function ProgressPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedEx, setSelectedEx] = useState<Exercise | null>(null);
  const [sessions, setSessions] = useState<SessionStat[]>([]);
  const [pr, setPR] = useState<PR | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    exercisesService.getAll().then(setExercises).catch(() => {});
  }, []);

  const loadExerciseData = useCallback(async (ex: Exercise) => {
    setLoading(true);
    try {
      const [rawSets, bestSet] = await Promise.all([
        strengthSetsService.getByExercise(ex.id, 500),
        strengthSetsService.getBestForExercise(ex.id).catch(() => null),
      ]);

      // Group sets by session date
      const byDate: Record<string, SessionStat> = {};
      for (const s of rawSets) {
        const date = ((s as unknown as { activity?: { date: string } }).activity?.date) ?? '';
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { date, maxWeight: 0, totalSets: 0 };
        byDate[date].maxWeight = Math.max(byDate[date].maxWeight, s.weight ?? 0);
        byDate[date].totalSets += 1;
      }

      const sorted = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      setSessions(sorted);

      // Use service result or compute PR from raw sets as fallback
      if (bestSet) {
        setPR(bestSet);
      } else {
        let bestPR: PR | null = null;
        for (const s of rawSets) {
          if (!s.weight || !s.reps) continue;
          const oneRM = s.weight * (1 + s.reps / 30);
          if (!bestPR || oneRM > bestPR.estimated_1rm) {
            bestPR = { weight: s.weight, reps: s.reps, estimated_1rm: Math.round(oneRM) };
          }
        }
        setPR(bestPR);
      }
    } catch {
      toast.error('Failed to load exercise data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEx) {
      loadExerciseData(selectedEx);
    } else {
      setSessions([]);
      setPR(null);
    }
  }, [selectedEx, loadExerciseData]);

  const filteredExercises = exercises
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const chartData = sessions.slice(-20).map(s => ({ date: s.date, weight: s.maxWeight }));
  const totalSets = sessions.reduce((sum, s) => sum + s.totalSets, 0);
  const maxWeight = sessions.length > 0 ? Math.max(...sessions.map(s => s.maxWeight)) : 0;
  const avgSetsPerSession = sessions.length > 0 ? Math.round(totalSets / sessions.length) : 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-white/5 pt-safe px-4 pb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Exercise gains</p>
        <h1 className="text-xl font-bold text-white">Progress</h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-nav px-4 pt-4 space-y-4">
        {/* Exercise picker button */}
        <button
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3.5 text-left active:bg-white/10 transition-colors"
        >
          <span className={`text-sm font-medium ${selectedEx ? 'text-white' : 'text-white/40'}`}>
            {selectedEx ? selectedEx.name : 'Select exercise…'}
          </span>
          <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0 ml-2" />
        </button>

        {/* Empty state */}
        {!selectedEx && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-white/30" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select an exercise to see<br />your progress
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {selectedEx && loading && (
          <div className="space-y-3">
            <div className="h-20 rounded-2xl bg-white/5 animate-pulse" />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
            <div className="h-52 rounded-2xl bg-white/5 animate-pulse" />
          </div>
        )}

        {/* Exercise data */}
        {selectedEx && !loading && sessions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm text-muted-foreground">No sets logged for this exercise yet</p>
          </div>
        )}

        {selectedEx && !loading && sessions.length > 0 && (
          <>
            {/* PR card */}
            {pr && (
              <div className="rounded-2xl bg-primary/10 border border-primary/20 p-4 flex items-center gap-4">
                <div className="text-3xl flex-shrink-0">🏆</div>
                <div className="min-w-0">
                  <p className="text-xs text-primary uppercase tracking-widest mb-0.5">All-time PR</p>
                  <p className="text-2xl font-bold text-white">
                    {pr.weight} kg{' '}
                    <span className="text-base text-white/50 font-normal">× {pr.reps}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Est. 1RM: {Math.round(pr.estimated_1rm)} kg
                  </p>
                </div>
              </div>
            )}

            {/* Stat chips */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                <p className="text-base font-bold text-white">{sessions.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Sessions</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                <p className="text-base font-bold text-white">{totalSets}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Sets</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                <p className="text-base font-bold text-white">{maxWeight}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Max kg</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
                <p className="text-base font-bold text-white">{avgSetsPerSession}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Avg/ses</p>
              </div>
            </div>

            {/* Line chart */}
            {chartData.length > 1 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Weight Progression
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'M/d')}
                      tick={{ fill: 'hsl(220 9% 45%)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: 'hsl(220 9% 45%)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(217 91% 60%)"
                      strokeWidth={2.5}
                      dot={{ fill: 'hsl(217 91% 60%)', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1a1a1a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      labelFormatter={v =>
                        format(new Date(String(v) + 'T12:00:00'), 'MMM d, yyyy')
                      }
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [`${Number(v ?? 0)} kg`, 'Max weight'] as [string, string]}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent sessions */}
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                Recent Sessions
              </p>
              <div className="space-y-1.5">
                {sessions.slice(-8).reverse().map(s => (
                  <div
                    key={s.date}
                    className="rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {format(new Date(s.date + 'T12:00:00'), 'EEE, MMM d')}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.totalSets} sets</p>
                    </div>
                    <p className="text-sm font-bold text-white">
                      {s.maxWeight}{' '}
                      <span className="text-xs text-muted-foreground font-normal">kg</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Exercise picker overlay */}
      {showPicker && (
        <div
          className="fixed inset-0 z-40 bg-black/70 flex items-end"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="w-full max-h-[70vh] bg-[hsl(var(--card))] rounded-t-3xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            <p className="text-sm font-semibold text-white px-4 pb-2">Select Exercise</p>

            <input
              autoFocus
              type="text"
              placeholder="Search…"
              className="mx-4 mb-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-1">
              {filteredExercises.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No exercises found</p>
              ) : (
                filteredExercises.map(ex => (
                  <button
                    key={ex.id}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center justify-between"
                    onClick={() => {
                      setSelectedEx(ex);
                      setShowPicker(false);
                      setSearch('');
                    }}
                  >
                    <span className="text-sm text-white">{ex.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{ex.category}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
