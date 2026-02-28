import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Activity } from '@/types';
import { activitiesService } from '@/services/activities';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';

const FILTERS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '3m',  days: 90 },
  { label: 'All', days: 0  },
] as const;

const typeIcon: Record<string, string> = {
  strength: '💪', cardio: '🏃', sport: '⚽', mobility: '🧘', custom: '⚡',
};

const typeColor: Record<string, string> = {
  strength: 'text-blue-400 bg-blue-400/10',
  cardio:   'text-orange-400 bg-orange-400/10',
  sport:    'text-green-400 bg-green-400/10',
  mobility: 'text-purple-400 bg-purple-400/10',
  custom:   'text-gray-400 bg-gray-400/10',
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
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-6 pb-4 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">History</h1>
        <p className="text-xs text-muted-foreground">{filtered.length} workouts</p>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">
        {/* Filter tabs */}
        <div className="flex gap-2">
          {FILTERS.map(f => (
            <button
              key={f.days}
              onClick={() => setFilterDays(f.days)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterDays === f.days
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/5 text-muted-foreground hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm text-muted-foreground">No workouts in this period</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byMonth)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([month, acts]) => (
                <div key={month}>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                    {format(new Date(month + '-15'), 'MMMM yyyy')}
                    <span className="ml-2 normal-case">· {acts.length}</span>
                  </p>
                  <div className="space-y-2">
                    {acts.map(a => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedId(a.id)}
                        className="w-full rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                      >
                        <span className="text-xl">{typeIcon[a.type] ?? '⚡'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white capitalize">{a.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(a.date + 'T12:00:00'), 'EEE, MMM d')}
                            {a.duration ? ` · ${a.duration}min` : ''}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${typeColor[a.type]}`}>
                          {a.type}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
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
