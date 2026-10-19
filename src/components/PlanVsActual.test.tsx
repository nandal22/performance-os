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
});
