import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutPlan } from '@/services/plans';
import { sessionStorageKey, type WorkoutSession } from '@/lib/workoutSession';

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
  toast: { error: vi.fn(), success: vi.fn() },
}));

import PlanLogSheet from './PlanLogSheet';
import { syncQueue } from '@/services/sessions';
import { calcStrengthCalories } from '@/engines/calorieEngine';

const NO_CARDIO = { target_duration_min: null, target_incline_pct: null, target_speed_kmh: null, target_kcal: null };

const plan: WorkoutPlan = {
  id: 'plan-1',
  plan_date: '2026-10-19',
  day_type: 'Push',
  title: 'Bench',
  notes: null,
  status: 'planned',
  activity_id: null,
  exercise_count: 3,
  planned: [],
  exercises: [
    {
      id: 'pe-walk',
      position: 1,
      exercise_id: 'cardio',
      exercise_name: 'Cardio',
      superset_group: null,
      note: 'Treadmill incline walk',
      is_cardio: true,
      load_type: 'total',
      target_duration_min: 20,
      target_incline_pct: 10,
      target_speed_kmh: 5.5,
      target_kcal: 180,
      sets: [],
    },
    {
      id: 'pe-1',
      position: 2,
      exercise_id: 'bench',
      exercise_name: 'Bench Press',
      superset_group: null,
      note: null,
      is_cardio: false,
      load_type: 'total',
      ...NO_CARDIO,
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
    },
    {
      id: 'pe-2',
      position: 3,
      exercise_id: 'incline-db',
      exercise_name: 'Incline Dumbbell Press',
      superset_group: null,
      note: null,
      is_cardio: false,
      load_type: 'per_dumbbell',
      ...NO_CARDIO,
      sets: [{
        id: 'ps-db-1',
        set_number: 1,
        set_type: 'top',
        target_reps_min: 8,
        target_reps_max: 10,
        target_weight_kg: 12.5,
        target_rir_min: 1,
        target_rir_max: 2,
        rest_seconds: 90,
        note: null,
      }],
    },
  ],
};
plan.planned = plan.exercises;

// The sheet sorts cardio last; the fixture lists it first, as a coach might.
const sorted = { ...plan, exercises: [plan.exercises[1], plan.exercises[2], plan.exercises[0]] };

const settle = () => act(async () => { await syncQueue.flush(); });

// Taps further apart than the double-tap window.
let clock = 1_000_000;
const later = () => { clock += 1000; };

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

