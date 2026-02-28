// Supabase database types matching 001_initial_schema.sql
// Replace with generated output once project is created:
// npx supabase gen types typescript --project-id YOUR_ID > src/db/database.types.ts

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          type: 'strength' | 'cardio' | 'sport' | 'mobility' | 'custom';
          duration: number | null;
          notes: string | null;
          tags: string[];
          structured_metrics: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          type: 'strength' | 'cardio' | 'sport' | 'mobility' | 'custom';
          duration?: number | null;
          notes?: string | null;
          tags?: string[];
          structured_metrics?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          date?: string;
          type?: 'strength' | 'cardio' | 'sport' | 'mobility' | 'custom';
          duration?: number | null;
          notes?: string | null;
          tags?: string[];
          structured_metrics?: Record<string, unknown>;
          updated_at?: string;
        };
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          category: string;
          primary_muscle: string;
          secondary_muscles: string[];
          equipment: string | null;
          is_custom: boolean;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          primary_muscle: string;
          secondary_muscles?: string[];
          equipment?: string | null;
          is_custom?: boolean;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          category?: string;
          primary_muscle?: string;
          secondary_muscles?: string[];
          equipment?: string | null;
        };
      };
      strength_sets: {
        Row: {
          id: string;
          activity_id: string;
          exercise_id: string;
          set_number: number;
          reps: number | null;
          weight: number | null;
          rpe: number | null;
          rest: number | null;
          tempo: string | null;
          volume: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          activity_id: string;
          exercise_id: string;
          set_number: number;
          reps?: number | null;
          weight?: number | null;
          rpe?: number | null;
          rest?: number | null;
          tempo?: string | null;
          created_at?: string;
        };
        Update: {
          set_number?: number;
          reps?: number | null;
          weight?: number | null;
          rpe?: number | null;
          rest?: number | null;
          tempo?: string | null;
        };
      };
      cardio_metrics: {
        Row: {
          id: string;
          activity_id: string;
          distance: number | null;
          avg_heart_rate: number | null;
          max_heart_rate: number | null;
          elevation: number | null;
          calories: number | null;
          avg_pace: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          activity_id: string;
          distance?: number | null;
          avg_heart_rate?: number | null;
          max_heart_rate?: number | null;
          elevation?: number | null;
          calories?: number | null;
          avg_pace?: string | null;
          created_at?: string;
        };
        Update: {
          distance?: number | null;
          avg_heart_rate?: number | null;
          max_heart_rate?: number | null;
          elevation?: number | null;
          calories?: number | null;
          avg_pace?: string | null;
        };
      };
      body_metrics: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          weight: number | null;
          waist: number | null;
          chest: number | null;
          thigh: number | null;
          body_fat: number | null;
          resting_hr: number | null;
          sleep_hours: number | null;
          steps: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          weight?: number | null;
          waist?: number | null;
          chest?: number | null;
          thigh?: number | null;
          body_fat?: number | null;
          resting_hr?: number | null;
          sleep_hours?: number | null;
          steps?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          weight?: number | null;
          waist?: number | null;
          chest?: number | null;
          thigh?: number | null;
          body_fat?: number | null;
          resting_hr?: number | null;
          sleep_hours?: number | null;
          steps?: number | null;
          notes?: string | null;
        };
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          type: 'weight' | 'waist' | 'lift' | 'cardio_distance' | 'cardio_time' | 'body_fat';
          exercise_id: string | null;
          target_value: number;
          target_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'weight' | 'waist' | 'lift' | 'cardio_distance' | 'cardio_time' | 'body_fat';
          exercise_id?: string | null;
          target_value: number;
          target_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          target_value?: number;
          target_date?: string | null;
          is_active?: boolean;
        };
      };
    };
    Functions: {
      get_exercise_summaries: { Args: Record<string, never>; Returns: unknown[] };
      get_personal_records: { Args: Record<string, never>; Returns: unknown[] };
    };
  };
};
