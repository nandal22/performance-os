import { useCallback, useEffect, useState } from 'react';
import { exercisesService } from '@/services/exercises';
import { strengthSetsService } from '@/services/strengthSets';
import type { Exercise, ExerciseCategory } from '@/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ChevronDown, Search, Plus, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'cardio', 'mobility', 'other'];

interface SetRecord {
  weight: number;
  reps: number;
  set_number: number;
}

interface SessionStat {
  date: string;
  maxWeight: number;
  totalSets: number;
  sets: SetRecord[];
}

interface PR {
  weight: number;
  reps: number;
  estimated_1rm: number;
}

export default function ProgressPage() {
  const [exercises, setExercises]         = useState<Exercise[]>([]);
  const [selectedEx, setSelectedEx]       = useState<Exercise | null>(null);
  const [sessions, setSessions]           = useState<SessionStat[]>([]);
  const [pr, setPR]                       = useState<PR | null>(null);
  const [loading, setLoading]             = useState(false);
  const [showPicker, setShowPicker]       = useState(false);
  const [search, setSearch]               = useState('');
  const [newExCategory, setNewExCategory] = useState<ExerciseCategory>('push');
  const [creatingEx, setCreatingEx]       = useState(false);
  const [showMore, setShowMore]           = useState(false);

  useEffect(() => {
    exercisesService.getAll().then(setExercises).catch(() => {});
  }, []);

  const loadExerciseData = useCallback(async (ex: Exercise) => {
    setLoading(true);
    setShowMore(false);
    try {
      const [rawSets, bestSet] = await Promise.all([
        strengthSetsService.getByExercise(ex.id, 500),
        strengthSetsService.getBestForExercise(ex.id).catch(() => null),
      ]);

      const byDate: Record<string, SessionStat> = {};
      for (const s of rawSets) {
        const date = ((s as unknown as { activity?: { date: string } }).activity?.date) ?? '';
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { date, maxWeight: 0, totalSets: 0, sets: [] };
        byDate[date].maxWeight = Math.max(byDate[date].maxWeight, s.weight ?? 0);
        byDate[date].totalSets += 1;
        byDate[date].sets.push({ weight: s.weight ?? 0, reps: s.reps ?? 0, set_number: s.set_number ?? 0 });
      }

      for (const stat of Object.values(byDate)) {
        stat.sets.sort((a, b) => a.set_number - b.set_number);
      }

      const sorted = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      setSessions(sorted);

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
      setShowMore(false);
    }
  }, [selectedEx, loadExerciseData]);

  const filteredExercises = exercises
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const canCreate =
    search.trim().length > 1 &&
    !filteredExercises.some(e => e.name.toLowerCase() === search.trim().toLowerCase());

  const handleCreateExercise = async () => {
    setCreatingEx(true);
    try {
      const ex = await exercisesService.createCustom({
        name: search.trim(), category: newExCategory,
        primary_muscle: '', secondary_muscles: [],
      });
      setExercises(prev => [...prev, ex]);
      setSelectedEx(ex);
      setShowPicker(false);
      setSearch('');
      toast.success(`"${ex.name}" added!`);
    } catch {
      toast.error('Failed to create exercise');
    } finally {
      setCreatingEx(false);
    }
  };

  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const chartData = sessions.slice(-20).map(s => ({ date: s.date, weight: s.maxWeight }));
  const totalSets = sessions.reduce((sum, s) => sum + s.totalSets, 0);
  const maxWeight = sessions.length > 0 ? Math.max(...sessions.map(s => s.maxWeight)) : 0;
  const avgSetsPerSession = sessions.length > 0 ? Math.round(totalSets / sessions.length) : 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl border-b border-white/[0.06] pt-safe px-4 pb-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Exercise gains</p>
        <h1 className="text-xl font-bold text-white tracking-tight">Progress</h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-nav px-4 pt-4 space-y-3">

        {/* Exercise picker button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center justify-between rounded-2xl glass px-4 py-3.5 text-left"
        >
          <span className={`text-sm font-medium ${selectedEx ? 'text-white' : 'text-white/35'}`}>
            {selectedEx ? selectedEx.name : 'Select exercise…'}
          </span>
          <ChevronDown className="w-4 h-4 text-white/35 flex-shrink-0 ml-2" />
        </motion.button>

        {/* Empty state */}
        {!selectedEx && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-3xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-white/25" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select an exercise to see<br />your progress
            </p>
          </motion.div>
        )}

        {/* Loading skeleton */}
        {selectedEx && loading && (
          <div className="space-y-3">
            <div className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
            <div className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* No data state */}
        {selectedEx && !loading && sessions.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-white/10 p-10 text-center"
          >
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm text-muted-foreground">No sets logged for this exercise yet</p>
          </motion.div>
        )}

        {selectedEx && !loading && sessions.length > 0 && (
          <>
            {/* PR card — gradient premium feel */}
            {pr && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className="rounded-2xl p-4 flex items-center gap-4 overflow-hidden relative"
                style={{
                  background: 'linear-gradient(135deg, hsl(217 91% 62% / 0.18) 0%, hsl(270 80% 62% / 0.10) 100%)',
                  border: '1px solid hsl(217 91% 62% / 0.25)',
                  boxShadow: '0 0 32px hsl(217 91% 62% / 0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                {/* Background glow orb */}
                <div
                  className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-20"
                  style={{ background: 'radial-gradient(circle, hsl(217 91% 62%) 0%, transparent 70%)' }}
                />
                <div className="text-3xl flex-shrink-0 relative z-10">🏆</div>
                <div className="min-w-0 relative z-10">
                  <p className="text-[10px] text-primary uppercase tracking-widest mb-1">All-time PR</p>
                  <p className="text-3xl font-bold text-white nums leading-none">
                    {pr.weight}<span className="text-base text-white/40 font-normal ml-1">kg</span>
                    <span className="text-xl text-white/50 font-normal ml-2">× {pr.reps}</span>
                  </p>
                  <p className="text-xs text-primary/70 mt-1.5">
                    Est. 1RM · {Math.round(pr.estimated_1rm)} kg
                  </p>
                </div>
              </motion.div>
            )}

            {/* Last session card */}
            {lastSession && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.07, type: 'spring', stiffness: 380, damping: 28 }}
                className="rounded-2xl glass p-4"
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Last Session · {format(new Date(lastSession.date + 'T12:00:00'), 'EEE, MMM d')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {lastSession.sets.map((set, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.12 + i * 0.04, type: 'spring', stiffness: 400, damping: 24 }}
                      className="px-3 py-1.5 rounded-xl border border-white/[0.1] text-sm font-semibold text-white nums"
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                      {set.weight > 0 ? `${set.weight}` : '—'}
                      <span className="text-white/40 font-normal text-xs ml-0.5">kg</span>
                      <span className="text-white/30 mx-1">×</span>
                      <span className="text-white/70">{set.reps}</span>
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Show more / less toggle */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowMore(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl glass text-sm text-muted-foreground hover:text-white transition-colors"
            >
              {showMore ? (
                <><ChevronUp className="w-4 h-4" /> Show less</>
              ) : (
                <><ChevronDown className="w-4 h-4" /> Show all {sessions.length} sessions</>
              )}
            </motion.button>

            <AnimatePresence>
              {showMore && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="overflow-hidden space-y-3"
                >
                  {/* Stat chips */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: sessions.length, label: 'Sessions' },
                      { value: totalSets,       label: 'Sets'     },
                      { value: maxWeight,       label: 'Max kg'   },
                      { value: avgSetsPerSession, label: 'Avg/ses' },
                    ].map(({ value, label }) => (
                      <div key={label} className="rounded-xl glass p-2.5 text-center">
                        <p className="text-base font-bold text-white nums">{value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Progressive overload chart */}
                  {chartData.length > 1 && (
                    <div className="rounded-2xl glass p-4">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                        Progressive Overload
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
                            stroke="hsl(217 91% 62%)"
                            strokeWidth={2.5}
                            dot={{ fill: 'hsl(217 91% 62%)', r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                          />
                          <Tooltip
                            contentStyle={{
                              background: 'hsl(220 15% 9%)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                            labelFormatter={v => format(new Date(String(v) + 'T12:00:00'), 'MMM d, yyyy')}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(v: any) => [`${Number(v ?? 0)} kg`, 'Max weight'] as [string, string]}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* All sessions list */}
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2.5">
                      All Sessions
                    </p>
                    <div className="space-y-2">
                      {sessions.slice().reverse().map((s, i) => (
                        <motion.div
                          key={s.date}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 28 }}
                          className="rounded-xl glass px-3.5 py-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-white">
                              {format(new Date(s.date + 'T12:00:00'), 'EEE, MMM d')}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {s.totalSets} sets · {s.maxWeight} kg max
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.sets.map((set, j) => (
                              <span
                                key={j}
                                className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-xs font-medium text-white/80 nums"
                              >
                                {set.weight > 0 ? `${set.weight}` : '—'}
                                <span className="text-white/35 text-[10px]">kg</span>
                                <span className="text-white/25 mx-0.5">×</span>
                                <span className="text-white/60">{set.reps}</span>
                              </span>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Exercise picker overlay */}
      <AnimatePresence>
        {showPicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowPicker(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[72vh] rounded-t-3xl flex flex-col"
              style={{ background: 'hsl(220 15% 9%)', borderTop: '1px solid rgba(255,255,255,0.08)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              <p className="text-sm font-semibold text-white px-4 pb-2 flex-shrink-0">Select Exercise</p>

              <input
                autoFocus
                type="text"
                placeholder="Search…"
                className="mx-4 mb-2 flex-shrink-0 glass rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <div className="flex-1 overflow-y-auto px-4 space-y-0.5 min-h-0">
                {filteredExercises.map(ex => (
                  <motion.button
                    key={ex.id}
                    whileTap={{ scale: 0.98 }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.05] flex items-center justify-between transition-colors"
                    onClick={() => { setSelectedEx(ex); setShowPicker(false); setSearch(''); }}
                  >
                    <span className="text-sm text-white">{ex.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{ex.category}</span>
                  </motion.button>
                ))}
                {filteredExercises.length === 0 && !canCreate && (
                  <p className="text-sm text-muted-foreground text-center py-6">No exercises found</p>
                )}
              </div>

              {/* Inline create */}
              {canCreate && (
                <div className="px-4 pt-3 pb-6 border-t border-white/[0.08] space-y-2.5 flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Create new</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map(cat => (
                      <motion.button
                        key={cat}
                        whileTap={{ scale: 0.93 }}
                        onMouseDown={e => { e.preventDefault(); setNewExCategory(cat); }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                          newExCategory === cat
                            ? 'bg-primary text-white'
                            : 'bg-white/[0.05] text-muted-foreground'
                        }`}
                      >
                        {cat}
                      </motion.button>
                    ))}
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onMouseDown={e => { e.preventDefault(); handleCreateExercise(); }}
                    disabled={creatingEx}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-sm text-primary font-medium disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" />
                    {creatingEx ? 'Creating…' : `Create "${search.trim()}" · ${newExCategory}`}
                  </motion.button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
