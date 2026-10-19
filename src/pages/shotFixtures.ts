import type { ActivityWithSets, Exercise, StrengthSetWithExercise } from '@/types';
import type { ProgressCard } from '@/services/progressCards';

const exercise = (id: string, name: string): Exercise => ({
  id,
  name,
  category: 'push',
  primary_muscle: '',
  secondary_muscles: [],
  is_custom: false,
  created_at: '',
});

function setsFor(name: string, rows: Array<[number, number, number]>): StrengthSetWithExercise[] {
  const lift = exercise(name, name);
  return rows.map(([setNumber, reps, weight]) => ({
    id: `${name}-${setNumber}`,
    activity_id: 'shot-gym',
    exercise_id: name,
    set_number: setNumber,
    reps,
    weight,
    volume: reps * weight,
    created_at: '',
    exercise: lift,
  }));
}

export const PROGRESS_PREVIEW: ProgressCard[] = [
  {
    exercise_id: 'bench',
    exercise_name: 'Bench Press',
    last_date: '2026-07-08',
    previous_max: 90,
    pr_weight: 90,
    pr_reps: 1,
    last_sets: [
      { set_number: 1, weight: 60, reps: 6 },
      { set_number: 2, weight: 80, reps: 3 },
      { set_number: 3, weight: 60, reps: 6 },
      { set_number: 4, weight: 60, reps: 6 },
      { set_number: 5, weight: 40, reps: 8 },
    ],
    sparkline: [70, 75, 80, 85, 88, 90, 85, 80].map((weight, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      weight,
    })),
  },
  {
    exercise_id: 'squat',
    exercise_name: 'Squat',
    last_date: '2026-10-15',
    previous_max: 100,
    pr_weight: 115,
    pr_reps: 3,
    last_sets: [
      { set_number: 1, weight: 60, reps: 6 },
      { set_number: 2, weight: 105, reps: 4 },
      { set_number: 3, weight: 80, reps: 8 },
      { set_number: 4, weight: 70, reps: 8 },
    ],
    sparkline: [90, 95, 100, 105, 100, 110, 112, 105].map((weight, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      weight,
    })),
  },
  {
    exercise_id: 'deadlift',
    exercise_name: 'Deadlift',
    last_date: '2026-08-14',
    previous_max: 80,
    pr_weight: 120,
    pr_reps: 3,
    last_sets: [
      { set_number: 1, weight: 80, reps: 5 },
      { set_number: 2, weight: 80, reps: 3 },
    ],
    sparkline: [100, 105, 110, 115, 120, 115, 120, 80].map((weight, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      weight,
    })),
  },
  {
    exercise_id: 'row',
    exercise_name: 'Barbell Row',
    last_date: '2026-08-02',
    previous_max: 70,
    pr_weight: 80,
    pr_reps: 5,
    last_sets: [{ set_number: 1, weight: 70, reps: 8 }],
    sparkline: [60, 65, 70].map((weight, index) => ({ date: `2026-07-1${index}`, weight })),
  },
];

const lateral = setsFor('Lateral Raise', [[1, 22, 15], [2, 15, 20], [3, 20, 15], [4, 20, 10]]);
const press = setsFor('Shoulder Dumbbell Press', [[1, 12, 30], [2, 9, 40], [3, 12, 35], [4, 6, 35]]);
const face = setsFor('Face Pull', [[1, 20, 27], [2, 20, 25], [3, 14, 27]]);

export const DETAIL_PREVIEW: ActivityWithSets = {
  id: 'shot-gym',
  user_id: 'shot',
  date: '2026-10-17',
  type: 'gym',
  duration: 55,
  notes: '',
  tags: [],
  structured_metrics: { calorieEstimate: { calories: 152 } },
  created_at: '',
  updated_at: '',
  strength_sets: [...lateral, ...press, ...face],
  cardio_entries: [],
};
