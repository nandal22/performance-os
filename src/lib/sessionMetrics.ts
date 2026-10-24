import { calcStrengthCalories } from '@/engines/calorieEngine';
import type { SessionCardio, SessionSet } from '@/lib/workoutSession';

/** The structured_metrics a finished strength session stores, shared by free and plan logging. */
export function strengthSessionMetrics(input: {
  sets: SessionSet[];
  cardio: SessionCardio[];
  bodyWeightKg: number | null;
  durationMins?: number;
}) {
  const { sets, cardio, bodyWeightKg, durationMins } = input;
  const strength = bodyWeightKg
    ? calcStrengthCalories({
        sets: sets.map(set => ({
          reps: set.reps,
          durationSec: set.duration_sec,
          weight: set.weight ?? 0,
          loadMode: set.load_mode,
          bodyweightFactor: set.bodyweight_factor,
          bodyweightKg: set.bodyweight_kg,
        })),
        duration: durationMins && durationMins > 0 ? durationMins : undefined,
      }, bodyWeightKg)
    : null;
  const cardioKcal = cardio.reduce((sum, entry) => sum + (entry.calories ?? 0), 0);
  const calories = ((sets.length > 0 ? strength?.calories ?? 0 : 0) + cardioKcal) || null;
  return {
    strength,
    calories,
    structuredMetrics: {
      calorieEstimate: calories != null ? {
        calories,
        met: strength?.met ?? null,
        method: sets.length > 0 ? strength?.method ?? 'cardio_entries' : 'cardio_entries',
        durationHours: strength?.duration_hrs ?? null,
        activeDurationHours: strength?.active_duration_hrs ?? null,
        totalVolumeKg: strength?.total_volume_kg ?? 0,
        totalReps: strength?.total_reps ?? 0,
        bodyWeightKg,
      } : null,
      strengthLoad: {
        bodyWeightKg,
        sets: sets.map((set, index) => ({
          set: index + 1,
          exerciseId: set.exercise_id,
          exerciseName: set.exercise_name,
          reps: set.reps,
          ...(set.duration_sec != null ? { durationSec: set.duration_sec } : {}),
          ...(set.added_weight_kg != null ? { addedWeightKg: set.added_weight_kg } : {}),
          effectiveWeight: set.weight ?? 0,
          mode: set.load_mode ?? 'total',
          inputWeight: set.input_weight ?? set.weight ?? 0,
          barWeight: set.bar_weight,
          bodyweightFactor: set.bodyweight_factor,
          bodyweightKg: set.bodyweight_kg,
          label: set.load_label,
        })),
      },
    },
  };
}
