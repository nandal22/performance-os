# performance-os: workout plans contract (v3, migration 019)

v3 adds bodyweight and timed exercises (019). Every v2 payload still works; see "v2 payloads" below.

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
- note text null                    -- for a cardio item: the cardio type shown and logged, e.g. 'Treadmill incline walk'
- target_duration_min numeric(5,1) null   -- cardio items only (018); > 0
- target_incline_pct numeric(4,1) null    -- cardio items only (018); 0..40
- target_speed_kmh numeric(4,1) null      -- cardio items only (018); > 0
- target_kcal integer null                -- cardio items only (018); >= 0. Used as the calorie estimate when set
- unique (plan_id, position)

### Cardio items (018)
A cardio item is a plan_exercises row whose exercise_id is the global 'Cardio' exercise
(category 'cardio'), with the target_* cardio fields and NO plan_sets. The app always shows
cardio items after the strength exercises, whatever their position. Logging one writes a
cardio_entries row (duration_minutes, calories, label) with plan_exercise_id set.

## plan_sets
- id uuid pk
- plan_exercise_id uuid not null references plan_exercises on delete cascade
- set_number int not null           -- 1-based
- set_type text not null default 'straight' check in ('warmup','top','backoff','straight')
- target_reps_min int null, target_reps_max int null (both or neither; equal for a fixed target; min<=max)
- target_duration_sec_min int null, target_duration_sec_max int null (019; both or neither; 0 < min <= max)
  A set has reps targets, seconds targets, or both; never neither (plan_sets_target_measure_check).
  For an exercise with exercises.measure = 'time' send the seconds targets and no reps.
