import { useEffect, useState, useCallback } from 'react';
import { signOut } from '@/hooks/useAuth';
import { activitiesService } from '@/services/activities';
import { bodyMetricsService } from '@/services/bodyMetrics';
import type { Activity, BodyMetric } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Dumbbell, Plus, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LogWorkoutSheet from '@/components/LogWorkoutSheet';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';

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

const TYPE_CONFIG: Record<string, { bg: string; icon: string; accent: string }> = {
  strength: { bg: 'bg-blue-500/10',   icon: '💪', accent: 'bg-blue-500' },
  cardio:   { bg: 'bg-orange-500/10', icon: '🏃', accent: 'bg-orange-500' },
  sport:    { bg: 'bg-green-500/10',  icon: '⚽', accent: 'bg-green-500' },
  mobility: { bg: 'bg-purple-500/10', icon: '🧘', accent: 'bg-purple-500' },
  custom:   { bg: 'bg-slate-500/10',  icon: '⚡', accent: 'bg-slate-500' },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 28 } },
};

export default function DashboardPage() {
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [latestMetric,     setLatestMetric]     = useState<BodyMetric | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [showSheet,        setShowSheet]        = useState(false);
  const [resumingDraft,    setResumingDraft]    = useState(false);
  const [selectedId,       setSelectedId]       = useState<string | null>(null);
  const [draft,            setDraft]            = useState<DraftMeta | null>(readDraft);

  const load = useCallback(async () => {
    try {
      const [activities, metrics] = await Promise.all([
        activitiesService.getAll(5),
        bodyMetricsService.getAll(1),
      ]);
      setRecentActivities(activities);
      setLatestMetric(metrics[0] ?? null);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight tracking-tight">Performance OS</h1>
            <p className="text-[11px] text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="text-xs text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03]"
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
              className="w-full flex items-center gap-3 rounded-2xl border border-primary/25 p-4 text-left glow-blue"
              style={{ background: 'linear-gradient(135deg, hsl(217 91% 62% / 0.12) 0%, hsl(217 91% 62% / 0.05) 100%)' }}
            >
              <span className="text-2xl">💪</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary">Continue Workout</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {draft.loggedSets.length} set{draft.loggedSets.length !== 1 ? 's' : ''} in progress
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-primary/70 flex-shrink-0" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Body metrics snapshot */}
        {latestMetric && (
          <motion.div
            variants={fadeUp} initial="hidden" animate="show"
            className="rounded-2xl glass p-4"
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              Latest Body Metrics · {format(new Date(latestMetric.date), 'MMM d')}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {latestMetric.weight && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-white nums">{latestMetric.weight}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">kg</p>
                </div>
              )}
              {latestMetric.body_fat && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-white nums">{latestMetric.body_fat}%</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">body fat</p>
                </div>
              )}
              {latestMetric.waist && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-white nums">{latestMetric.waist}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">cm waist</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Recent workouts */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          style={{ transition: 'none' } as React.CSSProperties}
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 px-0.5">
            Recent Workouts
          </p>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[62px] rounded-2xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : recentActivities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
              <p className="text-3xl mb-2">🏋️</p>
              <p className="text-sm text-muted-foreground">No workouts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tap <strong className="text-white">+</strong> to log your first workout
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivities.map((a, i) => {
                const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.custom;
                return (
                  <motion.button
                    key={a.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 + i * 0.05, type: 'spring', stiffness: 380, damping: 28 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedId(a.id)}
                    className="w-full rounded-2xl glass p-3.5 flex items-center gap-3.5 text-left"
                  >
                    {/* Colored icon container */}
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <span className="text-xl">{cfg.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white capitalize">{a.type}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(a.date + 'T12:00:00'), 'EEE, MMM d')}
                        {a.duration ? ` · ${a.duration}min` : ''}
                      </p>
                    </div>

                    <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Phase indicator */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="show"
          className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 text-center"
        >
          <p className="text-xs text-primary font-medium mb-1">Phase 3 Active ⚡</p>
          <p className="text-[11px] text-muted-foreground">History · Goals · Exercise Tracking</p>
        </motion.div>
      </main>

      {/* Floating Action Button */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => { setResumingDraft(false); setShowSheet(true); }}
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
        className="fixed right-5 w-14 h-14 bg-primary rounded-full flex items-center justify-center z-30"
        aria-label="Log workout"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 22 }}
      >
        <div className="absolute inset-0 rounded-full bg-primary opacity-40 animate-ping" style={{ animationDuration: '2.5s' }} />
        <Plus className="w-6 h-6 text-black relative z-10" />
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
