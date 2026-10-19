# performance-os: workout plans contract (v1)

Owner user_id: d36bfaa7-abbb-4f6c-b691-dba7e11ce524. Supabase project gobicwnqqadquxpbdbae, schema public.
Writers: the app (authenticated user, RLS) and the Health & Wellness Coach agent (Supabase connector, which bypasses RLS, so it MUST always set user_id).

## workout_plans  (one plan per user per date)
- id uuid pk default gen_random_uuid()
- user_id uuid not null default auth.uid() references auth.users on delete cascade
- plan_date date not null
- day_type text not null            -- free text, e.g. 'Pull', 'Push', 'Legs', 'Upper', 'Lower + Arms'
- title text                        -- optional display title
- notes text                        -- coach's overall notes for the day
- status text not null default 'planned' check in ('planned','in_progress','done','skipped')
- activity_id uuid null references activities(id) on delete set null   -- the logged session, set by the app
- source text not null default 'coach'
- created_at timestamptz default now(), updated_at timestamptz default now() (trigger)
- unique (user_id, plan_date)       -- upsert key: on conflict (user_id, plan_date)

## plan_exercises
- id uuid pk
- plan_id uuid not null references workout_plans on delete cascade
- position int not null             -- 1-based order
- exercise_id uuid not null references exercises(id)
- superset_group text null          -- e.g. 'A' to pair exercises
- note text null
- unique (plan_id, position)

## plan_sets
- id uuid pk
- plan_exercise_id uuid not null references plan_exercises on delete cascade
- set_number int not null           -- 1-based
- set_type text not null default 'straight' check in ('warmup','top','backoff','straight')
- target_reps_min int not null, target_reps_max int not null (equal for a fixed target; check min<=max)
- target_weight_kg numeric(6,2) null (null = bodyweight / coach's choice)
- target_rir_min numeric(3,1) null, target_rir_max numeric(3,1) null
- rest_seconds int null
- note text null
- unique (plan_exercise_id, set_number)

## Linking actuals
- strength_sets gets plan_set_id uuid null references plan_sets(id) on delete set null.
- activities.id is stored on workout_plans.activity_id when the session is saved from a plan.
- Planned vs actual = join plan_sets to strength_sets on plan_set_id.

## exercise_guidance  (one row per exercise; coach may write it)
- exercise_id uuid pk references exercises(id) on delete cascade
- setup text, movement text, common_mistakes text
- image_urls text[] default '{}'    -- ordered frames (e.g. start/end) for a 2-frame animation
- video_url text null               -- e.g. a YouTube link
- source text, license text         -- attribution
- updated_at timestamptz

## Exercise references
Reference the existing exercises table BY ID. To resolve a name: match lower(name) against exercises where user_id is null (global) or user_id = owner. If none, insert a new exercise (name, category, primary_muscle, equipment, is_custom=true, user_id=owner) and use its id.

## Coach write recipe
Inside one transaction: upsert workout_plans on (user_id, plan_date); delete its plan_exercises (cascade removes sets) ONLY if status = 'planned'; insert exercises and sets. Never modify a plan whose status is in_progress or done.

## RLS
Every table is owner-only for authenticated users (via plan ownership for child tables). anon has no access.
