# Log a workout

Log a workout is the sheet opened from Home. The owner picks a session type, adds exercises or a free-text note, and saves.

## Sub-features

- `log-open` opens the sheet from the Home log button.
- `log-type` switches session type chips.
- `log-save` persists a workout that then appears on Home.

## How to get to it (user POV)

- On Home, choose the button named `Log workout`.

## Driving it with drive.mjs

Preconditions:

- The Home preconditions hold, including the owner's session.
- Without that session, report the failure. Do not save a workout against the live account from an agent profile.

- **Open.** From Home, choose `Log workout`. Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs click --url http://127.0.0.1:5173/ --name "Log workout"`. The sheet is visible and includes the session type labels.
- **Proof of a save.** Only when the owner has asked for a live save. After saving, close the sheet and read the new row on Home with `drive.mjs text`. A toast alone is not proof.

## Gotchas

- Saving writes to the live Supabase project. Verification must not do that unless the owner asked.
- The sheet is tall. A screenshot of the top can hide the save button. Scroll inside the sheet before claiming the button is absent.
- Draft recovery can reopen an unfinished workout. Discard it only when the visible draft text is one this run created.
