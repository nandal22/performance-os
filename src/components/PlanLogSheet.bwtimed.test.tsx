import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutPlan } from '@/services/plans';
import type { WorkoutSession } from '@/lib/workoutSession';

const { server, online, remote } = vi.hoisted(() => ({
  server: { current: null as null | import('@/test/fakeSessionServer').FakeSessionServer },
  online: { value: true },
  remote: { session: null as WorkoutSession | null },
}));

vi.mock('@/services/sessions', async () => {
  const { createSyncQueue } = await import('@/lib/syncQueue');
  const { createSessionStore } = await import('@/lib/workoutSession');
  const { createFakeSessionServer } = await import('@/test/fakeSessionServer');
  server.current = createFakeSessionServer();
  const syncQueue = createSyncQueue({
    execute: op => server.current!.execute(op),
    isOnline: () => online.value,
    retryDelayMs: () => 5,
  });
  return {
    syncQueue,
    sessionStore: createSessionStore(syncQueue),
    sessionsService: { load: vi.fn(async () => remote.session), findFree: vi.fn(async () => null) },
  };
});

vi.mock('@/services/bodyMetrics', () => ({
  bodyMetricsService: { getLatestProfile: async () => ({ weight: 80, height: null, age: null, gender: null, lastWeightDate: null }) },
}));

vi.mock('@/services/exercises', () => ({
  exercisesService: { getAll: vi.fn(async () => []) },
}));

vi.mock('@/services/plans', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/plans')>();
  return {
    ...actual,
    plansService: {
      guidance: vi.fn(async () => null),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

import PlanLogSheet from './PlanLogSheet';
import { syncQueue } from '@/services/sessions';
import { calcStrengthCalories } from '@/engines/calorieEngine';
import { toast } from 'sonner';

const NO_CARDIO = { target_duration_min: null, target_incline_pct: null, target_speed_kmh: null, target_kcal: null };


const set = (id: string, n: number, extra: Record<string, unknown>) => ({
  id, set_number: n, set_type: 'straight' as const, target_reps_min: null, target_reps_max: null,
  target_duration_sec_min: null, target_duration_sec_max: null, target_weight_kg: null,
  target_rir_min: null, target_rir_max: null, rest_seconds: null, note: null, ...extra,
});

const exercise = (id: string, name: string, extra: Record<string, unknown>, sets: ReturnType<typeof set>[], position: number) => ({
  id, position, exercise_id: id.replace('pe-', ''), exercise_name: name, superset_group: null, note: null,
  is_cardio: false, load_type: 'total' as const, measure: 'reps' as const, ...NO_CARDIO, ...extra, sets,
});

const plan = {
  id: 'plan-bw', plan_date: '2026-10-26', day_type: 'Pull', title: 'Pull', notes: null, status: 'planned', activity_id: null,
  exercise_count: 3, planned: [],
  exercises: [
    exercise('pe-dips', 'Dips', { load_type: 'bodyweight' }, [
      set('ps-dips-1', 1, { target_reps_min: 8, target_reps_max: 10 }),
      set('ps-dips-2', 2, { target_reps_min: 6, target_reps_max: 8, target_weight_kg: 15 }),
    ], 1),
    exercise('pe-plank', 'Plank', { load_type: 'bodyweight', measure: 'time' }, [
      set('ps-plank-1', 1, { target_duration_sec_min: 45, target_duration_sec_max: 60 }),
    ], 2),
    exercise('pe-carry', 'Farmer Carry', { load_type: 'per_dumbbell', measure: 'time' }, [
      set('ps-carry-1', 1, { target_duration_sec_min: 40, target_duration_sec_max: 60, target_weight_kg: 24 }),
    ], 3),
  ],
} as unknown as WorkoutPlan;
plan.planned = plan.exercises;

const settle = () => act(async () => { await syncQueue.flush(); });
let clock = 2_000_000;
const later = () => { clock += 1000; };
const rows = () => [...server.current!.state.sets.values()];
const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  localStorage.clear();
  online.value = true;
  remote.session = null;
  const state = server.current!.state;
  state.activities.clear();
  state.sets.clear();
  state.cardio.clear();
  state.plans.clear();
  state.calls.length = 0;
  state.failNext = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('bodyweight sets', () => {
  it('shows BW, asks for no weight, and stores BW + added as the total with the split', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={plan} autoStart bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.getByText('Dips · BW')).toBeTruthy();
    expect(screen.getByText('8–10 reps · BW')).toBeTruthy();
    expect(screen.getByText('6–8 reps · BW + 15 kg')).toBeTruthy();
    const first = box('Dips set 1 added weight');
    expect(first.value).toBe('');
    expect(first.placeholder).toBe('BW');
    expect(first.getAttribute('inputMode')).toBe('decimal');
    expect(box('Dips set 2 added weight').value).toBe('15');
    expect(screen.getAllByTestId('bw-load').map(node => node.textContent)).toEqual(['BW', 'BW + 15 kg', 'BW']);

    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Log set 2' })[0]);
    await settle();
    expect(rows()).toEqual([
      expect.objectContaining({ plan_set_id: 'ps-dips-1', reps: 10, weight: 71.4, added_weight_kg: 0, bodyweight_kg: 71.4 }),
      expect.objectContaining({ plan_set_id: 'ps-dips-2', reps: 8, weight: 86.4, added_weight_kg: 15, bodyweight_kg: 71.4 }),
    ]);
    expect(rows()[0]).not.toHaveProperty('duration_sec');
  });

  it('edits the added kg, then a second tap undoes the set', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={plan} autoStart bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />);
    const added = box('Dips set 1 added weight');
    await user.type(added, '7.5');
    expect(screen.getAllByTestId('bw-load')[0].textContent).toBe('BW + 7.5 kg');
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await settle();
    expect(rows()[0]).toMatchObject({ weight: 78.9, added_weight_kg: 7.5 });
    expect(box('Dips set 1 added weight').value).toBe('7.5');

    later();
    await user.click(screen.getByRole('button', { name: 'Logged set 1, tap to undo' }));
    await settle();
    expect(rows()).toHaveLength(0);
  });

  it('reads the added kg off a set logged before the split existed', async () => {
    remote.session = {
      version: 1, activityId: 'plan-bw', planId: 'plan-bw', type: 'gym', subType: null, date: '2026-10-26', notes: '', tags: [], startedAt: Date.now(),
      sets: [{ id: 'old', exercise_id: 'dips', exercise_name: 'Dips', set_number: 2, reps: 8, weight: 86.4, rpe: null, plan_set_id: 'ps-dips-2' }],
      cardio: [], skipped: [], extras: [],
    };
    render(<PlanLogSheet plan={{ ...plan, status: 'in_progress', activity_id: 'plan-bw' }} bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Logged set 2, tap to undo' })).toBeTruthy();
    expect(box('Dips set 2 added weight').value).toBe('15');
  });
});

