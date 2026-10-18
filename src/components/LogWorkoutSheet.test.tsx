import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());
import LogWorkoutSheet from './LogWorkoutSheet';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('@/services/exercises', () => ({
  exercisesService: {
    getAll: vi.fn(async () => [{
      id: 'bench',
      name: 'Bench Press',
      category: 'push',
      primary_muscle: 'Chest',
      secondary_muscles: [],
      is_custom: false,
      created_at: '',
    }]),
    getTrackedIds: () => [],
    toggleTracked: () => false,
  },
}));

vi.mock('@/services/bodyMetrics', () => ({
  bodyMetricsService: {
    getLatestProfile: async () => ({
      weight: 80,
      height: null,
      age: null,
      gender: null,
      lastWeightDate: null,
    }),
  },
}));

vi.mock('@/services/strengthSets', () => ({
  strengthSetsService: {
    getRecentSessions: async () => [],
  },
}));

vi.mock('@/services/activities', () => ({
  activitiesService: {
    saveWorkout: vi.fn(async () => 'activity-1'),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

describe('LogWorkoutSheet cardio and others', () => {
  it('lets a gym workout add a cardio exercise with time, calories, and type', async () => {
    const user = userEvent.setup();
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} />);

    await user.click(await screen.findByRole('button', { name: /Choose exercise/ }));
    await user.click(await screen.findByRole('button', { name: /^Cardio/ }));

    const minutes = screen.getByRole('spinbutton', { name: 'Cardio minutes' });
    const calories = screen.getByRole('spinbutton', { name: 'Cardio calories' });
    expect(minutes.getAttribute('inputMode')).toBe('numeric');
    expect(calories.getAttribute('inputMode')).toBe('decimal');
    expect(screen.queryByText('Weight entry')).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Cardio type' }), 'Treadmill incline walk');
    await user.type(minutes, '20');
    await user.type(calories, '180');
    await user.click(screen.getByRole('button', { name: 'Add cardio' }));

    const entries = screen.getByRole('list', { name: 'Cardio entries' }).textContent ?? '';
    expect(entries).toContain('Treadmill incline walk');
    expect(entries).toContain('20 min');
    expect(entries).toContain('180 kcal');
  });

  it('shows a growing notes field for an Others session', async () => {
    const user = userEvent.setup();
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '✎ Others' }));
    const notes = screen.getByRole('textbox', { name: 'Others notes' });
    expect(notes.getAttribute('rows')).toBe('6');
    expect(screen.queryByText('Weight entry')).toBeNull();
    expect(screen.queryByText('Session Details')).toBeNull();

    await user.type(notes, 'Walked the long way home.\nFelt easy.');
    expect((notes as HTMLTextAreaElement).value).toBe('Walked the long way home.\nFelt easy.');
  });
});
