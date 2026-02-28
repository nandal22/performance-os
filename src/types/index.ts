// ============================================================
// Performance OS — Core TypeScript Types
// ============================================================

// ---- Enums ----

export type ActivityType = 'strength' | 'cardio' | 'sport' | 'mobility' | 'custom';

export type GoalType = 'weight' | 'waist' | 'lift' | 'cardio_distance' | 'cardio_time' | 'body_fat';

export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'cardio' | 'mobility' | 'other';

export type Equipment = 'barbell' | 'dumbbell' | 'bodyweight' | 'machine' | 'cable' | 'kettlebell' | 'bands' | 'other';

// ---- Core Entities ----

export interface Activity {
  id: string;
  user_id: string;
  date: string;           // ISO date YYYY-MM-DD
  type: ActivityType;
  duration?: number;      // minutes
  notes?: string;
  tags: string[];
  structured_metrics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment?: Equipment;
  is_custom: boolean;
  user_id?: string;       // null = system exercise
  created_at: string;
}

export interface StrengthSet {
  id: string;
  activity_id: string;
  exercise_id: string;
  set_number: number;
  reps?: number;
  weight?: number;        // kg
  rpe?: number;           // 1–10
  rest?: number;          // seconds
  tempo?: string;         // e.g., '3-1-2-0'
  volume: number;         // generated: reps * weight
  created_at: string;
}

export interface CardioMetrics {
  id: string;
  activity_id: string;
  distance?: number;      // km
  avg_heart_rate?: number;
  max_heart_rate?: number;
  elevation?: number;     // meters
  calories?: number;
  avg_pace?: string;      // e.g., '5:30'
  created_at: string;
}

export interface BodyMetric {
  id: string;
  user_id: string;
  date: string;           // ISO date YYYY-MM-DD
  weight?: number;        // kg
  waist?: number;         // cm
  chest?: number;         // cm
  thigh?: number;         // cm
  body_fat?: number;      // %
  resting_hr?: number;
  sleep_hours?: number;
  steps?: number;
  notes?: string;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  type: GoalType;
  exercise_id?: string;   // for lift goals
  target_value: number;
  target_date?: string;
  notes?: string;         // user-visible label, e.g. "Run 40km", "Beach body"
  is_active: boolean;
  created_at: string;
}

// ---- Composite / View Types ----

export interface StrengthSetWithExercise extends StrengthSet {
  exercise: Exercise;
}

export interface ActivityWithSets extends Activity {
  strength_sets?: StrengthSetWithExercise[];
  cardio_metrics?: CardioMetrics;
}

// ---- Analytics Types (used by Phase 2 analytics engine) ----

export interface ExerciseSummary {
  exercise_id: string;
  exercise_name: string;
  total_volume: number;
  max_weight: number;
  estimated_1rm: number;
  set_count: number;
  last_performed: string;
}

export interface PRRecord {
  exercise_id: string;
  exercise_name: string;
  weight: number;
  reps: number;
  estimated_1rm: number;
  achieved_on: string;    // activity date
}

export interface TrainingLoad {
  date: string;
  strength_load: number;
  cardio_load: number;
  total_load: number;
}

export interface WeeklyLoad {
  week_start: string;
  total_load: number;
  strength_load: number;
  cardio_load: number;
  session_count: number;
  status: 'undertraining' | 'optimal' | 'overtraining';
}

// ---- Sleep ----

export interface SleepLog {
  id:           string;
  user_id:      string;
  date:         string;         // wake-up date YYYY-MM-DD
  bedtime?:     string;         // "23:30"
  wake_time?:   string;         // "07:00"
  duration_hrs?: number;        // hours
  quality?:     number;         // 1–5
  notes?:       string;
  created_at:   string;
}

export type CreateSleepLog = Omit<SleepLog, 'id' | 'user_id' | 'created_at'>;

// ---- Forms / Input Types ----

export type CreateActivity = Omit<Activity, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type CreateStrengthSet = Omit<StrengthSet, 'id' | 'volume' | 'created_at'>;
export type CreateCardioMetrics = Omit<CardioMetrics, 'id' | 'created_at'>;
export type CreateBodyMetric = Omit<BodyMetric, 'id' | 'user_id' | 'created_at'>;
export type CreateGoal = Omit<Goal, 'id' | 'user_id' | 'created_at'>;
export type CreateExercise = Omit<Exercise, 'id' | 'created_at'>;
