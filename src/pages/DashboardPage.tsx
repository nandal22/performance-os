import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from '@/hooks/useAuth';
import { activitiesService } from '@/services/activities';
import { bodyMetricsService } from '@/services/bodyMetrics';
import type { Activity, BodyMetric, WorkoutCategory } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Dumbbell, Plus, ChevronRight, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LogWorkoutSheet from '@/components/LogWorkoutSheet';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import WeekStrip from '@/components/WeekStrip';
import { sessionsThisWeekCount } from '@/lib/week';

const MODERNIST = {
  ground: '#f3f2f2',
  ink: '#201e1d',
  accent: '#ec3013',
  accentTint: '#ffe0d9',
  accentDeep: '#ae1800',
  panel: '#eae9e9',
};

const DRAFT_KEY = 'perf-os-draft';

interface DraftMeta { loggedSets: unknown[]; savedAt: number }

function readDraft(): DraftMeta | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d: DraftMeta = JSON.parse(raw);
    if (Date.now() - d.savedAt > 86400000) { localStorage.removeItem(DRAFT_KEY); return null; }
    return d.loggedSets.length > 0 ? d : null;
  } catch { return null; }
}

const TYPE_CONFIG: Record<WorkoutCategory, { mark: string }> = {
  gym:          { mark: 'GYM' },
  cult_session: { mark: 'CULT' },
  swimming:     { mark: 'SWIM' },
  run:          { mark: 'RUN' },
};

const SUB_TYPE_LABEL: Record<string, string> = {
  burn: 'Burn',
  strength: 'Strength',
  hrx: 'HRX',
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 28 } },
};

function activityTitle(activity: Activity) {
  if (activity.type === 'cult_session' && activity.sub_type) {
    return `Cult Session · ${SUB_TYPE_LABEL[activity.sub_type] ?? activity.sub_type}`;
  }
  const labels: Record<WorkoutCategory, string> = {
    gym: 'Gym', cult_session: 'Cult Session', swimming: 'Swimming', run: 'Run',
  };
  return labels[activity.type];
}

function activityMeta(activity: Activity) {
  const kcal = (activity.structured_metrics?.calorieEstimate as { calories?: number } | undefined)?.calories;
  return {
    title: activityTitle(activity),
    detail: activity.tags?.length ? activity.tags.slice(0, 2).join(' · ') : null,
    kcal,
  };
}

