import { describe, expect, it } from 'vitest';
import { calcCardioCalories, calcStrengthCalories } from '@/engines/calorieEngine';
import {
  addedLoadOf, bodyweightLabel, cardioTargetCalories, cardioTargetLabel, estimatePlanCalories, isTimedTarget, loggedSetLabel, loggedWeightFor,
  prefillFromTarget, repsLabel, setOutcome, targetSeconds, targetWeightLabel,
} from './planMath';
import { planOrder, type PlannedLoad } from '@/services/plans';

const target = { target_reps_min: 8, target_reps_max: 10, target_weight_kg: 27.5, target_rir_min: 1, target_rir_max: 2 };
const noCardio = { target_duration_min: null, target_incline_pct: null, target_speed_kmh: null, target_kcal: null };

describe('dumbbell loads', () => {
  it('labels a per-dumbbell target as one dumbbell and logs the pair', () => {
    expect(targetWeightLabel(27.5, 'per_dumbbell')).toBe('27.5 kg / DB');
    expect(targetWeightLabel(80, 'total')).toBe('80 kg');
    expect(loggedWeightFor(27.5, 'per_dumbbell')).toBe(55);
    expect(prefillFromTarget(target, 'per_dumbbell')).toMatchObject({ reps: '10', weight: '55', rpe: '8' });
    expect(prefillFromTarget(target)).toMatchObject({ weight: '27.5' });
  });

  it('judges a per-dumbbell set by the combined weight it was logged as', () => {
    expect(setOutcome(target, { reps: 9, weight: 55 }, 'per_dumbbell')).toBe('hit');
    expect(setOutcome(target, { reps: 9, weight: 27.5 }, 'per_dumbbell')).toBe('miss');
    expect(setOutcome(target, { reps: 9, weight: 27.5 }, 'total')).toBe('hit');
  });
});

describe('plan calories', () => {
  const planned: PlannedLoad[] = [
    { is_cardio: false, load_type: 'total', ...noCardio, sets: [{ target_reps_min: 5, target_reps_max: 5, target_weight_kg: 80 }] },
    { is_cardio: false, load_type: 'per_dumbbell', ...noCardio, sets: [{ target_reps_min: 8, target_reps_max: 10, target_weight_kg: 25 }] },
  ];

  it('reuses the logged-workout strength estimate with dumbbell pairs combined', () => {
    const expected = calcStrengthCalories({ sets: [{ reps: 5, weight: 80 }, { reps: 10, weight: 50 }] }, 75).calories;
    expect(estimatePlanCalories(planned, 75)).toBe(expected);
    expect(estimatePlanCalories(planned, null)).toBeNull();
  });

  it('adds cardio from target kcal, else from the cardio estimate at the planned speed', () => {
    const walk = { ...noCardio, target_duration_min: 30, target_speed_kmh: 6 };
    expect(cardioTargetCalories({ ...walk, target_kcal: 210 }, 75)).toBe(210);
    expect(cardioTargetCalories(walk, 75)).toBe(calcCardioCalories({ duration: 30, distance: 3 }, 75).calories);
    const withCardio: PlannedLoad[] = [...planned, { is_cardio: true, load_type: 'total', ...walk, target_kcal: 210, sets: [] }];
    expect(estimatePlanCalories(withCardio, 75)).toBe((estimatePlanCalories(planned, 75) ?? 0) + 210);
  });

  it('describes a cardio target compactly', () => {
    expect(cardioTargetLabel({ target_duration_min: 20, target_incline_pct: 10, target_speed_kmh: 5.5, target_kcal: 180 }))
      .toBe('20 min · 10% incline · 5.5 km/h · 180 kcal');
  });
});

describe('plan order', () => {
  it('puts cardio items last and keeps the coach order otherwise', () => {
    const items = [
      { position: 1, is_cardio: true, id: 'walk' },
      { position: 3, is_cardio: false, id: 'curl' },
      { position: 2, is_cardio: false, id: 'row' },
    ];
    expect(planOrder(items).map(item => item.id)).toEqual(['row', 'curl', 'walk']);
  });
});

