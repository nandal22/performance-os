import { useEffect, useState, useCallback } from 'react';
import { signOut } from '@/hooks/useAuth';
import { activitiesService } from '@/services/activities';
import { bodyMetricsService } from '@/services/bodyMetrics';
import type { Activity, BodyMetric } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Dumbbell, Plus } from 'lucide-react';
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

  const typeColor: Record<string, string> = {
    strength: 'text-blue-400 bg-blue-400/10',
    cardio:   'text-orange-400 bg-orange-400/10',
    sport:    'text-green-400 bg-green-400/10',
    mobility: 'text-purple-400 bg-purple-400/10',
    custom:   'text-gray-400 bg-gray-400/10',
  };

  const typeIcon: Record<string, string> = {
    strength: '💪', cardio: '🏃', sport: '⚽', mobility: '🧘', custom: '⚡',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg px-4 pt-safe pb-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Performance OS</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="text-xs text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6 max-w-lg mx-auto w-full pb-nav">

        {/* Active workout draft banner */}
        {draft && (
          <button
            onClick={() => { setResumingDraft(true); setShowSheet(true); }}
            className="w-full flex items-center gap-3 rounded-2xl bg-primary/10 border border-primary/30 p-4 text-left active:scale-[0.98] transition-transform"
          >
            <span className="text-2xl">💪</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary">Continue Workout</p>
              <p className="text-xs text-muted-foreground">
                {draft.loggedSets.length} set{draft.loggedSets.length !== 1 ? 's' : ''} in progress — tap to resume
              </p>
            </div>
            <span className="text-primary text-lg">›</span>
          </button>
        )}

        {/* Body metrics snapshot */}
        {latestMetric && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Latest Body Metrics · {format(new Date(latestMetric.date), 'MMM d')}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {latestMetric.weight && (
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{latestMetric.weight}</p>
                  <p className="text-xs text-muted-foreground">kg</p>
                </div>
              )}
              {latestMetric.body_fat && (
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{latestMetric.body_fat}%</p>
                  <p className="text-xs text-muted-foreground">body fat</p>
                </div>
              )}
              {latestMetric.waist && (
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{latestMetric.waist}</p>
                  <p className="text-xs text-muted-foreground">cm waist</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Recent Workouts</p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : recentActivities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-3xl mb-2">🏋️</p>
              <p className="text-sm text-muted-foreground">No workouts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tap <strong className="text-white">+</strong> to log your first workout
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivities.map(a => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="w-full rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <span className="text-xl">{typeIcon[a.type] ?? '⚡'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white capitalize truncate">{a.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(a.date + 'T12:00:00'), 'MMM d')} {a.duration ? `· ${a.duration}min` : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${typeColor[a.type]}`}>
                    {a.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Phase indicator */}
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 text-center">
          <p className="text-xs text-primary font-medium mb-1">Phase 3 Active ⚡</p>
          <p className="text-xs text-muted-foreground">History · Goals · Exercise Tracking</p>
        </div>
      </main>

      {/* Floating Action Button — sits above bottom nav */}
      <button
        onClick={() => { setResumingDraft(false); setShowSheet(true); }}
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
        className="fixed right-5 w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform z-30"
        aria-label="Log workout"
      >
        <Plus className="w-6 h-6 text-black" />
      </button>

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
