import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Activity } from '@/types';
import { activitiesService } from '@/services/activities';
import { motion } from 'framer-motion';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';

const FILTERS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '3m',  days: 90 },
  { label: 'All', days: 0  },
] as const;

const TYPE_CONFIG: Record<string, { bg: string; icon: string }> = {
  strength: { bg: 'bg-blue-500/10',   icon: '💪' },
  cardio:   { bg: 'bg-orange-500/10', icon: '🏃' },
  sport:    { bg: 'bg-green-500/10',  icon: '⚽' },
  mobility: { bg: 'bg-purple-500/10', icon: '🧘' },
  custom:   { bg: 'bg-slate-500/10',  icon: '⚡' },
};

export default function HistoryPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDays, setFilterDays] = useState<7 | 30 | 90 | 0>(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await activitiesService.getAll(300);
      setActivities(data);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cutoff = filterDays > 0
    ? new Date(Date.now() - filterDays * 86400000).toISOString().slice(0, 10)
    : '2000-01-01';

  const filtered = activities.filter(a => a.date >= cutoff);

  // Group by YYYY-MM
  const byMonth: Record<string, Activity[]> = {};
  for (const a of filtered) {
    const key = a.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(a);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white tracking-tight">History</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">{filtered.length} workouts</p>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">

        {/* Filter tabs */}
        <div className="flex gap-2 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          {FILTERS.map(f => (
            <motion.button
              key={f.days}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterDays(f.days)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors relative`}
            >
              {filterDays === f.days && (
                <motion.div
                  layoutId="filter-active"
                  className="absolute inset-0 rounded-xl bg-primary"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className={`relative z-10 ${filterDays === f.days ? 'text-white' : 'text-muted-foreground'}`}>
                {f.label}
              </span>
            </motion.button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-[62px] rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-dashed border-white/10 p-10 text-center"
          >
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm text-muted-foreground">No workouts in this period</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byMonth)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([month, acts], groupIdx) => (
                <motion.div
                  key={month}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIdx * 0.05, type: 'spring', stiffness: 380, damping: 28 }}
                >
                  {/* Month header */}
                  <div className="flex items-center gap-3 mb-2.5">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                      {format(new Date(month + '-15'), 'MMMM yyyy')}
                    </p>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <span className="text-[10px] text-muted-foreground">{acts.length}</span>
                  </div>

                  <div className="space-y-2">
                    {acts.map((a, i) => {
                      const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.custom;
                      return (
                        <motion.button
                          key={a.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: groupIdx * 0.05 + i * 0.04,
                            type: 'spring', stiffness: 380, damping: 28,
                          }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedId(a.id)}
                          className="w-full rounded-2xl glass p-3.5 flex items-center gap-3.5 text-left"
                        >
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

                          <div className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
          </div>
        )}
      </main>

      <WorkoutDetailSheet
        activityId={selectedId}
        onClose={() => setSelectedId(null)}
        onDeleted={() => { setSelectedId(null); load(); }}
      />
    </div>
  );
}
