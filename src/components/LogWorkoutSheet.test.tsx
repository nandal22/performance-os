import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSessions, server, network, sessionStore, syncQueue } from '@/test/mockSessions';
import { sessionStorageKey, wasEnded, type WorkoutSession } from '@/lib/workoutSession';

vi.mock('@/services/sessions', () => import('@/test/mockSessions'));

beforeEach(() => resetSessions());
afterEach(() => cleanup());
import LogWorkoutSheet from './LogWorkoutSheet';

const settle = () => act(async () => { await syncQueue.flush(); });

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
    }, {
      id: 'hammer',
      name: 'Hammer Curl',
      category: 'pull',
      primary_muscle: 'Biceps',
      secondary_muscles: [],
      is_custom: true,
      created_at: '',
      load_type: 'per_dumbbell',
    }, {
      id: 'chin',
      name: 'Chin Up',
      category: 'pull',
      primary_muscle: 'Back',
      secondary_muscles: [],
      is_custom: true,
      created_at: '',
      equipment: 'other',
      load_type: 'bodyweight',
      measure: 'reps',
    }, {
      id: 'plank',
      name: 'Plank',
      category: 'core',
      primary_muscle: 'Core',
      secondary_muscles: [],
      is_custom: false,
      created_at: '',
      equipment: 'bodyweight',
      load_type: 'bodyweight',
      measure: 'time',
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

async function logBench(user: ReturnType<typeof userEvent.setup>, reps: string, weight: string) {
  await user.type(screen.getByRole('spinbutton', { name: 'Reps' }), reps);
  await user.type(screen.getByRole('spinbutton', { name: 'Total kg' }), weight);
  await user.click(screen.getByRole('button', { name: /Log Set|Set Logged/ }));
}

describe('LogWorkoutSheet persistence', () => {
  it('saves each set to the server the moment it is logged and resumes after closing', async () => {
    const user = userEvent.setup();
    const first = render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} initialExerciseName="Bench Press" />);
    await settle();
    await settle();
    await user.click(screen.getByRole('button', { name: /^Total kg/ }));
    await logBench(user, '5', '80');
    await logBench(user, '5', '82.5');
    await settle();
    const sets = [...server.state.sets.values()];
    expect(sets.map(set => [set.set_number, set.reps, set.weight])).toEqual([[1, 5, 80], [2, 5, 82.5]]);
    const activityId = sets[0].activity_id;
    expect(server.state.activities.get(activityId)?.status).toBe('in_progress');
    first.unmount();

    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Delete Bench Press set 2' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete Bench Press set 1' }));
    await settle();
    expect([...server.state.sets.values()].map(set => set.weight)).toEqual([82.5]);

    await user.click(screen.getByRole('button', { name: /Finish Workout/ }));
    await settle();
    expect(server.state.activities.get(activityId)?.status).toBe('done');
    expect(server.state.sets.get(sets[1].id)?.set_number).toBe(1);
    expect(localStorage.getItem(sessionStorageKey(null))).toBeNull();
    expect(wasEnded(activityId)).toBe(true);
  });

  it('does not resume logging when a finished workout is still in local storage', async () => {
    const user = userEvent.setup();
    const first = render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} initialExerciseName="Bench Press" />);
    await settle();
    await user.click(screen.getByRole('button', { name: /^Total kg/ }));
    await logBench(user, '5', '80');
    await settle();
    const activityId = [...server.state.sets.values()][0].activity_id;
    const saved = JSON.parse(localStorage.getItem(sessionStorageKey(null)) ?? 'null') as WorkoutSession;
    await user.click(screen.getByRole('button', { name: /Finish Workout/ }));
    await settle();
    first.unmount();

    sessionStore.adopt(saved);
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Active Workout' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Workout in progress' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete Bench Press/ })).toBeNull();
    expect(localStorage.getItem(sessionStorageKey(null))).toBeNull();
    expect(wasEnded(activityId)).toBe(true);
  });

  it('queues sets while offline and keeps them through a reload', async () => {
    const user = userEvent.setup();
    network.online = false;
    const first = render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} initialExerciseName="Bench Press" />);
    await settle();
    await user.click(screen.getByRole('button', { name: /^Total kg/ }));
    await logBench(user, '8', '60');
    await settle();
    expect(server.state.sets.size).toBe(0);
    expect(screen.getByTestId('sync-status').textContent).toMatch(/waiting to sync/);
    first.unmount();

    network.online = true;
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} />);
    await settle();
    expect([...server.state.sets.values()].map(set => set.reps)).toEqual([8]);
  });

  it('moves an old unsaved draft into a saved session once', async () => {
    localStorage.setItem('perf-os-draft', JSON.stringify({
      type: 'gym',
      date: '2026-10-19',
      savedAt: Date.now(),
      loggedSets: [{ exercise_id: 'bench', exercise_name: 'Bench Press', reps: 6, weight: 75 }],
    }));
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} />);
    await settle();
    expect(localStorage.getItem('perf-os-draft')).toBeNull();
    expect([...server.state.sets.values()].map(set => [set.reps, set.weight])).toEqual([[6, 75]]);
    expect(screen.getByRole('button', { name: 'Delete Bench Press set 1' })).toBeTruthy();
  });

  it('picks dumbbell entry for an exercise flagged per dumbbell and stores the pair', async () => {
    const user = userEvent.setup();
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} initialExerciseName="Hammer Curl" />);
    await settle();
    expect(await screen.findByText(/Auto-selected from exercise type: dumbbell/)).toBeTruthy();
    await user.type(screen.getByRole('spinbutton', { name: 'Reps' }), '12');
    await user.type(screen.getByRole('spinbutton', { name: 'One DB kg' }), '12.5');
    await user.click(screen.getByRole('button', { name: /Log Set/ }));
    await settle();
    expect([...server.state.sets.values()][0]).toMatchObject({ exercise_id: 'hammer', weight: 25, reps: 12 });
    expect(screen.getByText('(12.5 / DB)')).toBeTruthy();
  });
});