export default function DashboardPage() {
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [latestWeight,     setLatestWeight]     = useState<BodyMetric | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [showSheet,        setShowSheet]        = useState(false);
  const [resumingDraft,    setResumingDraft]    = useState(false);
  const [selectedId,       setSelectedId]       = useState<string | null>(null);
  const [draft,            setDraft]            = useState<DraftMeta | null>(readDraft);
  const [selectedDay,      setSelectedDay]      = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [activities, metrics] = await Promise.all([
        activitiesService.getAll(80),
        bodyMetricsService.getAll(1),
      ]);
      setRecentActivities(activities);
      setLatestWeight(metrics[0] ?? null);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const thisWeekCount = sessionsThisWeekCount(recentActivities);
  const lastSession = recentActivities[0] ?? null;

  const dayFiltered = useMemo(() => {
    if (!selectedDay) return recentActivities;
    return recentActivities.filter(a => a.date === selectedDay);
  }, [recentActivities, selectedDay]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: MODERNIST.ground, color: MODERNIST.ink }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 px-4 pt-safe pb-4 flex items-center justify-between"
        style={{ background: MODERNIST.ground, borderBottom: `2px solid ${MODERNIST.ink}66` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center" style={{ border: `2px solid ${MODERNIST.ink}` }}>
            <Dumbbell className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-800 leading-tight tracking-tight">Performance OS</h1>
            <p className="text-[11px]" style={{ color: `${MODERNIST.ink}8c` }}>{format(new Date(), 'EEEE, MMM d')}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="text-xs font-600 px-3 py-1.5"
          style={{ border: `2px solid ${MODERNIST.ink}` }}
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full pb-nav">

        {/* Active workout draft banner */}
        <AnimatePresence>
          {draft && (
            <motion.button
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setResumingDraft(true); setShowSheet(true); }}
              className="w-full flex items-center gap-3 p-4 text-left"
              style={{ border: `2px solid ${MODERNIST.accent}`, background: MODERNIST.accentTint, color: MODERNIST.accentDeep }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-800 uppercase tracking-[0.06em]">In progress · Continue workout</p>
                <p className="text-xs mt-0.5">
                  {draft.loggedSets.length} set{draft.loggedSets.length !== 1 ? 's' : ''} logged
                </p>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Head stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'This week', value: `${thisWeekCount}`, meta: `session${thisWeekCount !== 1 ? 's' : ''}` },
            { label: 'Weight', value: latestWeight?.weight ? `${latestWeight.weight}` : '—', meta: latestWeight ? 'kg' : 'not logged' },
            { label: 'Last session', value: lastSession ? format(new Date(lastSession.date + 'T12:00:00'), 'EEE') : '—', meta: lastSession ? activityTitle(lastSession) : 'none yet' },
          ].map(stat => (
            <div key={stat.label} className="p-3" style={{ border: `2px solid ${MODERNIST.ink}` }}>
              <div className="text-[10px] font-800 uppercase tracking-[0.08em]" style={{ color: `${MODERNIST.ink}8c` }}>{stat.label}</div>
              <div className="text-[22px] font-800 nums leading-tight">{stat.value}</div>
              <div className="text-[11px] truncate" style={{ color: `${MODERNIST.ink}8c` }}>{stat.meta}</div>
            </div>
          ))}
        </div>

        {/* Week strip */}
        <WeekStrip activities={recentActivities} selected={selectedDay} onSelect={setSelectedDay} />

        {/* Weight snapshot */}
        <Link
          to="/weight"
          className="flex items-center gap-3 p-3.5"
          style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}
        >
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${MODERNIST.ink}` }}>
            <Scale className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-800">
              {latestWeight?.weight ? `${latestWeight.weight} kg` : 'Log your weight'}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: `${MODERNIST.ink}8c` }}>
              {latestWeight ? `Last logged ${format(new Date(latestWeight.date), 'MMM d')}` : 'Feeds calorie estimates'}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        </Link>

        {/* Workout history */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-[10px] font-800 uppercase tracking-[0.1em]">
              {selectedDay ? `Sessions · ${format(new Date(selectedDay + 'T12:00:00'), 'MMM d')}` : 'Workout History'}
            </p>
            <div className="flex items-center gap-3">
              {recentActivities.length > 0 && (
                <span className="text-[10px]" style={{ color: `${MODERNIST.ink}8c` }}>
                  {selectedDay ? `${dayFiltered.length} of ${recentActivities.length}` : recentActivities.length}
                </span>
              )}
              {selectedDay && (
                <button onClick={() => setSelectedDay(null)} className="text-[11px] font-800" style={{ color: MODERNIST.accentDeep }}>
                  Clear day filter
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[62px]" style={{ border: `2px solid ${MODERNIST.ink}22` }} />
              ))}
            </div>
          ) : dayFiltered.length === 0 ? (
            <div className="p-10 text-center" style={{ border: `2px dashed ${MODERNIST.ink}55` }}>
              <p className="text-sm" style={{ color: `${MODERNIST.ink}8c` }}>
                {selectedDay ? `Nothing logged on ${format(new Date(selectedDay + 'T12:00:00'), 'MMM d')}.` : 'No workouts yet'}
              </p>
              {!selectedDay && (
                <p className="text-xs mt-1" style={{ color: `${MODERNIST.ink}8c` }}>
                  Tap <strong>+</strong> to log your first workout
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {dayFiltered.map((a, i) => {
                const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.gym;
                const meta = activityMeta(a);
                return (
                  <motion.button
                    key={a.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 + i * 0.03, type: 'spring', stiffness: 380, damping: 28 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedId(a.id)}
                    className="w-full p-3.5 flex items-center gap-3.5 text-left"
                    style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}
                  >
                    <span className="flex-none px-1.5 py-1 text-[10px] font-800 uppercase" style={{ border: `2px solid ${MODERNIST.ink}` }}>
                      {cfg.mark}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-800 truncate">{meta.title}</p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: `${MODERNIST.ink}8c` }}>
                        {format(new Date(a.date + 'T12:00:00'), 'EEE, MMM d')}
                        {a.duration ? ` · ${a.duration}min` : ''}
                        {meta.detail ? ` · ${meta.detail}` : ''}
                      </p>
                    </div>

                    {typeof meta.kcal === 'number' && meta.kcal > 0 && (
                      <span className="text-[11px] font-800 nums px-2 py-1" style={{ border: `2px solid ${MODERNIST.ink}` }}>
                        {Math.round(meta.kcal)} kcal
                      </span>
                    )}

                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>
      </main>

      {/* Floating Action Button */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => { setResumingDraft(false); setShowSheet(true); }}
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))', background: MODERNIST.accent, border: `2px solid ${MODERNIST.ink}` }}
        className="fixed right-5 w-14 h-14 flex items-center justify-center z-30"
        aria-label="Log workout"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 22 }}
      >
        <Plus className="w-6 h-6 relative z-10" style={{ color: MODERNIST.ground }} />
      </motion.button>

      {/* Log Workout Sheet */}
      <LogWorkoutSheet
        open={showSheet}
        autoResume={resumingDraft}
        onClose={() => { setShowSheet(false); setResumingDraft(false); setDraft(readDraft()); }}
        onSuccess={() => { setLoading(true); load(); setDraft(null); setResumingDraft(false); }}
      />

      {/* Workout Detail Sheet */}
      <WorkoutDetailSheet
        activityId={selectedId}
        onClose={() => setSelectedId(null)}
        onDeleted={() => { setSelectedId(null); load(); }}
      />
    </div>
  );
}
