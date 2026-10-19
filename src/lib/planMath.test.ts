import { describe, expect, it } from 'vitest';
import { calcCardioCalories, calcStrengthCalories } from '@/engines/calorieEngine';
import { cardioTargetCalories, cardioTargetLabel, estimatePlanCalories, loggedWeightFor, prefillFromTarget, setOutcome, targetWeightLabel } from './planMath';
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
