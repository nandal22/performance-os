import LogWorkoutSheet from '@/components/LogWorkoutSheet';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import BottomNav from '@/components/BottomNav';
import ProgressPage from '@/pages/ProgressPage';
import TodayPlanCard from '@/components/TodayPlanCard';
import PlanLogSheet from '@/components/PlanLogSheet';
import PlanVsActual from '@/components/PlanVsActual';
import type { WorkoutCategory } from '@/types';
import { BW_TIMED_PLAN, BW_TIMED_SESSION, DETAIL_PREVIEW, PLAN_COMPARISON, PLAN_PREVIEW, PLAN_SUMMARY, PROGRESS_PREVIEW, RESUMED_SESSION } from '@/pages/shotFixtures';
import { sessionStorageKey } from '@/lib/workoutSession';

export default function ShotPage() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');

  if (shot === 'progress') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f3f2f2' }}>
        <ProgressPage previewCards={PROGRESS_PREVIEW} />
        <BottomNav />
      </div>
    );
  }

  if (shot === 'plan') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f3f2f2', color: '#201e1d' }}>
        <header data-testid="page-header" className="sticky top-0 z-20 px-4 pt-safe pb-4" style={{ background: '#f3f2f2', borderBottom: '2px solid #201e1d66' }}>
          <p data-testid="page-eyebrow" className="text-[10px] font-800 uppercase tracking-[0.1em]">Performance OS</p>
          <h1 className="text-base font-800">Home</h1>
        </header>
        <main className="px-4 py-5 max-w-lg mx-auto">
          <TodayPlanCard plan={PLAN_SUMMARY} bodyWeightKg={71.4} onStart={() => undefined} onView={() => undefined} onBrowse={() => undefined} />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (shot === 'plan-view' || shot === 'plan-log' || shot === 'plan-resumed') {
    // plan-view: planned, not started. plan-log: started, nothing logged. plan-resumed: two sets logged.
    // Sessions are seeded locally so no shot writes to the server.
    const key = sessionStorageKey(PLAN_PREVIEW.id);
    if (shot === 'plan-resumed') localStorage.setItem(key, JSON.stringify(RESUMED_SESSION));
    else if (shot === 'plan-log') localStorage.setItem(key, JSON.stringify({ ...RESUMED_SESSION, sets: [], cardio: [] }));
    else localStorage.removeItem(key);
    const plan = shot === 'plan-view' ? PLAN_PREVIEW : { ...PLAN_PREVIEW, status: 'in_progress' as const, activity_id: PLAN_PREVIEW.id };
    return (
      <div style={{ minHeight: '100dvh', background: '#f3f2f2' }}>
        <PlanLogSheet plan={plan} bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />
      </div>
    );
  }

  if (shot === 'plan-bwtimed') {
    // A BW + 15 kg dips set and a 52 s plank logged locally; nothing is written to the server.
    localStorage.setItem(sessionStorageKey(BW_TIMED_PLAN.id), JSON.stringify(BW_TIMED_SESSION));
    return (
      <div style={{ minHeight: '100dvh', background: '#f3f2f2' }}>
        <PlanLogSheet plan={BW_TIMED_PLAN} bodyWeightKg={71.4} onClose={() => undefined} onSaved={() => undefined} />
      </div>
    );
  }

  if (shot === 'plan-actual') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f3f2f2', color: '#201e1d' }}>
        <header data-testid="page-header" className="sticky top-0 z-10 px-4 pt-safe pb-4" style={{ background: '#f3f2f2', borderBottom: '2px solid #201e1d' }}>
          <p data-testid="page-eyebrow" className="text-[10px] font-800 uppercase tracking-[0.1em]">Saturday, Oct 17</p>
          <h1 className="text-base font-800">Gym</h1>
        </header>
        <main className="px-4 py-4 max-w-lg mx-auto">
          <PlanVsActual comparison={PLAN_COMPARISON} />
        </main>
      </div>
    );
  }

  if (shot === 'detail') {
    return (
      <div style={{ minHeight: '100dvh', background: '#f3f2f2' }}>
        <WorkoutDetailSheet
          activityId="shot-gym"
          preview={DETAIL_PREVIEW}
          onClose={() => undefined}
          onDeleted={() => undefined}
        />
      </div>
    );
  }

  const initialType: WorkoutCategory = shot === 'other' ? 'other' : 'gym';
  const initialExerciseName = shot === 'cardio' ? 'Cardio' : undefined;

  return (
    <div style={{ minHeight: '100dvh', background: '#f3f2f2' }}>
      <LogWorkoutSheet
        open
        initialType={initialType}
        initialExerciseName={initialExerciseName}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    </div>
  );
}
