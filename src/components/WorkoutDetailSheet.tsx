import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ActivityWithSets, StrengthSetWithExercise } from '@/types';
import { activitiesService } from '@/services/activities';

interface Props {
  activityId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

const typeIcon: Record<string, string> = {
  strength: '💪', cardio: '🏃', sport: '⚽', mobility: '🧘', custom: '⚡',
};

export default function WorkoutDetailSheet({ activityId, onClose, onDeleted }: Props) {
  const [activity, setActivity] = useState<ActivityWithSets | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!activityId) { setActivity(null); return; }
    setLoading(true);
    setConfirmDelete(false);
    activitiesService.getById(activityId)
      .then(setActivity)
      .catch(() => toast.error('Failed to load workout'))
      .finally(() => setLoading(false));
  }, [activityId]);

  if (!activityId) return null;

  const sets: StrengthSetWithExercise[] = (activity?.strength_sets ?? [])
    .slice()
    .sort((a, b) => a.set_number - b.set_number);

  // Group by exercise, preserving order of first appearance
  const exerciseOrder: string[] = [];
  const grouped: Record<string, { name: string; sets: StrengthSetWithExercise[] }> = {};
  for (const s of sets) {
    if (!grouped[s.exercise_id]) {
      grouped[s.exercise_id] = { name: s.exercise?.name ?? 'Unknown', sets: [] };
      exerciseOrder.push(s.exercise_id);
    }
    grouped[s.exercise_id].sets.push(s);
  }

  const totalVolume = sets.reduce((sum, s) => sum + (s.volume || 0), 0);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await activitiesService.delete(activityId);
      toast.success('Workout deleted');
      onDeleted();
      onClose();
    } catch {
      toast.error('Failed to delete workout');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-h-[88vh] bg-[#111111] rounded-t-3xl flex flex-col overflow-hidden max-w-lg mx-auto">
        {/* Handle */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-2 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {activity && (
              <>
                <span className="text-xl">{typeIcon[activity.type] ?? '⚡'}</span>
                <div>
                  <h2 className="text-base font-semibold text-white capitalize">{activity.type}</h2>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(activity.date + 'T12:00:00'), 'EEEE, MMM d, yyyy')}
                    {activity.duration ? ` · ${activity.duration} min` : ''}
                  </p>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {activity && (
            <>
              {/* Stats summary */}
              {activity.type === 'strength' && sets.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                    <p className="text-xl font-bold text-white">{sets.length}</p>
                    <p className="text-xs text-muted-foreground">Sets</p>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                    <p className="text-xl font-bold text-white">{Math.round(totalVolume).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">kg total vol.</p>
                  </div>
                </div>
              )}

              {/* Cardio metrics */}
              {activity.cardio_metrics && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Cardio</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {activity.cardio_metrics.distance != null && (
                      <div>
                        <p className="text-lg font-bold text-white">{activity.cardio_metrics.distance}</p>
                        <p className="text-xs text-muted-foreground">km</p>
                      </div>
                    )}
                    {activity.cardio_metrics.avg_heart_rate != null && (
                      <div>
                        <p className="text-lg font-bold text-white">{activity.cardio_metrics.avg_heart_rate}</p>
                        <p className="text-xs text-muted-foreground">avg BPM</p>
                      </div>
                    )}
                    {activity.cardio_metrics.calories != null && (
                      <div>
                        <p className="text-lg font-bold text-white">{activity.cardio_metrics.calories}</p>
                        <p className="text-xs text-muted-foreground">kcal</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Strength sets by exercise */}
              {exerciseOrder.map(exId => (
                <div key={exId} className="rounded-xl border border-white/8 overflow-hidden">
                  <p className="px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 border-b border-white/8">
                    {grouped[exId].name}
                  </p>
                  {grouped[exId].sets.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center px-3 py-2.5 gap-3 border-b border-white/5 last:border-0"
                    >
                      <span className="text-xs text-muted-foreground w-5 flex-shrink-0">S{i + 1}</span>
                      <span className="text-sm text-white flex-1">
                        <span className="font-semibold">{s.reps}</span> reps
                        {s.weight != null && s.weight > 0 && (
                          <> × <span className="font-semibold">{s.weight} kg</span></>
                        )}
                      </span>
                      {s.rpe != null && (
                        <span className="text-xs text-muted-foreground">RPE {s.rpe}</span>
                      )}
                      {s.volume > 0 && (
                        <span className="text-xs text-muted-foreground">{Math.round(s.volume)}kg</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* Notes */}
              {activity.notes && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-white">{activity.notes}</p>
                </div>
              )}

              {/* Delete */}
              <div className="space-y-2 pb-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                    confirmDelete
                      ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                      : 'bg-white/5 border border-white/10 text-muted-foreground hover:text-red-400 hover:border-red-400/30'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to confirm delete' : 'Delete Workout'}
                </button>
                {confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="w-full py-2 text-xs text-muted-foreground hover:text-white text-center"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
