# Sign in

Sign in is the logged-out gate. The only user action on this screen is continuing with Google. The app then leaves its own origin for the Supabase OAuth handoff.

## Sub-features

- `sign-in-gate` shows the Performance OS title and the Google button.
- `sign-in-handoff` starts Google sign-in and leaves the app origin.
- `sign-in-direct` opens the same gate from `/login`.

## How to get to it (user POV)

- Open the site root while signed out. The app redirects to `/login`.
- Open `/login` directly.

## Driving it with drive.mjs

Preconditions:

- Doctor reports `ok: true` at `http://127.0.0.1:5173`.
- No Supabase session cookie is present in the verification Chrome profile. `drive.mjs` uses a fresh profile, so this holds.

- **Open the gate.** Visit `/login`. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs text --url http://127.0.0.1:5173/login`. The text includes `Performance OS`, `Your training log.`, and `Continue with Google`.
- **Open from root.** Visit `/`. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs text --url http://127.0.0.1:5173/`. After auth resolves, the text is the same login gate. The URL may remain `/` until the client redirect, or become `/login`. Either way the visible gate is the proof.
- **Start Google handoff.** Choose `Continue with Google`. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs click --url http://127.0.0.1:5173/login --name "Continue with Google"`. The printed `href` is no longer `http://127.0.0.1:5173`. Stop. Do not enter Google credentials.
- **Proof.** Capture the gate before the click. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs shot --url http://127.0.0.1:5173/login --out /tmp/perfos-verify-evidence/sign-in/gate.png`. The PNG and `gate.txt` show `Performance OS` and `Continue with Google`.

## Gotchas

- A spinner with no title means auth is still resolving. Wait until the heading or the button is in the text.
- Completing Google sign-in needs the owner's account. An unauthenticated run must not claim Home loaded.
- The button has no `aria-label`. Match the visible text `Continue with Google`.
- Clicking the button navigates to Supabase or Google. A screenshot of that third-party page is not proof of a successful sign-in.