describe('LogWorkoutSheet bodyweight and timed exercises', () => {
  it('picks BW entry for a bodyweight exercise and stores BW + added with the split', async () => {
    const user = userEvent.setup();
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} initialExerciseName="Chin Up" />);
    await settle();
    expect(await screen.findByText(/Auto-selected from exercise type: bodyweight/)).toBeTruthy();
    await user.type(screen.getByRole('spinbutton', { name: 'Reps' }), '6');
    await user.type(screen.getByRole('spinbutton', { name: 'Added kg' }), '10');
    await user.click(screen.getByRole('button', { name: /Log Set|Set Logged/ }));
    await user.type(screen.getByRole('spinbutton', { name: 'Reps' }), '8');
    await user.click(screen.getByRole('button', { name: /Log Set|Set Logged/ }));
    await settle();
    const rows = [...server.state.sets.values()];
    expect(rows[0]).toMatchObject({ exercise_id: 'chin', reps: 6, weight: 90, added_weight_kg: 10, bodyweight_kg: 80 });
    expect(rows[1]).toMatchObject({ reps: 8, weight: 80, added_weight_kg: 0, bodyweight_kg: 80 });
    expect(screen.getByText('BW + 10 kg')).toBeTruthy();
    expect(screen.getByText('BW')).toBeTruthy();
  });

  it('logs a timed exercise in seconds on a numeric keypad', async () => {
    const user = userEvent.setup();
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} initialExerciseName="Plank" />);
    await settle();
    const secs = await screen.findByRole('spinbutton', { name: 'Seconds' });
    expect(secs.getAttribute('inputMode')).toBe('numeric');
    expect(screen.queryByRole('spinbutton', { name: 'Reps' })).toBeNull();
    await user.type(secs, '45');
    await user.click(screen.getByRole('button', { name: /Log Set|Set Logged/ }));
    await settle();
    expect([...server.state.sets.values()][0]).toMatchObject({ exercise_id: 'plank', reps: null, duration_sec: 45, weight: 80, added_weight_kg: 0 });
    expect(screen.getByRole('button', { name: 'Edit Plank set 1' })).toBeTruthy();
    expect(document.body.textContent).toContain('45 s');
  });

  it('keeps an ordinary set in the old row shape', async () => {
    const user = userEvent.setup();
    render(<LogWorkoutSheet open onClose={() => undefined} onSuccess={() => undefined} initialExerciseName="Bench Press" />);
    await settle();
    await user.click(screen.getByRole('button', { name: /^Total kg/ }));
    await logBench(user, '5', '80');
    await settle();
    expect(Object.keys([...server.state.sets.values()][0]).sort()).toEqual(
      ['activity_id', 'exercise_id', 'id', 'plan_set_id', 'reps', 'rpe', 'set_number', 'weight'],
    );
  });
});
