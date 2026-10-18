---
name: verify-performance-os
description: Drive the Performance OS Vite PWA in headless Chrome the way its owner does on an iPhone-sized viewport. Use when proving login, home, workout logging, progress, weight, or settings behavior, or when capturing mobile screenshots of this app.
---

# Verify Performance OS

Performance OS is a single-user workout PWA. The surface an agent can drive is the local Vite web app. Google OAuth is the only sign-in, and there is no seeded account in this checkout. Unauthenticated runs reach the login gate and stop there. Authenticated routes are mapped so a later run with the owner's session can drive them. Do not invent a session, do not complete Google login, and do not write to the live Supabase project.

## Launch

From the repo root:

```bash
test -f .env || cp .env.example .env
npm ci --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 5173
```

Ready means `curl -sf http://127.0.0.1:5173/login` returns HTML whose title is `Performance OS` and whose root will render `Continue with Google`. The dev server log line `Local: http://127.0.0.1:5173/` is the process signal. Vite does not run migrations or seed data. The app reads the live Supabase project named in `.env.example` after sign-in. Service workers are not registered in `import.meta.env.DEV`.

Two dev servers can run if they use different ports. Do not share a Chrome user-data directory. Do not point `VERIFY_URL` at production.

Teardown is killing the dev-server PID you started. Do not kill every `node` or `vite` process on the machine.

## Doctor

```bash
node .cursor/skills/verify-performance-os/scripts/drive.mjs doctor
```

`VERIFY_URL` defaults to `http://127.0.0.1:5173`. A healthy doctor prints `{"ok":true,"url":"http://127.0.0.1:5173","title":"Performance OS","devModule":true}` and exits 0. Run doctor before every drive. If it fails, the instance is not worth driving.

## Drive

The harness is `drive.mjs`. It launches its own headless Chrome (`/usr/local/bin/google-chrome`, override with `CHROME_BIN`), sets a 390x844 mobile viewport, and kills that Chrome when the command finishes. Controls are matched by accessible name or visible text, not coordinates.

```bash
node .cursor/skills/verify-performance-os/scripts/drive.mjs text --url http://127.0.0.1:5173/login
node .cursor/skills/verify-performance-os/scripts/drive.mjs click --url http://127.0.0.1:5173/login --name "Continue with Google"
node .cursor/skills/verify-performance-os/scripts/drive.mjs shot --url http://127.0.0.1:5173/login --out /tmp/perfos-verify-evidence/login.png
```

Stable handles on the login gate:

- Heading text `Performance OS`
- Button text `Continue with Google`
- Header text `sachinnandal.me`

Stable handles after a real owner session (not available to an unauthenticated run):

- Link name `Home`, `Progress`, `Weight`, `Settings` in the bottom nav
- Button `aria-label="Log workout"` on Home
- Button text `Sign out` on Home

`click` prints the URL after the click. For Google sign-in that URL leaves the app origin. Stop there.

## Evidence

Write proof under `/tmp/perfos-verify-evidence/<feature-id>/`. Keep the action and the resulting state.

- `drive.mjs text` stdout is the page text and URL before or after an action.
- `drive.mjs shot` writes a PNG and a sibling `.txt` of `document.body.innerText`.
- A mutation proof must include a second read of the saved value from a user-facing screen. This checkout cannot mutate workouts without the owner's Google session, so an unauthenticated run must not claim a save happened.
- Do not mock Supabase. Do not call test-only endpoints. There are none.

## Cleanup

Kill the Vite PID recorded at launch. `drive.mjs` already kills the Chrome process it spawned and deletes that run's temporary user-data directory. Cleanup must not delete `/tmp/perfos-verify-evidence`.

## Helpers

`node .cursor/skills/verify-performance-os/scripts/drive.mjs doctor|text|click|shot` is the only helper. `shot` requires `--out`. `click` requires `--name`.
