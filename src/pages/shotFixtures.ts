import type { ActivityWithSets, Exercise, StrengthSetWithExercise } from '@/types';
import type { ProgressCard } from '@/services/progressCards';
import type { PlanComparison, PlanSummary, WorkoutPlan } from '@/services/plans';
import type { WorkoutSession } from '@/lib/workoutSession';

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

const NO_CARDIO = { target_duration_min: null, target_incline_pct: null, target_speed_kmh: null, target_kcal: null };

export const PLAN_PREVIEW: WorkoutPlan = {
  id: 'plan-shot',
  plan_date: '2026-10-19',
  day_type: 'Push',
  title: 'Chest, shoulders, and a walk',
  notes: 'Leave a rep in the tank on the presses.',
  status: 'planned',
  activity_id: null,
  exercise_count: 3,
  planned: [],
  exercises: [
    {
      id: 'pe-row',
      position: 2,
      exercise_id: 'row',
      exercise_name: 'Barbell Row',
      superset_group: null,
      note: null,
      is_cardio: false,
      load_type: 'total',
      ...NO_CARDIO,
      sets: [{
        id: 'ps-row-1',
        set_number: 1,
        set_type: 'top',
        target_reps_min: 6,
        target_reps_max: 8,
        target_weight_kg: 70,
        target_rir_min: 1,
        target_rir_max: 2,
        rest_seconds: 150,
        note: null,
      }],
    },
    {
      id: 'pe-incline',
      position: 3,
      exercise_id: 'incline-db',
      exercise_name: 'Incline Dumbbell Press',
      superset_group: null,
      note: null,
      is_cardio: false,
      load_type: 'per_dumbbell',
      ...NO_CARDIO,
      sets: [
        {
          id: 'ps-incline-1',
          set_number: 1,
          set_type: 'top',
          target_reps_min: 6,
          target_reps_max: 8,
          target_weight_kg: 27.5,
          target_rir_min: 1,
          target_rir_max: 2,
          rest_seconds: 120,
          note: null,
        },
        {
          id: 'ps-incline-2',
          set_number: 2,
          set_type: 'backoff',
          target_reps_min: 8,
          target_reps_max: 10,
          target_weight_kg: 25,
          target_rir_min: 2,
          target_rir_max: 3,
          rest_seconds: 90,
          note: null,
        },
      ],
    },
    {
      id: 'pe-walk',
      position: 4,
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
  ],
};
PLAN_PREVIEW.planned = PLAN_PREVIEW.exercises;

export const PLAN_SUMMARY: PlanSummary = {
  id: PLAN_PREVIEW.id,
  plan_date: PLAN_PREVIEW.plan_date,
  day_type: PLAN_PREVIEW.day_type,
  title: PLAN_PREVIEW.title,
  notes: PLAN_PREVIEW.notes,
  status: PLAN_PREVIEW.status,
  activity_id: null,
  exercise_count: PLAN_PREVIEW.exercises.length,
  planned: PLAN_PREVIEW.exercises,
};

export const RESUMED_SESSION: WorkoutSession = {
  version: 1,
  activityId: 'plan-shot',
  planId: 'plan-shot',
  type: 'gym',
  subType: null,
  date: '2026-10-19',
  notes: 'Push',
  tags: ['Push'],
  startedAt: Date.now() - 25 * 60_000,
  sets: [
    { id: 'shot-set-1', exercise_id: 'row', exercise_name: 'Barbell Row', set_number: 1, reps: 8, weight: 70, rpe: 8, plan_set_id: 'ps-row-1' },
    { id: 'shot-set-2', exercise_id: 'incline-db', exercise_name: 'Incline Dumbbell Press', set_number: 1, reps: 7, weight: 55, rpe: 8.5, plan_set_id: 'ps-incline-1', load_mode: 'dumbbell_pair' },
  ],
  cardio: [],
  skipped: [],
  extras: [],
};

export const PLAN_COMPARISON: PlanComparison = {
  day_type: 'Push',
  plan_date: '2026-10-17',
  exercises: [
    {
      name: 'Incline Dumbbell Press',
      position: 1,
      load_type: 'per_dumbbell',
      cardio: null,
      sets: [
        {
          id: 'cmp-1',
          set_number: 1,
          set_type: 'top',
          target_reps_min: 6,
          target_reps_max: 8,
          target_weight_kg: 27.5,
          target_rir_min: 1,
          target_rir_max: 2,
          actual: { reps: 8, weight: 55, rpe: 8 },
        },
        {
          id: 'cmp-2',
          set_number: 2,
          set_type: 'backoff',
          target_reps_min: 8,
          target_reps_max: 10,
          target_weight_kg: 25,
          target_rir_min: 2,
          target_rir_max: 3,
          actual: { reps: 8, weight: 45, rpe: 7 },
        },
      ],
    },
    {
      name: 'Cardio',
      position: 2,
      load_type: 'total',
      sets: [],
      cardio: {
        label: 'Treadmill incline walk',
        target_duration_min: 20,
        target_incline_pct: 10,
        target_speed_kmh: 5.5,
        target_kcal: 180,
        actual: { minutes: 22, calories: 195, label: 'Treadmill incline walk' },
      },
    },
  ],
};
