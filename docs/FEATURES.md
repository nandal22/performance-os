# Performance OS Feature Reference

Personal workout, nutrition, steps, and progress tracking PWA optimized for iPhone use.

## Navigation

| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/` | Daily dashboard, guided/custom workout history, body snapshot, quick workout logging |
| Plan | `/plan` | Flexible 7-day cut-phase workout guide with warm-up, workout, stretch, media, and save flow |
| Food | `/calories` | Calories, macros, raw meal notes, meal estimates, quick foods, and daily steps |
| Progress | `/progress` | Automatic compound lift cards plus searchable exercise progression |
| Settings | `/settings` | Add/delete custom exercises and app preferences |

Legacy `/history` and `/goals` routes redirect to Home. Body metrics remain available at `/body` for weight-based estimates.

## Home

- Shows the current suggested plan day and today’s calorie status.
- Shows the latest body metrics snapshot.
- Lists workout history directly on the Home screen, including guided plan sessions and custom workouts.
- The floating `+` button opens the free-form workout logger for strength, cardio, sport, mobility, or other workouts.

## Guided Plan

- You can select any Day 1-7, so a missed workout can be done on a later date.
- The saved activity records the selected workout day and the actual date you performed it.
- In-progress guided sessions auto-save to your Supabase account when reachable and fall back to same-device local resume.
- Warm-up, workout, post-workout stretch, and recovery steps can be checked off.
- Media mode supports still images or motion frames from Free Exercise DB.
- Strength sets are saved to normal exercise history so Progress can reuse them.

## Workout Logging

Session types are Gym, Cult, Swim, Run, and Others. Others stores a free-text paragraph in `activities.notes`.

Strength logging supports:

- Custom exercise search and inline exercise creation.
- Total weight, two-dumbbell, bar/rod plus plates, and bodyweight load modes.
- Last-session hints and draft recovery.
- Estimated calories burned from latest body weight, duration, reps, and effective load.

Cardio inside a gym workout:

- Pick the `Cardio` exercise the same way as any other exercise.
- Enter minutes, calories, and a free-text type such as `Treadmill incline walk` or `Stair climber`.
- A workout can contain several cardio entries. They are stored in `cardio_entries` and are left out of weight, volume, and PR totals.
- Swim, Run, and non-strength Cult sessions still record session-level distance, heart rate, and calories. Older `cardio_metrics` rows stay readable.

## Tests

`npm test` runs the migration cases against a throwaway local Postgres database and the frontend cases for Cardio and Others. It does not connect to the hosted project.

## Food And Steps

- Manual food logging with calories and macros.
- Raw meal notes when calories are unknown, so the meal is not lost.
- Local meal estimator for common foods such as chapati, paneer, dal, rice, eggs, whey, banana, and more.
- Open Food Facts lookup for packaged/common products, with serving-sized macros and cached results.
- User-editable quick-add food cards.
- Daily steps saved alongside food tracking.

## Progress

- Automatically surfaces main compound movement cards such as Bench Press, Squat, Deadlift, Overhead Press, Dumbbell Overhead Press, Barbell Row, Romanian Deadlift, Pull-up, Leg Press, and Hip Thrust.
- Each card shows last-session sets, max logged-weight PR, and trend versus the previous session.
- Search any exercise to inspect recent sessions, volume, sets, and max-weight trend.

## Database Tables

| Table | Description |
|-------|-------------|
| `activities` | Workout sessions |
| `strength_sets` | Individual strength sets per activity |
| `cardio_metrics` | Older session-level cardio details |
| `cardio_entries` | Cardio blocks inside a workout: minutes, calories, and type text |
| `exercises` | System and custom exercises |
| `body_metrics` | Daily body measurements |
| `calorie_logs` | Daily food entries, raw notes, and macros |
| `daily_steps` | Daily step count |
| `quick_foods` | User-editable quick-add food cards |

Unused goal and sleep tables were removed from the active schema in migration `009_drop_unused_goal_sleep_tables.sql`.
