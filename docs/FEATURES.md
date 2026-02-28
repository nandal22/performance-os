# Performance OS — Feature Reference

A personal fitness tracking PWA optimised for iPhone 13 (works on all modern browsers).

---

## Navigation

Five tabs in the bottom nav:

| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/` | Dashboard, recent workouts, body metric snapshot |
| History | `/history` | Full workout log with date filters |
| Sleep | `/sleep` | Sleep duration & quality log |
| Stats | `/analytics` | Training load, PR timeline, volume charts |
| Goals | `/goals` | Target tracking + body metrics logging |

---

## Home (Dashboard)

- **Recent Workouts** — last 5 sessions. Tap any row to open the full detail sheet.
- **Body Metrics Snapshot** — shows the most recently logged weight, body fat %, and waist measurement.
- **Continue Workout Banner** — if you closed the app mid-workout (within 24 hours), a banner appears to resume exactly where you left off.
- **+ FAB** — floating action button to start a new workout (also shows a "Restore / Discard" prompt if a draft exists).

---

## Logging a Workout

Tap **+** on the Home tab to open the Active Workout sheet.

### Workout types
`Strength` · `Cardio` · `Sport` · `Mobility` · `Other`

### Strength mode
1. **Choose exercise** — searchable picker; tracked exercises float to the top (⭐).
2. **Last session hint** — shows your previous sets for the chosen exercise so you can beat them.
3. **Log a set** — enter Reps × Weight (kg), tap **+ Log Set** (or press Enter). The button flashes green on success.
4. **Edit a set** — tap the pencil icon on any logged set to change reps/weight inline.
5. **Delete a set** — tap the trash icon.
6. **Star / track an exercise** — tap ⭐ next to the exercise name to mark it as tracked. Tracked exercises appear at the top of the picker.
7. **View progress** — when an exercise is tracked, a chart icon (📈) appears. Tap it to see a line chart of your max weight per session, plus all-time PR and session stats.
8. **Create a custom exercise** — type a name that doesn't exist in the picker. Category chips appear so you can assign Push / Pull / Legs / Core / Cardio / Mobility / Other before creating it.

### Cardio mode
Optionally enter: Distance (km) · Avg Heart Rate (bpm) · Calories.

### Common fields
- **Date** — defaults to today; change for backdated entries.
- **Duration (min)** — fill in when you finish.
- **Notes** — free-text notes about the session.

### Finishing
Tap **Finish Workout** to save everything to Supabase. The sheet closes and the dashboard refreshes.

### Draft persistence
- Every set you log is saved to `localStorage` immediately.
- If you close the sheet accidentally, your sets are safe for up to 24 hours.
- Re-opening with **+** shows a yellow "Restore / Discard" banner.
- Tapping **Continue Workout** on the dashboard auto-restores without showing the banner.

---

## History

Full paginated workout log.

- **Filters**: 7 days · 30 days · 3 months · All time
- Workouts are grouped by month with a count badge.
- Tap any row to open the **Workout Detail Sheet** (see below).

### Workout Detail Sheet
- Shows type, date, total duration, and notes.
- **Strength**: groups sets by exercise with set-by-set breakdown (reps × weight), plus total session volume (kg).
- **Cardio**: shows distance, avg HR, calories.
- **Delete** — two-tap confirmation to prevent accidents.

---

## Sleep

Log your sleep on the Sleep tab.

- **Bedtime** and **Wake time** (optional time pickers).
- **Duration (hours)** — calculated automatically if both times entered, or enter manually.
- **Quality** — 1–5 star rating.
- **Notes** — optional free-text.
- Recent sleep history shown below the form with quality stars and duration.

---

## Analytics (Stats)

Charts and summary tables powered by Recharts.

- **Training Load** — weekly bar chart showing strength vs cardio load.
- **PR Timeline** — line chart of estimated 1RM over time for each tracked lift.
- **Volume by Exercise** — bar chart of total volume per exercise in the selected period.
- **Top Exercises** — table sorted by total volume with max weight and set count.

---

## Goals

Set personal targets and track progress against real data.

### Adding a goal
1. Tap **Add goal**.
2. **Goal name** (optional) — give it a custom label like *"Run 40 km"* or *"Beach body"*. If left blank, the category name is used.
3. **What are you tracking?** — choose a metric type:
   - Body Weight (kg)
   - Waist (cm)
   - Body Fat %
   - Lift (1RM) — also pick which exercise
   - Distance (km)
   - Cardio Time (min)
4. **Target value** — the number you're aiming for.
5. **Target date** (optional) — deadline for the goal.
6. Tap **Add Goal**.

### Progress tracking
- **Body metric goals** (weight / waist / body fat) — progress is pulled from your latest logged body metrics.
- **Lift goals** — progress is your current estimated 1RM for that exercise (Epley formula).
- Goals show a progress bar (for lift goals) or a ✅ / "No data yet" indicator.
- Goals show "🎯 Reached!" when current ≥ target (lift) or current ≤ target (body metrics).

### Logging body metrics
On the Goals page, tap **Log today** under "Body Metrics" to record:
- Weight (kg)
- Waist (cm)
- Body Fat %

Multiple entries on the same date overwrite each other (upsert). The latest values appear on the Dashboard and Goals page.

---

## Exercises

Exercises come from a shared system library (pre-seeded) plus any custom exercises you create.

### Creating a custom exercise
In the workout sheet, search for an exercise that doesn't exist → category chips appear → pick the right category → tap **Create "Name" · category**. The exercise is saved to your account and immediately selected.

### Tracking / starring an exercise
Tap ⭐ in the workout sheet to toggle tracking. Tracked exercises:
- Float to the top of the exercise picker.
- Get a progress chart button (📈) for viewing historical weight data.

Tracking state is stored in `localStorage` (`perf-os-tracked`) — no database call needed.

---

## Technical Notes

| Detail | Value |
|--------|-------|
| Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v3.4 (dark theme) |
| Backend | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (magic link / email) |
| Charts | Recharts |
| Date utils | date-fns |
| PWA | Apple PWA meta tags, safe-area-inset CSS |
| Draft storage | `localStorage` key `perf-os-draft` |
| Exercise tracking | `localStorage` key `perf-os-tracked` |

---

## Database Tables

| Table | Description |
|-------|-------------|
| `activities` | Workout sessions |
| `strength_sets` | Individual sets per activity |
| `cardio_metrics` | Cardio data per activity |
| `exercises` | System + custom exercises |
| `body_metrics` | Daily body measurements |
| `goals` | User goals with optional exercise reference |
| `sleep_logs` | Nightly sleep records |
