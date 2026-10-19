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
};

describe('TodayPlanCard', () => {
  it('shows the day type, exercise count, and a start button', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<TodayPlanCard plan={plan} onStart={onStart} onBrowse={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Pull' }).textContent).toBe('Pull');
    expect(screen.getByText('4 exercises')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
