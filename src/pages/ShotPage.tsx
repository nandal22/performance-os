import LogWorkoutSheet from '@/components/LogWorkoutSheet';
import type { WorkoutCategory } from '@/types';

export default function ShotPage() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
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
