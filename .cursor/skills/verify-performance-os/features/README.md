# Performance OS verification map

This directory is the maintained source for verifying user-facing behavior of Performance OS. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch the Vite dev server at `http://127.0.0.1:5173` from this checkout.
- Copy `.env.example` to `.env` when `.env` is missing. That file holds the public Supabase URL and publishable key already committed in the example. It does not hold a user session.
- Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs doctor` and require `ok: true`.
- Drive only an instance this verification run started.
- Viewport is 390x844, the iPhone-sized surface the owner uses.

## Driving conventions

- Start every recipe from the signed-out login gate unless its preconditions say a session exists.
- Match controls by accessible name or visible text.
- Treat every command as literal.
- Run browser actions through `drive.mjs`.
- Do not complete Google OAuth and do not write to the live database during verification.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes page text and a 390x844 screenshot.
- Record the feature ID and entry point with every artifact.
- Report an unreachable authenticated path with the attempted command and the missing owner session.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph. It then uses exactly four H2 sections in this order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with drive.mjs`
4. `Gotchas`

## Features

- [Sign in](./sign-in.md) covers the logged-out gate and the Google handoff.
- [Home](./home.md) covers the dashboard, week strip, and workout history list.
- [Log a workout](./log-workout.md) covers the log sheet opened from Home.
- [Progress](./progress.md) covers the progress tab.
- [Settings](./settings.md) covers exercise management and sign-out is not here. Sign out lives on Home.
