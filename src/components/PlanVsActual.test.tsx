import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PlanVsActual from './PlanVsActual';

afterEach(() => cleanup());

describe('PlanVsActual', () => {
  it('marks a matching set as a hit and a light set as a miss', () => {
    render(
      <PlanVsActual
        comparison={{
          day_type: 'Push',
          plan_date: '2026-10-19',
          exercises: [{
            name: 'Bench Press',
            position: 1,
            load_type: 'total',
            cardio: null,
            sets: [
              {
                id: 'hit',
                set_number: 1,
                set_type: 'top',
                target_reps_min: 5,
                target_reps_max: 5,
                target_weight_kg: 80,
                target_rir_min: 1,
                target_rir_max: 2,
                actual: { reps: 5, weight: 80, rpe: 8 },
              },
              {
                id: 'miss',
                set_number: 2,
                set_type: 'backoff',
                target_reps_min: 8,
                target_reps_max: 8,
                target_weight_kg: 70,
                target_rir_min: 2,
                target_rir_max: 3,
                actual: { reps: 8, weight: 60, rpe: 7 },
              },
            ],
          }],
        }}
      />,
    );
    const text = screen.getByLabelText('Planned versus actual').textContent ?? '';
    expect(text).toContain('Target 5 reps · 80 kg');
    expect(text).toContain('Actual 5 reps · 80 kg · RPE 8');
    expect(text).toContain('hit');
    expect(text).toContain('Actual 8 reps · 60 kg');
    expect(text).toContain('miss');
  });

  it('reads dumbbell targets per DB and shows the cardio item', () => {
    render(
      <PlanVsActual
        comparison={{
          day_type: 'Push',
          plan_date: '2026-10-19',
          exercises: [
            {
              name: 'Incline Dumbbell Press',
              position: 1,
              load_type: 'per_dumbbell',
              cardio: null,
              sets: [{
                id: 'db',
                set_number: 1,
                set_type: 'top',
                target_reps_min: 8,
                target_reps_max: 10,
                target_weight_kg: 27.5,
                target_rir_min: 1,
                target_rir_max: 2,
                actual: { reps: 9, weight: 55, rpe: 8 },
              }],
            },
            {
              name: 'Cardio',
              position: 2,
              load_type: 'total',
              sets: [],
              cardio: {
                target_duration_min: 20,
                target_incline_pct: 10,
                target_speed_kmh: 5.5,
                target_kcal: 180,
                label: 'Treadmill incline walk',
                actual: { minutes: 22, calories: 195, label: 'Treadmill incline walk' },
              },
            },
          ],
        }}
      />,
    );
    const text = screen.getByLabelText('Planned versus actual').textContent ?? '';
    expect(text).toContain('Target 8–10 reps · 27.5 kg / DB');
    expect(text).toContain('Actual 9 reps · 55 kg (27.5 / DB)');
    expect(text).toContain('hit');
    expect(text).toContain('cardio · Treadmill incline walk');
    expect(text).toContain('Target 20 min · 10% incline · 5.5 km/h · 180 kcal');
    expect(text).toContain('Actual 22 min · 195 kcal');
    expect(text).toContain('done');
  });

  it('shows BW + added and timed holds against their targets', () => {
    render(
      <PlanVsActual
        comparison={{
          day_type: 'Pull',
          plan_date: '2026-10-24',
          exercises: [{
            name: 'Dips',
            position: 1,
            load_type: 'bodyweight',
            cardio: null,
            sets: [{
              id: 'd1', set_number: 1, set_type: 'straight',
              target_reps_min: 6, target_reps_max: 8, target_weight_kg: 15, target_rir_min: null, target_rir_max: null,
              actual: { reps: 8, weight: 86.4, added_weight_kg: 15, bodyweight_kg: 71.4, rpe: null },
            }],
          }, {
            name: 'Plank',
            position: 2,
            load_type: 'bodyweight',
            measure: 'time',
            cardio: null,
            sets: [{
              id: 'p1', set_number: 1, set_type: 'straight',
              target_reps_min: null, target_reps_max: null, target_duration_sec_min: 45, target_duration_sec_max: 60,
              target_weight_kg: null, target_rir_min: null, target_rir_max: null,
              actual: { reps: null, weight: 71.4, added_weight_kg: 0, bodyweight_kg: 71.4, duration_sec: 52, rpe: null },
            }],
          }, {
            name: 'Farmer Carry',
            position: 3,
            load_type: 'per_dumbbell',
            measure: 'time',
            cardio: null,
            sets: [{
              id: 'f1', set_number: 1, set_type: 'straight',
              target_reps_min: null, target_reps_max: null, target_duration_sec_min: 40, target_duration_sec_max: 60,
              target_weight_kg: 24, target_rir_min: null, target_rir_max: null,
              actual: { reps: null, weight: 48, duration_sec: 30, rpe: null },
            }],
          }],
        }}
      />,
    );
    const text = screen.getByLabelText('Planned versus actual').textContent ?? '';
    expect(text).toContain('Target 6–8 reps · BW + 15 kg');
    expect(text).toContain('Actual 8 reps · BW + 15 kg');
    expect(text).toContain('Target 45–60 s · BW');
    expect(text).toContain('Actual 52 s · BW');
    expect(text).toContain('Target 40–60 s · 24 kg / DB');
    expect(text).toContain('Actual 30 s · 48 kg (24 / DB)');
    expect(text.match(/hit/g)?.length).toBe(2);
    expect(text).toContain('miss');
  });
});
