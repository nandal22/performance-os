# Settings

Settings lists custom exercises and tracker data health. Adding or deleting an exercise writes to the live account.

## Sub-features

- `settings-open` shows the settings screen.
- `settings-health` shows tracker table counts when the health request succeeds.

## How to get to it (user POV)

- Choose the `Settings` tab in the bottom nav.
- Open `/settings` while signed in.

## Driving it with drive.mjs

Preconditions:

- The owner's session is present. Without it, report the unmet precondition.

- **Open.** Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs text --url http://127.0.0.1:5173/settings`. The text includes settings content and the `Settings` tab, and it does not include `Continue with Google`.
- **Proof.** Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs shot --url http://127.0.0.1:5173/settings --out /tmp/perfos-verify-evidence/settings/page.png`.

## Gotchas

- Do not create or delete exercises during verification. Those buttons write to the live project.
- Health counts come from Supabase. A failed health panel is a data-plane failure, not proof that Settings failed to open.