describe('timed sets', () => {
  it('logs seconds with a numeric keypad instead of reps', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={plan} autoStart bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.getByText('Plank · BW · timed')).toBeTruthy();
    expect(screen.getByText('Farmer Carry · per DB · timed')).toBeTruthy();
    expect(screen.getByText('45–60 s · BW')).toBeTruthy();
    expect(screen.getByText('40–60 s · 24 kg / DB')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Plank set 1 reps' })).toBeNull();
    const secs = box('Plank set 1 seconds');
    expect(secs.getAttribute('inputMode')).toBe('numeric');
    expect(secs.value).toBe('60');
    expect(box('Farmer Carry set 1 weight').value).toBe('48');

    await user.clear(secs);
    await user.type(secs, '52');
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[1]);
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[1]);
    await settle();
    const plank = rows().find(row => row.plan_set_id === 'ps-plank-1');
    const carry = rows().find(row => row.plan_set_id === 'ps-carry-1');
    expect(plank).toMatchObject({ reps: null, duration_sec: 52, weight: 71.4, added_weight_kg: 0 });
    expect(carry).toMatchObject({ reps: null, duration_sec: 60, weight: 48 });
    expect(carry).not.toHaveProperty('added_weight_kg');
  });

  it('asks for seconds when the field is empty', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={plan} autoStart bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />);
    await user.clear(box('Plank set 1 seconds'));
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[1]);
    expect(toast.error).toHaveBeenCalledWith('Enter seconds');
    await settle();
    expect(rows()).toHaveLength(0);
  });

  it('the light timer fills the seconds when stopped', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={plan} autoStart bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Start timer for Plank set 1' }));
    clock += 37_000;
    await user.click(screen.getByRole('button', { name: 'Stop timer for Plank set 1' }));
    expect(box('Plank set 1 seconds').value).toBe('37');
  });

  it('counts held seconds toward calories on finish', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={plan} autoStart bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[1]);
    await user.click(screen.getByRole('button', { name: /Finish workout/ }));
    await settle();
    const metrics = server.current!.state.activities.get('plan-bw')?.structured_metrics as {
      calorieEstimate: { calories: number }; strengthLoad: { sets: Array<Record<string, unknown>> };
    };
    const expected = calcStrengthCalories({ sets: [{ reps: null, durationSec: 60, weight: 71.4, loadMode: 'total', bodyweightKg: 71.4 }] }, 71.4).calories;
    expect(metrics.calorieEstimate.calories).toBe(expected);
    expect(metrics.calorieEstimate.calories).toBeGreaterThan(0);
    expect(metrics.strengthLoad.sets[0]).toMatchObject({ reps: null, durationSec: 60, addedWeightKg: 0 });
  });
});
