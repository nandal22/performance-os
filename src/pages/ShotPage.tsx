import LogWorkoutSheet from '@/components/LogWorkoutSheet';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import BottomNav from '@/components/BottomNav';
import ProgressPage from '@/pages/ProgressPage';
import type { WorkoutCategory } from '@/types';
import { DETAIL_PREVIEW, PROGRESS_PREVIEW } from '@/pages/shotFixtures';

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
