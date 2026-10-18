# Progress

Progress lists compound lift cards and an exercise search. It is a read of existing training history.

## Sub-features

- `progress-open` shows the progress screen.
- `progress-search` filters exercises by the search box.

## How to get to it (user POV)

- Choose the `Progress` tab in the bottom nav.
- Open `/progress` while signed in.

## Driving it with drive.mjs

Preconditions:

- The owner's session is present. Without it, `/progress` shows the login gate and the run fails this feature.

- **Open.** Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs text --url http://127.0.0.1:5173/progress`. The text includes `Progress` and does not include `Continue with Google`.
- **Proof.** Run `node .cursor/skills/verify-performance-os/scripts/drive.mjs shot --url http://127.0.0.1:5173/progress --out /tmp/perfos-verify-evidence/progress/page.png`.

## Gotchas

- The first visit loads a separate script. A brief spinner is not the page. Wait until body text contains more than the loading state.
- Search only matches exercises already in the account. An empty search result is valid when the name is not in history.
