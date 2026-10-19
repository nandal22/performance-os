import type { ActivityWithSets, Exercise, StrengthSetWithExercise } from '@/types';
import type { ProgressCard } from '@/services/progressCards';
import type { PlanComparison, PlanSummary, WorkoutPlan } from '@/services/plans';

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

export const PLAN_SUMMARY: PlanSummary = {
  id: 'plan-shot',
  plan_date: '2026-10-19',
  day_type: 'Pull',
  title: 'Back and biceps',
  notes: 'Leave a rep in the tank on the row.',
  status: 'planned',
  activity_id: null,
  exercise_count: 4,
};

export const PLAN_PREVIEW: WorkoutPlan = {
  ...PLAN_SUMMARY,
  exercises: [
    {
      id: 'pe-row',
      position: 1,
      exercise_id: 'row',
      exercise_name: 'Barbell Row',
      superset_group: null,
      note: null,
      sets: [
        {
          id: 'ps-row-1',
          set_number: 1,
          set_type: 'warmup',
          target_reps_min: 8,
          target_reps_max: 10,
          target_weight_kg: 40,
          target_rir_min: 3,
          target_rir_max: 4,
          rest_seconds: 60,
          note: null,
        },
        {
          id: 'ps-row-2',
          set_number: 2,
          set_type: 'top',
          target_reps_min: 6,
          target_reps_max: 8,
          target_weight_kg: 70,
          target_rir_min: 1,
          target_rir_max: 2,
          rest_seconds: 150,
          note: null,
        },
      ],
    },
    {
      id: 'pe-curl',
      position: 2,
      exercise_id: 'curl',
      exercise_name: 'Barbell Curl',
      superset_group: null,
      note: null,
      sets: [{
        id: 'ps-curl-1',
        set_number: 1,
        set_type: 'straight',
        target_reps_min: 10,
        target_reps_max: 12,
        target_weight_kg: 30,
        target_rir_min: 2,
        target_rir_max: 2,
        rest_seconds: 90,
        note: null,
      }],
    },
  ],
};

export const PLAN_COMPARISON: PlanComparison = {
  day_type: 'Pull',
  plan_date: '2026-10-17',
  exercises: [{
    name: 'Barbell Row',
    position: 1,
    sets: [
      {
        id: 'cmp-1',
        set_number: 1,
        set_type: 'top',
        target_reps_min: 6,
        target_reps_max: 8,
        target_weight_kg: 70,
        target_rir_min: 1,
        target_rir_max: 2,
        actual: { reps: 8, weight: 70, rpe: 8 },
      },
      {
        id: 'cmp-2',
        set_number: 2,
        set_type: 'backoff',
        target_reps_min: 8,
        target_reps_max: 10,
        target_weight_kg: 60,
        target_rir_min: 2,
        target_rir_max: 3,
        actual: { reps: 8, weight: 50, rpe: 7 },
      },
    ],
  }],
};
