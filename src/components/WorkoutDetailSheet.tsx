import { useEffect, useState } from 'react';
import { X, Trash2, CheckCircle2, CalendarCheck } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ActivityWithSets, CardioCalorieSource, CardioMethod, StrengthSetWithExercise } from '@/types';
import { activitiesService } from '@/services/activities';

interface Props {
  activityId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

interface GuidedMetrics {
  guided_plan?: boolean;
  plan?: {
    day?: number;
    title?: string;
    focus?: string;
  };
  completed?: {
    warmup?: string[];
    stretch?: string[];
    strengthSets?: unknown[];
  };
  calorieEstimate?: {
    calories?: number;
    met?: number;
    method?: string;
    source?: CardioCalorieSource;
    machineCalories?: number | null;
    estimatedCalories?: number | null;
    totalVolumeKg?: number;
  } | null;
  cardio?: {
    method?: CardioMethod;
    methodLabel?: string;
    distanceKm?: number | null;
    avgHeartRate?: number | null;
    bodyWeightKg?: number | null;
  };
  strengthLoad?: {
    sets?: Array<{
      set?: number;
      label?: string;
      effectiveWeight?: number;
    }>;
  };
}

const INK = '#201e1d';
const GROUND = '#f3f2f2';
const PANEL = '#eae9e9';
const ACCENT = '#ec3013';
const ACCENT_TINT = '#ffe0d9';
const ACCENT_DEEP = '#ae1800';
const MUTED = 'rgba(32,30,29,0.55)';
const RULE = 'rgba(32,30,29,0.15)';

const typeIcon: Record<string, string> = {
  gym: '💪', cult_session: '🔥', swimming: '🏊', run: '🏃',
};

const SUB_TYPE_LABELS: Record<string, string> = {
  burn: 'Burn', strength: 'Strength', hrx: 'HRX',
};

const CARDIO_METHOD_LABELS: Record<CardioMethod, string> = {
  running: 'Running',
  swimming: 'Swimming',
  cult_burn: 'Cult Burn',
  cult_hrx: 'Cult HRX',
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
  const metrics = (activity?.structured_metrics ?? {}) as GuidedMetrics;
  const guided = metrics.guided_plan ? metrics : null;
  const calorieEstimate = metrics.calorieEstimate;
  const cardioMethod = metrics.cardio?.method;
  const cardioMethodLabel = metrics.cardio?.methodLabel
    ?? (cardioMethod ? CARDIO_METHOD_LABELS[cardioMethod] : 'Cardio');
  const cardioCalorieSource = calorieEstimate?.source
    ?? (activity?.cardio_metrics?.calories != null ? 'machine' : undefined);
  const cardioCalories = calorieEstimate?.calories ?? activity?.cardio_metrics?.calories;
  const loadDetails = metrics.strengthLoad?.sets ?? [];
  const getLoadLabel = (setNumber: number) => loadDetails.find(item => item.set === setNumber)?.label;

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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="relative w-full max-h-[88vh] flex flex-col overflow-hidden max-w-lg mx-auto"
        style={{ background: GROUND, color: INK, border: `2px solid ${INK}`, boxShadow: '0 12px 32px rgba(45,43,43,0.25)' }}
      >
        {/* Handle */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1" style={{ background: INK }} />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-2 pb-3" style={{ borderBottom: `2px solid ${INK}` }}>
          <div className="flex items-center gap-2.5">
            {loading && <p className="text-sm" style={{ color: MUTED }}>Loading…</p>}
            {activity && (
              <>
                <span className="text-xl">{typeIcon[activity.type] ?? '⚡'}</span>
                <div>
                  <h2 className="text-base font-800 leading-tight tracking-tight capitalize">
                    {activity.type === 'cult_session'
                      ? `Cult Session${activity.sub_type ? ` · ${SUB_TYPE_LABELS[activity.sub_type] ?? activity.sub_type}` : ''}`
                      : activity.type === 'gym' ? 'Gym'
                      : activity.type === 'swimming' ? 'Swimming'
                      : 'Run'}
                  </h2>
                  <p className="text-[11px]" style={{ color: MUTED }}>
                    {format(new Date(activity.date + 'T12:00:00'), 'EEEE, MMM d, yyyy')}
                    {activity.duration ? ` · ${activity.duration} min` : ''}
                  </p>
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-1.5" style={{ color: MUTED }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {activity && (
            <>
              {/* Stats summary */}
              {sets.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 text-center" style={{ border: `2px solid ${INK}` }}>
                    <p className="text-xl font-800 nums">{sets.length}</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>Sets</p>
                  </div>
                  <div className="p-3 text-center" style={{ border: `2px solid ${INK}` }}>
                    <p className="text-xl font-800 nums">{Math.round(totalVolume).toLocaleString()}</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>kg total vol.</p>
                  </div>
                  <div className="p-3 text-center" style={{ border: `2px solid ${ACCENT}`, background: ACCENT_TINT }}>
                    <p className="text-xl font-800 nums">{Math.round(calorieEstimate?.calories ?? 0)}</p>
                    <p className="text-[11px]" style={{ color: ACCENT_DEEP }}>kcal est.</p>
                  </div>
                </div>
              )}

              {/* Cardio metrics */}
              {activity.cardio_metrics && (
                <div className="p-4" style={{ border: `2px solid ${INK}` }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MUTED }}>Cardio</p>
                      <p className="text-sm font-800 mt-1">{cardioMethodLabel}</p>
                    </div>
                    {cardioCalories != null && (
                      <div className="text-right">
                        <p className="text-lg font-800 nums">{cardioCalories}</p>
                        <p className="text-[11px]" style={{ color: MUTED }}>
                          {cardioCalorieSource === 'estimated' ? 'kcal est.' : 'machine kcal'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {activity.cardio_metrics.distance != null && (
                      <div>
                        <p className="text-lg font-800 nums">{activity.cardio_metrics.distance}</p>
                        <p className="text-[11px]" style={{ color: MUTED }}>km</p>
                      </div>
                    )}
                    {activity.cardio_metrics.avg_heart_rate != null && (
                      <div>
                        <p className="text-lg font-800 nums">{activity.cardio_metrics.avg_heart_rate}</p>
                        <p className="text-[11px]" style={{ color: MUTED }}>avg BPM</p>
                      </div>
                    )}
                    {activity.cardio_metrics.calories != null && cardioCalories == null && (
                      <div>
                        <p className="text-lg font-800 nums">{activity.cardio_metrics.calories}</p>
                        <p className="text-[11px]" style={{ color: MUTED }}>kcal</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Guided plan metadata */}
              {guided && (
                <div className="p-4" style={{ border: `2px solid ${INK}`, background: PANEL }}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${INK}` }}>
                      <CalendarCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-800">
                        Day {guided.plan?.day ?? '-'} · {guided.plan?.title ?? 'Guided workout'}
                      </p>
                      {guided.plan?.focus && (
                        <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: MUTED }}>{guided.plan.focus}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Warm-up', value: guided.completed?.warmup?.length ?? 0 },
                      { label: 'Sets', value: guided.completed?.strengthSets?.length ?? sets.length },
                      { label: 'Stretch', value: guided.completed?.stretch?.length ?? 0 },
                    ].map(item => (
                      <div key={item.label} className="p-2 text-center" style={{ border: `2px solid ${INK}`, background: GROUND }}>
                        <CheckCircle2 className="w-4 h-4 mx-auto mb-1" />
                        <p className="text-base font-800 nums">{item.value}</p>
                        <p className="text-[10px]" style={{ color: MUTED }}>{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strength sets by exercise */}
              {exerciseOrder.map(exId => (
                <div key={exId} className="overflow-hidden" style={{ border: `2px solid ${INK}` }}>
                  <p className="px-3 py-2 text-xs font-800" style={{ background: INK, color: GROUND }}>
                    {grouped[exId].name}
                  </p>
                  {grouped[exId].sets.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center px-3 py-2.5 gap-3"
                      style={{ borderTop: i === 0 ? undefined : `2px solid ${RULE}`, background: PANEL }}
                    >
                      <span className="text-xs font-800 w-5 flex-shrink-0" style={{ color: MUTED }}>S{i + 1}</span>
                      <span className="text-sm flex-1 nums">
                        <span className="font-800">{s.reps}</span> reps
                        {s.weight != null && s.weight > 0 && (
                          <> × <span className="font-800">{s.weight} kg</span></>
                        )}
                      </span>
                      {getLoadLabel(s.set_number) && (
                        <span className="text-[10px] max-w-[92px] text-right" style={{ color: MUTED }}>{getLoadLabel(s.set_number)}</span>
                      )}
                      {s.rpe != null && (
                        <span className="text-xs nums" style={{ color: MUTED }}>RPE {s.rpe}</span>
                      )}
                      {s.volume > 0 && (
                        <span className="text-xs nums" style={{ color: MUTED }}>{Math.round(s.volume)}kg</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* Notes */}
              {activity.notes && (
                <div className="p-3" style={{ border: `2px solid ${INK}`, background: PANEL }}>
                  <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-1" style={{ color: MUTED }}>Notes</p>
                  <p className="text-sm">{activity.notes}</p>
                </div>
              )}

              {/* Delete */}
              <div className="space-y-2 pb-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full py-2.5 text-sm font-800 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={
                    confirmDelete
                      ? { border: `2px solid ${ACCENT}`, background: ACCENT, color: GROUND }
                      : { border: `2px solid ${INK}`, color: INK }
                  }
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to confirm delete' : 'Delete Workout'}
                </button>
                {confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="w-full py-2 text-xs font-800 text-center"
                    style={{ color: MUTED }}
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
