import type { CardioRow, SetRow, SyncOp } from '@/lib/syncQueue';

// In-memory stand-in for the session RPCs and tables, with the same idempotent semantics.
export function createFakeSessionServer() {
  const state = {
    online: true,
    failNext: 0,
    calls: [] as SyncOp['kind'][],
    activities: new Map<string, { id: string; status: 'in_progress' | 'done'; date: string; type: string; duration: number | null; structured_metrics: Record<string, unknown> }>(),
    sets: new Map<string, SetRow>(),
    cardio: new Map<string, CardioRow>(),
    plans: new Map<string, { status: string; activity_id: string | null }>(),
  };

  async function execute(op: SyncOp) {
    state.calls.push(op.kind);
    if (!state.online) throw new Error('Failed to fetch');
    if (state.failNext > 0) {
      state.failNext -= 1;
      throw new Error('upstream timeout');
    }
    switch (op.kind) {
      case 'start':
        if (!state.activities.has(op.activityId)) {
          state.activities.set(op.activityId, { id: op.activityId, status: 'in_progress', date: op.args.date, type: op.args.type, duration: null, structured_metrics: {} });
        }
        if (op.args.planId) {
          const plan = state.plans.get(op.args.planId) ?? { status: 'planned', activity_id: null };
          if (plan.status === 'planned' || plan.status === 'in_progress') {
            state.plans.set(op.args.planId, { status: 'in_progress', activity_id: op.activityId });
          }
        }
        return;
      case 'meta': {
        const activity = state.activities.get(op.activityId);
        if (activity) Object.assign(activity, { date: op.args.date, type: op.args.type });
        return;
      }
      case 'upsertSet':
        if (!state.activities.has(op.row.activity_id)) throw new Error('violates foreign key');
        for (const other of state.sets.values()) {
          if (other.id !== op.row.id && other.plan_set_id && other.plan_set_id === op.row.plan_set_id && other.activity_id === op.row.activity_id) {
            throw new Error('duplicate key value violates unique constraint "strength_sets_activity_plan_set"');
          }
        }
        state.sets.set(op.row.id, { ...op.row });
        return;
      case 'deleteSet':
        state.sets.delete(op.id);
        return;
      case 'upsertCardio':
        state.cardio.set(op.row.id, { ...op.row });
        return;
      case 'deleteCardio':
        state.cardio.delete(op.id);
        return;
      case 'finish': {
        const activity = state.activities.get(op.activityId);
        if (!activity) throw new Error('session not found');
        Object.assign(activity, { status: 'done', duration: op.args.duration, structured_metrics: { ...activity.structured_metrics, ...op.args.structuredMetrics } });
        if (op.args.planId) state.plans.set(op.args.planId, { status: 'done', activity_id: op.activityId });
        return;
      }
      case 'discard': {
        if (state.activities.get(op.activityId)?.status !== 'in_progress') return;
        state.activities.delete(op.activityId);
        for (const [id, set] of state.sets) if (set.activity_id === op.activityId) state.sets.delete(id);
        for (const [id, entry] of state.cardio) if (entry.activity_id === op.activityId) state.cardio.delete(id);
        for (const [id, plan] of state.plans) if (plan.activity_id === op.activityId) state.plans.set(id, { status: 'planned', activity_id: null });
        return;
      }
    }
  }

  return { state, execute };
}

export type FakeSessionServer = ReturnType<typeof createFakeSessionServer>;
