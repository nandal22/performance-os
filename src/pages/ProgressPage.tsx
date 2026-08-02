import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Trophy, TrendingUp, ChevronRight, Dumbbell } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import ExerciseProgressCard from '@/components/ExerciseProgressCard';
import ExerciseProgressSheet from '@/components/ExerciseProgressSheet';
import LogWorkoutSheet from '@/components/LogWorkoutSheet';
import type { Exercise, StrengthSet } from '@/types';

const MODERNIST = {
  ground: '#f3f2f2',
  ink: '#201e1d',
  accent: '#ec3013',
  accentTint: '#ffe0d9',
  accentDeep: '#ae1800',
  panel: '#eae9e9',
  muted: 'rgba(32,30,29,0.55)',
  rule: 'rgba(32,30,29,0.15)',
};

const MAIN_LIFTS = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Dumbbell Overhead Press',
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
    if (weight <= 0) continue;
    if (!best || weight > best.weight) {
      best = { weight, reps };
    }
  }
  return best;
}

function bestWeightFromSessions(sessions: SessionStat[]): PR | null {
  let best: PR | null = null;
  for (const session of sessions) {
    for (const set of session.sets) {
      if (set.weight <= 0) continue;
      if (!best || set.weight > best.weight) {
        best = { weight: set.weight, reps: set.reps };
      }
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
  const [historyExercise, setHistoryExercise] = useState<Exercise | null>(null);
  const [logSheetOpen, setLogSheetOpen] = useState(false);

  useEffect(() => {
    exercisesService.getAll()
      .then(setExercises)
      .catch(() => toast.error('Failed to load exercises'))
      .finally(() => setLoadingExercises(false));
  }, []);

  const loadExerciseData = useCallback(async (exercise: Exercise) => {
    setLoadingDetail(true);
    try {
      const rawSets = await strengthSetsService.getByExercise(exercise.id, 500);
      const nextSessions = buildSessions(rawSets);
      setSessions(nextSessions);
      setPR(bestWeightFromSessions(nextSessions) ?? bestFromSets(rawSets));
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
          const rawSets = await strengthSetsService.getByExercise(exercise.id, 500).catch(() => []);
          const liftSessions = buildSessions(rawSets);
          return {
            exercise,
            sessions: liftSessions,
            pr: bestWeightFromSessions(liftSessions) ?? bestFromSets(rawSets),
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
  const totalSets = sessions.reduce((sum, session) => sum + session.totalSets, 0);
  const totalVolume = sessions.reduce((sum, session) => sum + session.totalVolume, 0);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: MODERNIST.ground, color: MODERNIST.ink }}>
      <header
        className="sticky top-0 z-10 px-4 pt-safe pb-4"
        style={{ background: MODERNIST.ground, borderBottom: `2px solid ${MODERNIST.ink}66` }}
      >
        <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-0.5" style={{ color: MODERNIST.muted }}>Main lifts</p>
        <h1 className="text-base font-800 leading-tight tracking-tight">Progress</h1>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full pb-nav">
        <section>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-[10px] font-800 uppercase tracking-[0.1em]">Compound Movement Cards</p>
            <span className="text-[10px]" style={{ color: MODERNIST.muted }}>{mainCards.length}</span>
          </div>

          {loadingCards || loadingExercises ? (
            <div className="space-y-2">
              {[1, 2, 3].map(item => (
                <div key={item} className="h-28" style={{ border: `2px solid ${MODERNIST.ink}22` }} />
              ))}
            </div>
          ) : mainCards.length === 0 ? (
            <div className="p-10 text-center" style={{ border: `2px dashed ${MODERNIST.ink}55` }}>
              <Dumbbell className="w-7 h-7 mx-auto mb-3" style={{ color: MODERNIST.muted }} />
              <p className="text-sm" style={{ color: MODERNIST.muted }}>No compound lifts found yet</p>
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
                    className="w-full p-3.5 text-left"
                    style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${MODERNIST.ink}` }}>
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-800 truncate">{card.exercise.name}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: MODERNIST.muted }}>
                              {card.last ? format(new Date(card.last.date + 'T12:00:00'), 'MMM d') : 'No sessions'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        </div>

                        <div className="grid grid-cols-[1fr_auto] gap-3 mt-3 items-end">
                          <div className="min-w-0">
                            <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MODERNIST.muted }}>Last sets</p>
                            <p className="text-xs truncate nums mt-1">{sessionSetText(card.last)}</p>
                            <p
                              className="text-[11px] font-800 mt-1"
                              style={{
                                color: hasProgress && card.last && card.previous && card.last.maxWeight > card.previous.maxWeight
                                  ? MODERNIST.accentDeep
                                  : MODERNIST.muted,
                              }}
                            >
                              {trendLabel(card)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MODERNIST.muted }}>Max kg PR</p>
                            <p className="text-lg font-800 nums">
                              {card.pr ? card.pr.weight : '--'}
                              <span className="text-[11px] font-600 ml-0.5" style={{ color: MODERNIST.muted }}>kg</span>
                            </p>
                            {card.pr?.reps ? (
                              <p className="text-[10px] nums" style={{ color: MODERNIST.muted }}>{card.pr.reps} reps</p>
                            ) : null}
                          </div>
                        </div>

                        {data.length > 1 && (
                          <div className="h-10 min-w-0 mt-2">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                              <LineChart data={data}>
                                <Line
                                  type="monotone"
                                  dataKey="weight"
                                  stroke={MODERNIST.accent}
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); setHistoryExercise(card.exercise); }}
                          className="text-[11px] font-800 mt-2"
                          style={{ color: MODERNIST.accentDeep }}
                        >
                          Full history →
                        </button>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        <section className="p-3.5" style={{ border: `2px solid ${MODERNIST.ink}` }}>
          <label className="text-[10px] font-800 uppercase tracking-[0.1em] block mb-2">
            Search Any Exercise
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MODERNIST.muted }} />
            <input
              type="search"
              placeholder="Search bench, curl, lateral raise..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full pl-9 pr-3 py-3 text-sm focus:outline-none"
              style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.ground, color: MODERNIST.ink, colorScheme: 'light' }}
            />
          </div>

          {search.trim() && (
            <div className="mt-2 max-h-64 overflow-y-auto">
              {filteredExercises.length > 0 ? filteredExercises.map(exercise => (
                <div
                  key={exercise.id}
                  className="w-full grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-1 py-2.5"
                  style={{ borderBottom: `2px solid ${MODERNIST.rule}` }}
                >
                  <button onClick={() => { setSelectedEx(exercise); setSearch(''); }} className="text-left min-w-0">
                    <span className="text-sm font-600 truncate block">{exercise.name}</span>
                  </button>
                  <span className="text-[11px] capitalize flex-shrink-0" style={{ color: MODERNIST.muted }}>{exercise.category}</span>
                  <button
                    onClick={() => setHistoryExercise(exercise)}
                    className="text-[11px] font-800 flex-shrink-0"
                    style={{ color: MODERNIST.accentDeep }}
                  >
                    History
                  </button>
                </div>
              )) : (
                <div className="py-5 text-center">
                  <p className="text-sm" style={{ color: MODERNIST.muted }}>No matching exercise</p>
                  <Link to="/settings" className="text-xs font-800 mt-2 inline-block" style={{ color: MODERNIST.accentDeep }}>
                    Add it in Settings
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {!selectedEx ? (
            <div className="p-10 text-center" style={{ border: `2px dashed ${MODERNIST.ink}55` }}>
              <TrendingUp className="w-7 h-7 mx-auto mb-3" style={{ color: MODERNIST.muted }} />
              <p className="text-sm" style={{ color: MODERNIST.muted }}>Tap a main lift card or search an exercise.</p>
            </div>
          ) : loadingDetail ? (
            <div className="space-y-2">
              <div className="h-24" style={{ border: `2px solid ${MODERNIST.ink}22` }} />
              <div className="h-48" style={{ border: `2px solid ${MODERNIST.ink}22` }} />
            </div>
          ) : (
            <>
              <div className="p-4" style={{ border: `2px solid ${MODERNIST.accent}`, background: MODERNIST.accentTint }}>
                <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-1" style={{ color: MODERNIST.accentDeep }}>Selected Exercise</p>
                <h2 className="text-lg font-800">{selectedEx.name}</h2>
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Sessions', value: sessions.length },
                    { label: 'Sets', value: totalSets },
                    { label: 'Volume', value: totalVolume.toLocaleString() },
                    { label: 'Max kg', value: pr ? pr.weight : '--' },
                  ].map(item => (
                    <div key={item.label} className="p-2 text-center" style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.ground }}>
                      <p className="text-base font-800 nums">{item.value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: MODERNIST.muted }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="p-10 text-center" style={{ border: `2px dashed ${MODERNIST.ink}55` }}>
                  <p className="text-sm" style={{ color: MODERNIST.muted }}>No sets logged yet for this exercise.</p>
                </div>
              ) : (
                <>
                  <ExerciseProgressCard sessions={sessions.slice(-3).reverse()} />

                  {chartData.length > 1 && (
                    <div className="p-4" style={{ border: `2px solid ${MODERNIST.ink}` }}>
                      <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-3" style={{ color: MODERNIST.muted }}>
                        Max Weight Trend
                      </p>
                      <ResponsiveContainer width="100%" height={180} minWidth={0}>
                        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                          <Line
                            type="monotone"
                            dataKey="weight"
                            stroke={MODERNIST.accent}
                            strokeWidth={2.5}
                            dot={{ fill: MODERNIST.accent, r: 3, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <button
                    onClick={() => selectedEx && setHistoryExercise(selectedEx)}
                    className="text-[11px] font-800 -mt-1"
                    style={{ color: MODERNIST.accentDeep }}
                  >
                    Full history →
                  </button>

                  <div>
                    <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-2.5">Recent Sessions</p>
                    <div className="space-y-2">
                      {sessions.slice().reverse().slice(0, 12).map(session => (
                        <div key={session.date} className="px-3 py-2.5" style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-sm font-800">
                              {format(new Date(session.date + 'T12:00:00'), 'EEE, MMM d')}
                            </p>
                            <p className="text-[11px]" style={{ color: MODERNIST.muted }}>
                              {session.totalSets} sets · {session.maxWeight} kg max
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {session.sets.map((set, index) => (
                              <span
                                key={`${session.date}-${index}`}
                                className="px-2 py-1 text-xs font-600 nums"
                                style={{ border: `2px solid ${MODERNIST.ink}` }}
                              >
                                {set.weight > 0 ? set.weight : 'BW'} × {set.reps}
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

      <ExerciseProgressSheet
        exercise={historyExercise}
        onClose={() => setHistoryExercise(null)}
        onLogSet={() => { setHistoryExercise(null); setLogSheetOpen(true); }}
      />
      <LogWorkoutSheet
        open={logSheetOpen}
        onClose={() => setLogSheetOpen(false)}
        onSuccess={() => setLogSheetOpen(false)}
      />
    </div>
  );
}