describe('PlanLogSheet sessions', () => {
  it('Start creates the activity and marks the plan in progress right away', async () => {
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await settle();
    const state = server.current!.state;
    expect(state.activities.get('plan-1')?.status).toBe('in_progress');
    expect(state.plans.get('plan-1')).toEqual({ status: 'in_progress', activity_id: 'plan-1' });
    expect(screen.getByTestId('sync-status').textContent).toContain('saved');
  });

  it('saves a set the moment it is logged, ignores a double tap, and allows edit and delete', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    const reps = screen.getByRole('textbox', { name: 'Bench Press set 1 reps' });
    expect(reps.getAttribute('inputMode')).toBe('numeric');
    expect((reps as HTMLInputElement).value).toBe('10');

    const log = screen.getAllByRole('button', { name: 'Log set 1' })[0];
    await user.dblClick(log);
    await settle();
    const sets = () => [...server.current!.state.sets.values()];
    expect(sets()).toHaveLength(1);
    expect(sets()[0]).toMatchObject({ activity_id: 'plan-1', plan_set_id: 'ps-1', reps: 10, weight: 40, rpe: 6 });

    await user.clear(reps);
    await user.type(reps, '9');
    later();
    await user.click(screen.getByRole('button', { name: 'Update set 1' }));
    await settle();
    expect(sets()).toHaveLength(1);
    expect(sets()[0].reps).toBe(9);

    await user.clear(reps);
    await user.type(reps, '7');
    await user.click(screen.getByRole('button', { name: 'Undo Bench Press set 1' }));
    await settle();
    expect(sets()).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Log set 1' })).toHaveLength(2);
  });

  it('closing and reopening resumes the session with nothing lost', async () => {
    const user = userEvent.setup();
    const first = render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await settle();
    first.unmount();

    render(<PlanLogSheet plan={{ ...sorted, status: 'in_progress', activity_id: 'plan-1' }} onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Logged set 1, tap to undo' })).toBeTruthy();
    expect(screen.getByText(/2026-10-19 · in progress/)).toBeTruthy();
    await settle();
    expect(server.current!.state.sets.size).toBe(1);
    expect(server.current!.state.activities.size).toBe(1);
  });

  it('resumes from the database when this device has no local copy', async () => {
    remote.session = {
      version: 1, activityId: 'plan-1', planId: 'plan-1', type: 'gym', subType: null, date: '2026-10-19', notes: '', tags: [], startedAt: Date.now(),
      sets: [{ id: 'remote-set', exercise_id: 'bench', exercise_name: 'Bench Press', set_number: 1, reps: 8, weight: 42.5, rpe: null, plan_set_id: 'ps-1' }],
      cardio: [], skipped: [], extras: [],
    };
    render(<PlanLogSheet plan={{ ...sorted, status: 'in_progress', activity_id: 'plan-1' }} onClose={() => undefined} onSaved={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Logged set 1, tap to undo' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Bench Press set 1 weight' }) as HTMLInputElement).value).toBe('42.5');
    expect(JSON.parse(localStorage.getItem(sessionStorageKey('plan-1')) ?? '{}').sets).toHaveLength(1);
  });

  it('keeps sets logged offline and sends them when the phone is back online', async () => {
    const user = userEvent.setup();
    online.value = false;
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await settle();
    expect(server.current!.state.sets.size).toBe(0);
    expect(screen.getByTestId('sync-status').textContent).toContain('2 changes waiting to sync');

    online.value = true;
    await settle();
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toContain('saved'));
    expect(server.current!.state.sets.size).toBe(1);
  });

  it('shows dumbbell targets per DB and stores the combined weight', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.getByText('8–10 reps · 12.5 kg / DB · RIR 1–2')).toBeTruthy();
    const weight = screen.getByRole('textbox', { name: 'Incline Dumbbell Press set 1 weight' }) as HTMLInputElement;
    expect(weight.value).toBe('25');
    expect(weight.getAttribute('inputMode')).toBe('decimal');
    expect(screen.getByTestId('per-db').textContent).toBe('= 12.5 kg / DB');
    await user.clear(weight);
    await user.type(weight, '30');
    expect(screen.getByTestId('per-db').textContent).toBe('= 15 kg / DB');

    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[1]);
    await settle();
    expect([...server.current!.state.sets.values()][0]).toMatchObject({ plan_set_id: 'ps-db-1', weight: 30 });
  });

  it('shows the cardio item last, prefilled, and logs it to cardio entries', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    const sections = document.querySelectorAll('section');
    expect(sections[sections.length - 1].getAttribute('data-testid')).toBe('plan-cardio');
    expect(screen.getByText('Target 20 min · 10% incline · 5.5 km/h · 180 kcal')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Plan cardio type' }) as HTMLInputElement).value).toBe('Treadmill incline walk');
    expect((screen.getByRole('textbox', { name: 'Plan cardio minutes' }) as HTMLInputElement).value).toBe('20');
    const kcal = screen.getByRole('textbox', { name: 'Plan cardio calories' }) as HTMLInputElement;
    expect(kcal.value).toBe('180');
    expect(kcal.getAttribute('inputMode')).toBe('numeric');

    await user.dblClick(screen.getByRole('button', { name: 'Log cardio' }));
    await settle();
    const entries = [...server.current!.state.cardio.values()];
    expect(entries).toEqual([expect.objectContaining({
      activity_id: 'plan-1', exercise_id: 'cardio', plan_exercise_id: 'pe-walk', duration_minutes: 20, calories: 180, label: 'Treadmill incline walk', position: 1,
    })]);
  });

  it('estimates plan calories with the app strength estimate and stores them on finish', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={onSaved} />);
    const strength = calcStrengthCalories({ sets: [{ reps: 10, weight: 40 }, { reps: 10, weight: 25 }] }, 80).calories;
    await waitFor(() => expect(screen.getByTestId('plan-calories').textContent).toContain(`${strength + 180} kcal`));

    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await user.click(screen.getByRole('button', { name: 'Log cardio' }));
    await user.click(screen.getByRole('button', { name: /Finish workout/ }));
    await settle();
    const activity = server.current!.state.activities.get('plan-1');
    const logged = calcStrengthCalories({ sets: [{ reps: 10, weight: 40 }] }, 80).calories;
    expect(activity?.status).toBe('done');
    expect((activity?.structured_metrics.calorieEstimate as { calories: number }).calories).toBe(logged + 180);
    expect(server.current!.state.plans.get('plan-1')?.status).toBe('done');
    expect(localStorage.getItem(sessionStorageKey('plan-1'))).toBeNull();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('tapping Log set again undoes it, keeps the prefill, and survives a reload', async () => {
    const user = userEvent.setup();
    const first = render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    const log = () => screen.getAllByRole('button', { name: /^(Log|Logged) set 1/ })[0];
    await user.click(log());
    await settle();
    expect(server.current!.state.sets.size).toBe(1);
    expect(log().getAttribute('aria-pressed')).toBe('true');
    expect(log().textContent).toContain('undo');

    later();
    await user.click(log());
    await settle();
    expect(server.current!.state.sets.size).toBe(0);
    expect(log().getAttribute('aria-pressed')).toBe('false');
    expect(log().textContent).toBe('Log set 1');
    expect((screen.getByRole('textbox', { name: 'Bench Press set 1 reps' }) as HTMLInputElement).value).toBe('10');
    expect((screen.getByRole('textbox', { name: 'Bench Press set 1 weight' }) as HTMLInputElement).value).toBe('40');
    first.unmount();

    render(<PlanLogSheet plan={{ ...sorted, status: 'in_progress', activity_id: 'plan-1' }} onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.getAllByRole('button', { name: 'Log set 1' })).toHaveLength(2);
    later();
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await settle();
    expect([...server.current!.state.sets.values()].map(set => set.plan_set_id)).toEqual(['ps-1']);
  });

  it('undoes a set logged before a reload, with no orphan row left on the server', async () => {
    const user = userEvent.setup();
    const first = render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    const bench = screen.getAllByRole('button', { name: 'Log set 1' })[0];
    // A double tap logs once; it does not log and then undo.
    await user.click(bench);
    await user.click(bench);
    await settle();
    expect(server.current!.state.sets.size).toBe(1);
    first.unmount();

    render(<PlanLogSheet plan={{ ...sorted, status: 'in_progress', activity_id: 'plan-1' }} onClose={() => undefined} onSaved={() => undefined} />);
    later();
    await user.click(screen.getByRole('button', { name: 'Logged set 1, tap to undo' }));
    await settle();
    expect(server.current!.state.sets.size).toBe(0);
    expect(JSON.parse(localStorage.getItem(sessionStorageKey('plan-1')) ?? '{}').sets).toEqual([]);
    later();
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    later();
    await user.click(screen.getByRole('button', { name: 'Logged set 1, tap to undo' }));
    later();
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await settle();
    expect([...server.current!.state.sets.values()].map(set => set.plan_set_id)).toEqual(['ps-1']);
  });

  it('undoes an offline log without ever writing the row', async () => {
    const user = userEvent.setup();
    online.value = false;
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    later();
    await user.click(screen.getByRole('button', { name: 'Logged set 1, tap to undo' }));
    online.value = true;
    await settle();
    expect(server.current!.state.sets.size).toBe(0);
    expect(server.current!.state.calls.filter(call => call === 'upsertSet')).toEqual([]);
  });

  it('tapping Skip set again undoes the skip, and the state survives a reload', async () => {
    const user = userEvent.setup();
    const first = render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getAllByRole('button', { name: 'Skip set 1' })[0]);
    const skipped = screen.getByRole('button', { name: 'Skipped set 1, tap to undo' });
    expect(skipped.getAttribute('aria-pressed')).toBe('true');
    expect(skipped.textContent).toBe('✓ Skipped · undo');
    expect(document.querySelector('[data-testid="plan-set-row"]')?.getAttribute('data-state')).toBe('skipped');
    expect((screen.getAllByRole('button', { name: 'Log set 1' })[0] as HTMLButtonElement).disabled).toBe(true);
    first.unmount();

    render(<PlanLogSheet plan={{ ...sorted, status: 'in_progress', activity_id: 'plan-1' }} onClose={() => undefined} onSaved={() => undefined} />);
    later();
    await user.click(screen.getByRole('button', { name: 'Skipped set 1, tap to undo' }));
    expect(screen.getAllByRole('button', { name: 'Skip set 1' })).toHaveLength(2);
    expect(document.querySelector('[data-testid="plan-set-row"]')?.getAttribute('data-state')).toBe('pending');
    expect(JSON.parse(localStorage.getItem(sessionStorageKey('plan-1')) ?? '{}').skipped).toEqual([]);
    await settle();
    expect(server.current!.state.sets.size).toBe(0);
  });

  it('keeps the rest of the workout mounted when a set is logged', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    const incline = screen.getByRole('textbox', { name: 'Incline Dumbbell Press set 1 reps' });
    expect((incline as HTMLInputElement).value).toBe('10');
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    expect(screen.getByRole('textbox', { name: 'Incline Dumbbell Press set 1 reps' })).toBe(incline);
    expect((incline as HTMLInputElement).value).toBe('10');
    await waitFor(() => expect(document.activeElement).toBe(incline));
  });

  it('skips the cardio item without leaving the workout incomplete', async () => {
    const user = userEvent.setup();
    const first = render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await user.click(screen.getByRole('button', { name: 'Skip cardio' }));
    const skipped = screen.getByRole('button', { name: 'Skipped cardio, tap to undo' });
    expect(skipped.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-testid="plan-cardio"]')?.getAttribute('data-state')).toBe('skipped');
    expect((screen.getByRole('button', { name: 'Log cardio' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Finishing still completes this workout/)).toBeTruthy();
    first.unmount();

    render(<PlanLogSheet plan={{ ...sorted, status: 'in_progress', activity_id: 'plan-1' }} onClose={() => undefined} onSaved={() => undefined} />);
    later();
    await user.click(screen.getByRole('button', { name: 'Skipped cardio, tap to undo' }));
    expect(screen.getByRole('button', { name: 'Skip cardio' })).toBeTruthy();
    expect(document.querySelector('[data-testid="plan-cardio"]')?.getAttribute('data-state')).toBe('pending');
    later();
    await user.click(screen.getByRole('button', { name: 'Skip cardio' }));
    await user.click(screen.getByRole('button', { name: /Finish workout/ }));
    await settle();
    expect(server.current!.state.activities.get('plan-1')?.status).toBe('done');
    expect(server.current!.state.plans.get('plan-1')?.status).toBe('done');
    expect([...server.current!.state.cardio.values()]).toEqual([]);
    expect(server.current!.state.plans.get('plan-1')?.status).not.toBe('skipped');
  });

  it('does not offer logging after the workout is finished, even if the plan still says in progress', async () => {
    const user = userEvent.setup();
    const first = render(<PlanLogSheet plan={sorted} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getAllByRole('button', { name: 'Log set 1' })[0]);
    await user.click(screen.getByRole('button', { name: /Finish workout/ }));
    await settle();
    first.unmount();

    remote.session = {
      version: 1, activityId: 'plan-1', planId: 'plan-1', type: 'gym', subType: null, date: '2026-10-19', notes: '', tags: [], startedAt: Date.now(),
      sets: [{ id: 'remote-set', exercise_id: 'bench', exercise_name: 'Bench Press', set_number: 1, reps: 8, weight: 40, rpe: null, plan_set_id: 'ps-1' }],
      cardio: [], skipped: [], extras: [],
    };
    render(<PlanLogSheet plan={{ ...sorted, status: 'in_progress', activity_id: 'plan-1' }} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await settle();
    expect(screen.queryByRole('button', { name: /Log set/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Finish workout/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    expect(screen.getByText('This workout is finished. Logged sets are in your history.')).toBeTruthy();
    expect(screen.getByText(/2026-10-19 · done/)).toBeTruthy();
    expect(server.current!.state.calls.filter(call => call === 'start')).toEqual(['start']);
  });

  it('does not start a session when a done plan is opened with autoStart', async () => {
    render(<PlanLogSheet plan={{ ...sorted, status: 'done', activity_id: 'old-session' }} autoStart onClose={() => undefined} onSaved={() => undefined} />);
    await settle();
    expect(screen.queryByRole('button', { name: /Log set|Skip set|Skip cardio|Finish workout|Start workout/ })).toBeNull();
    expect(screen.getByText('This workout is finished. Logged sets are in your history.')).toBeTruthy();
    expect(server.current!.state.calls).toEqual([]);
    expect(server.current!.state.activities.size).toBe(0);
  });
});

describe('PlanLogSheet view only', () => {
  it('opens a planned workout read-only: no activity, status stays planned, nothing queued', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PlanLogSheet plan={sorted} onClose={onClose} onSaved={() => undefined} />);
    await settle();
    expect(screen.getByText(/2026-10-19 · view only/)).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Log set|Skip set|Finish workout|Add set|Add exercise/ })).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).toContain('8–10 reps · 40 kg');
    expect(text).toContain('Rest 60s');
    expect(text).toContain('8–10 reps · 12.5 kg / DB');
    expect(text).toContain('log 25 kg pair');
    expect(text).toContain('Target 20 min · 10% incline · 5.5 km/h · 180 kcal');
    await waitFor(() => expect(screen.getByTestId('plan-calories').textContent).toMatch(/\d+ kcal/));
    expect(screen.getAllByTestId('plan-view-set')).toHaveLength(2);
    expect(screen.queryByTestId('sync-status')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Guidance for Incline Dumbbell Press' }));
    await user.click(screen.getByRole('button', { name: 'Close workout' }));
    await settle();
    expect(onClose).toHaveBeenCalledOnce();
    expect(server.current!.state.calls).toEqual([]);
    expect(server.current!.state.activities.size).toBe(0);
    expect(server.current!.state.plans.get('plan-1')).toBeUndefined();
    expect(localStorage.getItem(sessionStorageKey('plan-1'))).toBeNull();
    expect(localStorage.getItem('perf-os-outbox') ?? '[]').toBe('[]');
  });

  it('starts from view only with one tap', async () => {
    const user = userEvent.setup();
    render(<PlanLogSheet plan={sorted} onClose={() => undefined} onSaved={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Start workout' }));
    await settle();
    expect(server.current!.state.activities.get('plan-1')?.status).toBe('in_progress');
    expect(server.current!.state.plans.get('plan-1')).toEqual({ status: 'in_progress', activity_id: 'plan-1' });
    expect(screen.getByText(/2026-10-19 · in progress/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Log set 1' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
  });
});
