import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutPlan } from '@/services/plans';

const { saveWorkout } = vi.hoisted(() => ({
  saveWorkout: vi.fn(
    async (_input: {
      planId?: string | null;
      sets: Array<{ reps: number; weight?: number; plan_set_id: string | null; rpe: number | null }>;
    }) => {
      void _input;
      return 'activity-1';
    },
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('@/services/activities', () => ({
  activitiesService: { saveWorkout },
}));

vi.mock('@/services/plans', () => ({
  plansService: {
    start: vi.fn(async () => undefined),
    guidance: vi.fn(async () => ({
      exercise_id: 'bench',
      setup: 'Feet planted.',
      movement: 'Lower and press.',
      common_mistakes: 'Bouncing.',
      image_urls: [],
      video_url: null,
      source: 'Performance OS',
      license: 'original',
    })),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import PlanLogSheet from './PlanLogSheet';

afterEach(() => {
  cleanup();
  saveWorkout.mockClear();
});

const plan: WorkoutPlan = {
  id: 'plan-1',
  plan_date: '2026-10-19',
  day_type: 'Push',
  title: 'Bench',
  notes: null,
  status: 'planned',
  activity_id: null,
  exercise_count: 1,
  exercises: [{
    id: 'pe-1',
    position: 1,
    exercise_id: 'bench',
    exercise_name: 'Bench Press',
    superset_group: null,
    note: null,
    sets: [{
      id: 'ps-1',
      set_number: 1,
      set_type: 'warmup',
      target_reps_min: 8,
      target_reps_max: 10,
      target_weight_kg: 40,
      target_rir_min: 3,
      target_rir_max: 4,
      rest_seconds: 60,
      note: null,
    }],
  }],
};

describe('PlanLogSheet', () => {
  it('logs a planned set in one tap from the target', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={plan} onClose={() => undefined} onSaved={() => undefined} />);

    expect(screen.getByText('warmup')).toBeTruthy();
    expect(screen.getByLabelText('Rest timer').textContent).toContain('60s');
    const reps = screen.getByRole('textbox', { name: 'Set 1 reps' });
    const weight = screen.getByRole('textbox', { name: 'Set 1 weight' });
    expect(reps.getAttribute('inputMode')).toBe('numeric');
    expect((reps as HTMLInputElement).value).toBe('10');
    expect((weight as HTMLInputElement).value).toBe('40');

    await user.click(screen.getByRole('button', { name: 'Log set 1' }));
    await user.click(screen.getByRole('button', { name: 'Save workout' }));

    expect(saveWorkout).toHaveBeenCalledOnce();
    const input = saveWorkout.mock.calls[0][0];
    expect(input.planId).toBe('plan-1');
    expect(input.sets).toEqual([
      expect.objectContaining({ reps: 10, weight: 40, plan_set_id: 'ps-1', rpe: 6 }),
    ]);
  });
});
