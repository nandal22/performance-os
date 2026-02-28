# Personal Performance OS — Build Progress

> **Purpose:** This file tracks every decision, completed phase, and next step.
> Any new Claude session or developer can read this and resume immediately.

---

## Project Overview

| Item | Value |
|------|-------|
| App name | Personal Performance OS |
| Description | Mobile-first fitness intelligence system (not a basic logger) |
| Deploy URL | `tracker.sachinnandal.me` |
| Stack | React + Vite + TypeScript + Supabase (PostgreSQL) + Tailwind + shadcn/ui |
| Auth | Supabase Google OAuth |
| Hosting | Vercel (free tier) |
| Database | Supabase free tier (PostgreSQL) |

---

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Data layer | Supabase (PostgreSQL) | Complex analytics (rolling avg, PR detection, training load) need SQL window functions. Firestore can't do this efficiently. |
| Frontend | React + Vite + TypeScript | Fast dev, type-safe, same ecosystem as cashflow |
| Styling | Tailwind CSS + shadcn/ui | Same as cashflow — consistent component style |
| Auth | Supabase Google OAuth | Free, familiar, same Google account |
| Analytics | Pure TypeScript functions | Isolated from UI, fully testable |
| RLS | Supabase Row Level Security | Users can only read/write their own data — no backend needed |
| Volume | Generated column in PostgreSQL | `reps × weight` always consistent, no client-side bugs |

---

## Phase Status

### ✅ Phase 1 — Core Architecture (COMPLETE)

**What was built:**
- `supabase/migrations/001_initial_schema.sql` — Full PostgreSQL schema with RLS
- `src/types/index.ts` — All TypeScript interfaces
- `src/db/supabase.ts` — Supabase client
- `src/db/database.types.ts` — Type placeholder (replace with generated types after Supabase project is created)
- `src/services/activities.ts` — Activities CRUD
- `src/services/exercises.ts` — Exercise library (system + custom)
- `src/services/strengthSets.ts` — Strength sets with PR/summary RPCs
- `src/services/bodyMetrics.ts` — Body metrics CRUD
- `src/services/cardioMetrics.ts` — Cardio metrics CRUD
- `src/hooks/useAuth.ts` — Auth state hook + Google sign-in
- `src/lib/utils.ts` — Epley 1RM, formatters, utils
- `tailwind.config.js` — Custom colors per activity type
- `vite.config.ts` — Path alias `@/` → `src/`
- `src/index.css` — Dark base theme (CSS variables)

**Tables created:**
- `activities` — Every workout session
- `exercises` — Library (22 system exercises seeded)
- `strength_sets` — Per-set data, volume as generated column
- `cardio_metrics` — 1:1 with cardio activities
- `body_metrics` — Daily body measurements
- `goals` — Schema ready (used in Phase 3)

---

### ⏳ Phase 2 — Analytics Engine (NEXT)

**Scope:**
- `src/analytics/strength.ts` — Volume, Epley 1RM, rolling 4-week avg, PR detection, plateau detection
- `src/analytics/trainingLoad.ts` — Daily/weekly load score, overtraining/undertraining flag
- `src/analytics/bodyComposition.ts` — Weight+waist+strength trend → recomp/bulk/cut detection
- `supabase/migrations/002_analytics_functions.sql` — SQL RPCs for `get_exercise_summaries`, `get_personal_records`

**Key algorithms:**
- Strength load = volume × intensity multiplier (based on RPE)
- Cardio load = duration × HR zone multiplier
- 4-week rolling 1RM = window function over strength_sets joined to activities

---

### ⏳ Phase 3 — Goal Engine

**Scope:**
- Goal model complete (DB schema exists)
- `src/services/goals.ts`
- `src/analytics/goals.ts` — progress %, required improvement/week, timeline estimate, feasibility score 1–10

---

### ⏳ Phase 4 — Dashboard + UI

**Scope:**
- Today's readiness score card
- Weekly load graph (bar chart)
- Weight trend (line chart)
- Active goals progress
- Last workout summary
- Muscle frequency heatmap

**Key pages:**
- `/` — Dashboard
- `/log` — Quick log workout
- `/history` — All activities
- `/body` — Body metrics & trends
- `/goals` — Goal tracker
- `/settings` — Profile, export

---

### ⏳ Phase 5 — Health Data Integration

**Scope:**
- Apple Health CSV import (export from iPhone Health app)
- Noise Fit data investigation
- `ExternalDataProvider` abstraction

---

### ⏳ Phase 6 — Smart Features

**Scope:**
- Recovery score (sleep + training load)
- Deload week detection
- Weekly AI text summary (structured, no LLM dependency by default)
- Streak tracking
- Habit tracking

---

## Setup Instructions (for new session)

### 1. Supabase Project

1. Go to [supabase.com](https://supabase.com) → New project (free tier)
2. Note: `Project URL` and `anon key`
3. Run the migration: Dashboard → SQL Editor → paste `supabase/migrations/001_initial_schema.sql` → Run
4. Enable Google Auth: Authentication → Providers → Google → enable, add Client ID + Secret from Google Cloud Console

### 2. Environment

```bash
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### 3. Generate Supabase types (optional but recommended)

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/db/database.types.ts
```

### 4. Install & run

```bash
npm install
npm run dev
```

### 5. Vercel deployment

- Connect GitHub repo to Vercel
- Add env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Add domain: `tracker.sachinnandal.me`
- Supabase Auth: add `tracker.sachinnandal.me` to Redirect URLs

---

## File Structure

```
performance-os/
├── src/
│   ├── types/index.ts          ← All TypeScript interfaces
│   ├── db/
│   │   ├── supabase.ts         ← Supabase client
│   │   └── database.types.ts  ← Generated types (placeholder)
│   ├── services/
│   │   ├── activities.ts
│   │   ├── exercises.ts
│   │   ├── strengthSets.ts
│   │   ├── bodyMetrics.ts
│   │   └── cardioMetrics.ts
│   ├── analytics/              ← Phase 2 (pure functions, no UI)
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── components/
│   │   └── ui/                 ← shadcn/ui components
│   ├── pages/                  ← Route pages
│   ├── lib/
│   │   └── utils.ts            ← Epley, formatters, cn()
│   └── index.css               ← Dark theme CSS variables
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── PROGRESS.md                 ← THIS FILE
├── .env.example
└── vite.config.ts
```