- target_weight_kg numeric(6,2) null (null = no load / coach's choice)
  load_type 'per_dumbbell': the weight of ONE dumbbell (the app shows "X kg / DB" and logs 2X in strength_sets.weight).
  load_type 'bodyweight' (019): the ADDED load only; null or 0 = bodyweight only. The app shows "BW" or "BW + 15 kg".
  Added loads must be below body weight (see "v2 payloads").
  load_type 'total': the total load.
- target_rir_min numeric(3,1) null, target_rir_max numeric(3,1) null
- rest_seconds int null
- note text null
- unique (plan_exercise_id, set_number)

## exercises.load_type (018, 019)
- load_type text not null default 'total' check in ('total','per_dumbbell','bodyweight')
- 'bodyweight' (019) = the body is the load (dips, chin-ups, pull-ups, push-ups, plank...). Plan targets are the added load.
  When the coach inserts a new bodyweight exercise it MUST set load_type = 'bodyweight'.
- 'per_dumbbell' = a two-dumbbell movement. Plan targets are per dumbbell; logged strength_sets.weight stays the combined weight (unchanged history).
- One-arm / single-dumbbell movements stay 'total'.
- When the coach inserts a new two-dumbbell exercise it MUST set load_type = 'per_dumbbell'.

## exercises.measure (019)
- measure text not null default 'reps' check in ('reps','time')
- 'time' = held or carried for seconds (Plank, Farmer Carry). Plan sets use target_duration_sec_*; logged sets use duration_sec with reps null.
- measure and load_type are independent: Farmer Carry is per_dumbbell + time, Plank is bodyweight + time.
- When the coach inserts a new timed exercise it MUST set measure = 'time'.

## strength_sets load and time columns (019)
- weight stays the TOTAL load lifted, as in all history: body weight + added for bodyweight exercises, both dumbbells for per_dumbbell.
  volume (generated reps*weight), Progress, PRs and calories keep reading weight unchanged.
- added_weight_kg numeric(6,2) null (>= 0): the added load of a bodyweight set (0 = bodyweight only).
- bodyweight_kg numeric(5,2) null (> 0): the body weight used for that set (latest weigh-in on or before the date).
- duration_sec int null (> 0): seconds for a timed set. reps is null for a timed set, so its volume is 0.
- bodyweight_on(p_user_id uuid, p_date date) returns numeric: latest weigh-in on or before the date, else the first after.
- 019 back-filled added_weight_kg/bodyweight_kg on existing bodyweight sets and duration_sec on old Plank sets
  (reps were seconds). Original columns were not changed; every change is recorded in migration_019_changes (not exposed to the API).

## Linking actuals
- strength_sets gets plan_set_id uuid null references plan_sets(id) on delete set null.
- activities.id is stored on workout_plans.activity_id when the session is saved from a plan.
- Planned vs actual = join plan_sets to strength_sets on plan_set_id, and plan_exercises to cardio_entries on plan_exercise_id.
- cardio_entries gets plan_exercise_id uuid null references plan_exercises(id) on delete set null (018); unique (activity_id, plan_exercise_id).
- strength_sets: unique (activity_id, plan_set_id) where plan_set_id is not null (018).

## Live sessions (018, app only)
- activities.status text not null default 'done' check in ('in_progress','done'). Rows written by save_workout and all history are 'done'.
- start_workout_session(p_activity_id uuid, p_date date, p_type text, p_sub_type text = null, p_notes text = null, p_tags text[] = '{}', p_plan_id uuid = null) returns uuid
  Creates the activity as in_progress (client id, idempotent) and marks the plan in_progress with activity_id set.
- finish_workout_session(p_activity_id uuid, p_duration int = null, p_notes text = null, p_structured_metrics jsonb = null, p_plan_id uuid = null) returns uuid
  Marks the activity done (structured_metrics merged) and the plan done. Idempotent.
- discard_workout_session(p_activity_id uuid) returns void
  Deletes an in_progress activity and returns its plan to 'planned'. Never touches a done activity.
- Sets and cardio entries are written one by one with client-generated ids (upsert on id) as they are logged.
- The coach should not write activities; a plan in_progress or done is never replaced.

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
Preferred: call upsert_workout_plan(p_user_id uuid, p_plan_date date, p_day_type text, p_title text, p_notes text, p_exercises jsonb) returns uuid.
It refuses a plan whose status is not 'planned'. Signature unchanged in v3. p_exercises shape (cardio and duration keys optional, old payloads still work):

    [
      {"position": 1, "exercise_id": "<uuid>", "superset_group": "A", "note": "slow negatives",
       "sets": [{"set_number": 1, "set_type": "top", "target_reps_min": 6, "target_reps_max": 8,
                 "target_weight_kg": 27.5, "target_rir_min": 1, "target_rir_max": 2,
                 "rest_seconds": 120, "note": null}]},
      {"position": 2, "exercise_id": "<Dips uuid (bodyweight)>",
       "sets": [{"set_number": 1, "set_type": "top", "target_reps_min": 6, "target_reps_max": 8,
                 "target_weight_kg": 15},                                   // BW + 15 kg
                {"set_number": 2, "target_reps_min": 8, "target_reps_max": 10}]},   // BW
      {"position": 3, "exercise_id": "<Plank uuid (bodyweight, time)>",
       "sets": [{"set_number": 1, "target_duration_sec_min": 45, "target_duration_sec_max": 60,
                 "rest_seconds": 60}]},
      {"position": 4, "exercise_id": "<Farmer Carry uuid (per_dumbbell, time)>",
       "sets": [{"set_number": 1, "target_duration_sec_min": 40, "target_duration_sec_max": 60,
                 "target_weight_kg": 24}]},                                 // 24 kg / DB for 40-60 s
      {"position": 7, "exercise_id": "<Cardio exercise uuid>", "note": "Treadmill incline walk",
       "target_duration_min": 20, "target_incline_pct": 10, "target_speed_kmh": 5.5, "target_kcal": 180,
       "sets": []}
    ]

target_weight_kg is per dumbbell when load_type is 'per_dumbbell' and the ADDED load when it is 'bodyweight'.

### v2 payloads (still accepted)
- Bodyweight exercise with target_weight_kg at or above body weight on the plan date minus 0.5 kg (bodyweight_on):
  read as v2's body weight + added and stored as the added load (86.4 at 71.4 kg -> 15; 71.4 -> null = BW).
- Timed exercise with no target_duration_sec_* and target_reps_max >= 10: the reps are read as seconds
  (v2 planks wrote "65-75 reps" for 65-75 s). Smaller reps stay reps (e.g. Farmer Carry trips).
- Every other v2 payload is stored exactly as before.

## Logging (save_workout and live sessions)
save_workout signature unchanged. Each p_sets element may add (all optional):
    {"exercise_id": "<uuid>", "set_number": 1, "reps": 8, "weight": 86.4,
     "added_weight_kg": 15, "bodyweight_kg": 71.4,     // bodyweight sets; weight = total
     "duration_sec": null}                              // timed sets: reps null, duration_sec > 0
Old payloads without these keys are stored exactly as before. start/finish/discard_workout_session are unchanged.

Manual equivalent, inside one transaction: upsert workout_plans on (user_id, plan_date); delete its plan_exercises (cascade removes sets) ONLY if status = 'planned'; insert exercises and sets. Never modify a plan whose status is in_progress or done.

## RLS
Every table is owner-only for authenticated users (via plan ownership for child tables). anon has no access.
