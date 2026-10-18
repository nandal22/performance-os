# Home

Home is the signed-in dashboard. It shows this week's sessions, the latest body weight, and the workout list. The floating log button opens the workout logger.

## Sub-features

- `home-list` shows recent workouts.
- `home-week` filters the list by a day in the week strip.
- `home-log` opens the log sheet.
- `home-sign-out` returns to the login gate.

## How to get to it (user POV)

- Sign in, then land on `/`.
- Choose the `Home` tab in the bottom nav from Progress, Weight, or Settings.

## Driving it with drive.mjs

Preconditions:

- Doctor reports `ok: true`.
- The verification browser holds the owner's Supabase session cookie for this origin.
- This checkout does not provide that session. Without it, stop and report the unmet precondition.

- **Open Home.** Visit `/`. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs text --url http://127.0.0.1:5173/`. The text includes a `Sign out` control and the `Home` tab, and it does not include `Continue with Google`.
- **Open the logger.** Choose `Log workout`. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs click --url http://127.0.0.1:5173/ --name "Log workout"`. The sheet text includes the session type chips.
- **Sign out.** Choose `Sign out`. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs click --url http://127.0.0.1:5173/ --name "Sign out"`. The login gate returns.
- **Proof.** Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs shot --url http://127.0.0.1:5173/ --out /tmp/perfos-verify-evidence/home/dashboard.png`.

## Gotchas

- Without a session, `/` renders the login gate. That is a sign-in proof, not a Home proof.
- Do not write a fake session into cookies to force this screen.
- Workout rows are real account data. Do not delete them during verification.
