import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Trophy, TrendingUp, ChevronRight, Dumbbell } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import type { Exercise, StrengthSet } from '@/types';

const MAIN_LIFTS = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Romanian Deadlift',
  'Incline Bench Press',
  'Pull-up',
  'Leg Press',
  'Hip Thrust',
];

interface SetRecord {
  weight: number;
  reps: number;
  set_number: number;
}

interface SessionStat {
  date: string;
  maxWeight: number;
  totalVolume: number;
  totalSets: number;
  sets: SetRecord[];
}

interface PR {
  weight: number;
  reps: number;
  estimated_1rm: number;
}

interface MainLiftCard {
  exercise: Exercise;
  sessions: SessionStat[];
  pr: PR | null;
  last: SessionStat | null;
  previous: SessionStat | null;
}

type StrengthSetWithActivity = StrengthSet & { activity?: { date?: string } | null };

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function estimateOneRm(weight: number, reps: number) {
  return reps > 0 ? weight * (1 + reps / 30) : weight;
}

function buildSessions(rawSets: StrengthSet[]): SessionStat[] {
  const byDate: Record<string, SessionStat> = {};

  for (const raw of rawSets as StrengthSetWithActivity[]) {
    const date = raw.activity?.date ?? '';
    if (!date) continue;

    if (!byDate[date]) {
      byDate[date] = { date, maxWeight: 0, totalVolume: 0, totalSets: 0, sets: [] };
    }

    const weight = Number(raw.weight ?? 0);
    const reps = Number(raw.reps ?? 0);
    byDate[date].maxWeight = Math.max(byDate[date].maxWeight, weight);
    byDate[date].totalVolume += weight * reps;
    byDate[date].totalSets += 1;
    byDate[date].sets.push({ weight, reps, set_number: raw.set_number ?? 0 });
  }

  return Object.values(byDate)
    .map(session => ({
      ...session,
      totalVolume: Math.round(session.totalVolume),
      sets: session.sets.slice().sort((a, b) => a.set_number - b.set_number),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function bestFromSets(rawSets: StrengthSet[]): PR | null {
  let best: PR | null = null;
  for (const set of rawSets) {
    const weight = Number(set.weight ?? 0);
    const reps = Number(set.reps ?? 0);
    if (weight <= 0 || reps <= 0) continue;
    const estimated = estimateOneRm(weight, reps);
    if (!best || estimated > best.estimated_1rm) {
      best = { weight, reps, estimated_1rm: Math.round(estimated * 10) / 10 };
    }
  }
  return best;
}

function trendLabel(card: MainLiftCard) {
  if (!card.last || !card.previous) return 'First logged';
  const diff = card.last.maxWeight - card.previous.maxWeight;
  if (diff > 0) return `+${diff} kg vs last`;
  if (diff < 0) return `${diff} kg vs last`;
  return 'Same as last';
}

function sessionSetText(session: SessionStat | null) {
  if (!session) return 'No sets yet';
  return session.sets
    .map(set => `${set.weight > 0 ? set.weight : 'BW'}x${set.reps}`)
    .join('  ');
}

export default function ProgressPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [mainCards, setMainCards] = useState<MainLiftCard[]>([]);
  const [selectedEx, setSelectedEx] = useState<Exercise | null>(null);
  const [sessions, setSessions] = useState<SessionStat[]>([]);
  const [pr, setPR] = useState<PR | null>(null);
  const [search, setSearch] = useState('');
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    exercisesService.getAll()
      .then(setExercises)
      .catch(() => toast.error('Failed to load exercises'))
      .finally(() => setLoadingExercises(false));
  }, []);

  const loadExerciseData = useCallback(async (exercise: Exercise) => {
    setLoadingDetail(true);
    try {
      const [rawSets, bestSet] = await Promise.all([
        strengthSetsService.getByExercise(exercise.id, 500),
        strengthSetsService.getBestForExercise(exercise.id).catch(() => null),
      ]);
      setSessions(buildSessions(rawSets));
      setPR(bestSet ?? bestFromSets(rawSets));
    } catch {
      toast.error('Failed to load progress');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEx) {
      setSessions([]);
      setPR(null);
      return;
    }
    void loadExerciseData(selectedEx);
  }, [selectedEx, loadExerciseData]);

  useEffect(() => {
    if (exercises.length === 0) {
      setMainCards([]);
      setLoadingCards(false);
      return;
    }

    const loadMainLifts = async () => {
      setLoadingCards(true);
      try {
        const matched = MAIN_LIFTS
          .map(name => exercises.find(ex => normalize(ex.name) === normalize(name)))
          .filter((exercise): exercise is Exercise => Boolean(exercise));

        const cards = await Promise.all(matched.map(async exercise => {
          const [rawSets, bestSet] = await Promise.all([
            strengthSetsService.getByExercise(exercise.id, 500).catch(() => []),
            strengthSetsService.getBestForExercise(exercise.id).catch(() => null),
          ]);
          const liftSessions = buildSessions(rawSets);
          return {
            exercise,
            sessions: liftSessions,
            pr: bestSet ?? bestFromSets(rawSets),
            last: liftSessions.length ? liftSessions[liftSessions.length - 1] : null,
            previous: liftSessions.length > 1 ? liftSessions[liftSessions.length - 2] : null,
          };
        }));

        setMainCards(cards);
      } catch {
        toast.error('Failed to load main lifts');
      } finally {
        setLoadingCards(false);
      }
    };

    void loadMainLifts();
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return exercises
      .filter(ex => ex.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [exercises, search]);

  const chartData = sessions.slice(-20).map(session => ({
    date: session.date,
    weight: session.maxWeight,
  }));
  const lastSession = sessions.length ? sessions[sessions.length - 1] : null;
  const totalSets = sessions.reduce((sum, session) => sum + session.totalSets, 0);
  const totalVolume = sessions.reduce((sum, session) => sum + session.totalVolume, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Main lifts</p>
        <h1 className="text-xl font-bold text-white tracking-tight">Progress</h1>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full pb-nav">
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Compound Movement Cards</p>
            <span className="text-[10px] text-muted-foreground">{mainCards.length}</span>
          </div>

          {loadingCards || loadingExercises ? (
            <div className="space-y-2">
              {[1, 2, 3].map(item => (
                <div key={item} className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : mainCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <Dumbbell className="w-7 h-7 text-white/25 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No compound lifts found yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {mainCards.map((card, index) => {
                const data = card.sessions.slice(-8).map(session => ({ date: session.date, weight: session.maxWeight }));
                const hasProgress = card.sessions.length > 1;
                return (
                  <motion.button
                    key={card.exercise.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, type: 'spring', stiffness: 380, damping: 28 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedEx(card.exercise)}
                    className="w-full rounded-2xl glass p-3.5 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Trophy className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{card.exercise.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {card.last ? format(new Date(card.last.date + 'T12:00:00'), 'MMM d') : 'No sessions'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-white/25 flex-shrink-0 mt-0.5" />
                        </div>

                        <div className="grid grid-cols-[1fr_auto] gap-3 mt-3 items-end">
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Last sets</p>
                            <p className="text-xs text-white/75 truncate nums mt-1">{sessionSetText(card.last)}</p>
                            <p className={`text-[11px] mt-1 ${hasProgress && card.last && card.previous && card.last.maxWeight > card.previous.maxWeight ? 'text-emerald-300' : 'text-muted-foreground'}`}>
                              {trendLabel(card)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">PR</p>
                            <p className="text-lg font-bold text-white nums">
                              {card.pr ? Math.round(card.pr.estimated_1rm) : '--'}
                              <span className="text-[11px] font-normal text-white/40 ml-0.5">kg</span>
                            </p>
                          </div>
                        </div>

                        {data.length > 1 && (
                          <div className="h-10 mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={data}>
                                <Line
                                  type="monotone"
                                  dataKey="weight"
                                  stroke="hsl(217 91% 62%)"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl glass p-3.5">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">
            Search Any Exercise
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input
              type="search"
              placeholder="Search bench, curl, lateral raise..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
            />
          </div>

          {search.trim() && (
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {filteredExercises.length > 0 ? filteredExercises.map(exercise => (
                <button
                  key={exercise.id}
                  onClick={() => { setSelectedEx(exercise); setSearch(''); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/[0.06] text-left transition-colors"
                >
                  <span className="text-sm text-white">{exercise.name}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">{exercise.category}</span>
                </button>
              )) : (
                <div className="py-5 text-center">
                  <p className="text-sm text-muted-foreground">No matching exercise</p>
                  <Link to="/settings" className="text-xs text-primary font-semibold mt-2 inline-block">
                    Add it in Settings
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {!selectedEx ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <TrendingUp className="w-7 h-7 text-white/25 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Tap a main lift card or search an exercise.</p>
            </div>
          ) : loadingDetail ? (
            <div className="space-y-2">
              <div className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
              <div className="h-48 rounded-2xl bg-white/[0.04] animate-pulse" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl p-4 border border-primary/20 bg-primary/[0.06]">
                <p className="text-[10px] uppercase tracking-widest text-primary mb-1">Selected Exercise</p>
                <h2 className="text-lg font-bold text-white">{selectedEx.name}</h2>
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Sessions', value: sessions.length },
                    { label: 'Sets', value: totalSets },
                    { label: 'Volume', value: totalVolume.toLocaleString() },
                    { label: 'Est 1RM', value: pr ? Math.round(pr.estimated_1rm) : '--' },
                  ].map(item => (
                    <div key={item.label} className="rounded-xl bg-white/[0.05] border border-white/[0.08] p-2 text-center">
                      <p className="text-base font-bold text-white nums">{item.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                  <p className="text-sm text-muted-foreground">No sets logged yet for this exercise.</p>
                </div>
              ) : (
                <>
                  {lastSession && (
                    <div className="rounded-2xl glass p-4">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                        Last Session · {format(new Date(lastSession.date + 'T12:00:00'), 'EEE, MMM d')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {lastSession.sets.map((set, index) => (
                          <span key={`${lastSession.date}-${index}`} className="px-3 py-1.5 rounded-xl border border-white/[0.1] text-sm font-semibold text-white nums bg-white/[0.05]">
                            {set.weight > 0 ? `${set.weight} kg` : 'BW'} x {set.reps}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {chartData.length > 1 && (
                    <div className="rounded-2xl glass p-4">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                        Max Weight Trend
                      </p>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                          <Line
                            type="monotone"
                            dataKey="weight"
                            stroke="hsl(217 91% 62%)"
                            strokeWidth={2.5}
                            dot={{ fill: 'hsl(217 91% 62%)', r: 3, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2.5">Recent Sessions</p>
                    <div className="space-y-2">
                      {sessions.slice().reverse().slice(0, 12).map(session => (
                        <div key={session.date} className="rounded-xl glass px-3.5 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-white">
                              {format(new Date(session.date + 'T12:00:00'), 'EEE, MMM d')}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {session.totalSets} sets · {session.maxWeight} kg max
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {session.sets.map((set, index) => (
                              <span key={`${session.date}-${index}`} className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-xs font-medium text-white/80 nums">
                                {set.weight > 0 ? set.weight : 'BW'} x {set.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
