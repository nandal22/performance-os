import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TodayPlanCard from './TodayPlanCard';
import type { PlanSummary } from '@/services/plans';

afterEach(() => cleanup());

const plan: PlanSummary = {
  id: 'plan-1',
  plan_date: '2026-10-19',
  day_type: 'Pull',
  title: 'Back and biceps',
  notes: null,
  status: 'planned',
  activity_id: null,
  exercise_count: 4,
  planned: [],
};

const noCardio = { target_duration_min: null, target_incline_pct: null, target_speed_kmh: null, target_kcal: null };

describe('TodayPlanCard', () => {
  it('shows the day type, exercise count, and a start button', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<TodayPlanCard plan={plan} onStart={onStart} onBrowse={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Pull' }).textContent).toBe('Pull');
    expect(screen.getByText('4 exercises')).toBeTruthy();
    expect(screen.queryByTestId('plan-kcal')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('counts the cardio item separately and shows the estimated burn', () => {
    render(
      <TodayPlanCard
        plan={{
          ...plan,
          exercise_count: 3,
          planned: [
            { is_cardio: false, load_type: 'total', ...noCardio, sets: [{ target_reps_min: 5, target_reps_max: 5, target_weight_kg: 100 }] },
            { is_cardio: false, load_type: 'per_dumbbell', ...noCardio, sets: [{ target_reps_min: 10, target_reps_max: 10, target_weight_kg: 15 }] },
            { is_cardio: true, load_type: 'total', ...noCardio, target_duration_min: 20, target_kcal: 180, sets: [] },
          ],
        }}
        bodyWeightKg={75}
        onStart={() => undefined}
        onBrowse={() => undefined}
      />,
    );
    expect(screen.getByText(/2 exercises \+ 1 cardio/)).toBeTruthy();
    expect(screen.getByTestId('plan-kcal').textContent).toMatch(/^≈ \d+ kcal est\.$/);
  });

  it('offers a read-only View next to Start', async () => {
    const onView = vi.fn();
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<TodayPlanCard plan={plan} onStart={onStart} onView={onView} onBrowse={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'View' }));
    expect(onView).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });
});