describe('bodyweight and timed targets', () => {
  const bw = { target_reps_min: 6, target_reps_max: 8, target_weight_kg: 15, target_rir_min: null, target_rir_max: null };
  const plain = { ...bw, target_weight_kg: null };
  const plank = { target_reps_min: null, target_reps_max: null, target_duration_sec_min: 45, target_duration_sec_max: 60, target_weight_kg: null, target_rir_min: null, target_rir_max: null };

  it('labels bodyweight targets as BW or BW + added', () => {
    expect(targetWeightLabel(null, 'bodyweight')).toBe('BW');
    expect(targetWeightLabel(0, 'bodyweight')).toBe('BW');
    expect(targetWeightLabel(15, 'bodyweight')).toBe('BW + 15 kg');
    expect(bodyweightLabel(2.5)).toBe('BW + 2.5 kg');
  });

  it('logs BW + added as the total and prefills only the added kg', () => {
    expect(loggedWeightFor(15, 'bodyweight', 71.4)).toBe(86.4);
    expect(loggedWeightFor(null, 'bodyweight', 71.4)).toBe(71.4);
    expect(prefillFromTarget(bw, 'bodyweight')).toMatchObject({ reps: '8', weight: '15', seconds: '' });
    expect(prefillFromTarget(plain, 'bodyweight')).toMatchObject({ weight: '' });
  });

  it('judges a bodyweight set by its added load, from the split or the total', () => {
    expect(setOutcome(bw, { reps: 7, weight: 86.4, added_weight_kg: 15, bodyweight_kg: 71.4 }, 'bodyweight')).toBe('hit');
    expect(setOutcome(bw, { reps: 7, weight: 86.4, bodyweight_kg: 71.4 }, 'bodyweight')).toBe('hit');
    expect(setOutcome(bw, { reps: 7, weight: 71.4, added_weight_kg: 0, bodyweight_kg: 71.4 }, 'bodyweight')).toBe('miss');
    expect(setOutcome(plain, { reps: 7, weight: 71.4, added_weight_kg: 0 }, 'bodyweight')).toBe('hit');
    expect(addedLoadOf({ reps: 7, weight: 71.6, bodyweight_kg: 71.4 })).toBe(0);
  });

  it('reads timed targets in seconds, including legacy reps-as-seconds plans', () => {
    expect(repsLabel(plank)).toBe('45–60 s');
    expect(repsLabel({ ...plank, target_duration_sec_min: 60 })).toBe('60 s');
    expect(prefillFromTarget(plank, 'bodyweight', 'time')).toMatchObject({ reps: '', seconds: '60', weight: '' });
    const legacy = { target_reps_min: 65, target_reps_max: 75, target_weight_kg: null, target_rir_min: null, target_rir_max: null };
    expect(targetSeconds(legacy, 'time')).toEqual({ min: 65, max: 75 });
    expect(targetSeconds(legacy, 'reps')).toBeNull();
    expect(isTimedTarget(plank)).toBe(true);
  });

  it('a hold at or past the minimum is a hit', () => {
    expect(setOutcome(plank, { reps: null, weight: 71.4, duration_sec: 50, added_weight_kg: 0 }, 'bodyweight', 'time')).toBe('hit');
    expect(setOutcome(plank, { reps: null, weight: 71.4, duration_sec: 90, added_weight_kg: 0 }, 'bodyweight', 'time')).toBe('hit');
    expect(setOutcome(plank, { reps: null, weight: 71.4, duration_sec: 30, added_weight_kg: 0 }, 'bodyweight', 'time')).toBe('miss');
  });

  it('labels logged sets', () => {
    expect(loggedSetLabel({ reps: null, weight: 71.4, duration_sec: 52, added_weight_kg: 0 }, 'bodyweight')).toBe('52 s · BW');
    expect(loggedSetLabel({ reps: 8, weight: 86.4, added_weight_kg: 15 }, 'bodyweight')).toBe('8 reps · BW + 15 kg');
    expect(loggedSetLabel({ reps: null, weight: 48, duration_sec: 60 }, 'per_dumbbell')).toBe('60 s · 48 kg (24 / DB)');
    expect(loggedSetLabel({ reps: 5, weight: 80 })).toBe('5 reps · 80 kg');
  });

  it('estimates timed and bodyweight plan calories like logged sets', () => {
    const planned: PlannedLoad[] = [
      { is_cardio: false, load_type: 'bodyweight', ...noCardio, sets: [{ target_reps_min: 6, target_reps_max: 8, target_weight_kg: 15 }] },
      { is_cardio: false, load_type: 'bodyweight', measure: 'time', ...noCardio, sets: [{ target_reps_min: null, target_reps_max: null, target_duration_sec_min: 45, target_duration_sec_max: 60, target_weight_kg: null }] },
      { is_cardio: false, load_type: 'per_dumbbell', measure: 'time', ...noCardio, sets: [{ target_reps_min: null, target_reps_max: null, target_duration_sec_min: 40, target_duration_sec_max: 60, target_weight_kg: 24 }] },
    ];
    const expected = calcStrengthCalories({ sets: [
      { reps: 8, weight: 86.4 },
      { reps: null, durationSec: 60, weight: 71.4 },
      { reps: null, durationSec: 60, weight: 48 },
    ] }, 71.4).calories;
    expect(estimatePlanCalories(planned, 71.4)).toBe(expected);
  });
});

describe('timed sets in the calorie estimate', () => {
  it('counts held seconds as active time with no volume, and leaves rep sets as before', () => {
    const repsOnly = calcStrengthCalories({ sets: [{ reps: 10, weight: 60 }] }, 80);
    const withHold = calcStrengthCalories({ sets: [{ reps: 10, weight: 60 }, { reps: null, durationSec: 60, weight: 80 }] }, 80);
    expect(withHold.calories).toBeGreaterThan(repsOnly.calories);
    expect(withHold.total_volume_kg).toBe(repsOnly.total_volume_kg);
    expect(calcStrengthCalories({ sets: [{ reps: null, durationSec: 60, weight: 80 }] }, 80).calories).toBeGreaterThan(0);
    // An old plank row with reps keeps its reps-based estimate even if seconds are backfilled.
    expect(calcStrengthCalories({ sets: [{ reps: 75, weight: 71.4, durationSec: 75 }] }, 71.4).calories)
      .toBe(calcStrengthCalories({ sets: [{ reps: 75, weight: 71.4 }] }, 71.4).calories);
  });
});
