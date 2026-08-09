---
name: verify-game
description: Launch Dungeon Escape locally in headless Chrome, play through the lobby into a real solo game, screenshot every layout and report console errors / broken layout. Use it AFTER any non-trivial change to static/ (client-game.js, client.js, game.css, main.css, game.html, main.html) or to server/, and before reporting such work as done — it catches stale-cache styling, features that stopped firing, and misplaced elements that unit-level checks cannot see.
---

# Verify the game in a real browser

Syntax checks and reading the diff do **not** catch the bugs that actually reach
the player here: a rule that never applies, a handler that never fires, a panel
that overflows the fold. Drive the real thing instead.

## Run it

```bash
"E:/Programs/node-v26.4.0-win-x64/node.exe" tools/devcheck.js
```

That single command boots the server (or reuses one already on 8182), launches
headless Chrome on a **fresh profile**, joins a lobby, picks 4 adventurers with a
single player, starts the game, walks the first steps of the guided tour, then
screenshots desktop / mobile-portrait / mobile-landscape and the character modal
into `tools/.devcheck/`.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--keep` | leave the server running afterwards |
| `--url http://host:port` | drive an already-running instance |
| `--out DIR` | screenshot directory (default `tools/.devcheck`) |
| `--shot name=SELECTOR` | one extra screenshot after scrolling that element into view |

Exit code is `1` when anything was captured (console error, page exception,
failed request, unreachable control), `2` if the harness itself failed.

## Then actually look

The exit code is not the check — **read the PNGs** with the Read tool. At minimum:

- `01-waiting-room.png` — the lobby screen and its opt-ins
- `03-tutorial-step*.png` — the guided tour's spotlight and bubble placement
- `10-game-desktop.png`, `10-game-mobile-portrait.png`, `10-game-mobile-landscape.png`
- `20-character-modal.png`

Look for: elements at the wrong size, text overflowing its box, panels stopping
short of the screen, controls pushed off the fold, and anything that simply is
not there.

## What it asserts on its own

- console errors / warnings, uncaught exceptions, failed requests, HTTP >= 400
  (the headless autoplay refusal is filtered out — it is expected)
- the guided tour opens by itself on a fresh profile
- no image wider than 520 px, no horizontal page scroll
- "Finir le tour" is either visible or reachable by scrolling something

Add assertions to `tools/devcheck.js` whenever a bug slips through: the probe
block near the end of `run()` is the place for one-off DOM measurements.

## Gotchas worth remembering

- **The service worker used to serve stale CSS/JS on localhost.** It now bypasses
  its cache on `localhost` / `127.0.0.1` (see `DEV_HOST` in
  `static/service-worker.js`). If a style change seems to have no effect in the
  user's own browser but the harness renders it correctly, it is their cached
  service worker: hard-reload or "Update on reload" in DevTools. The harness is
  immune because it always uses a throwaway Chrome profile.
- **Changes under `server/` need a server restart.** `tools/devcheck.js` boots
  its own server only when port 8182 is free — kill the running one first, or
  the harness will happily test the old engine:
  ```powershell
  Get-NetTCPConnection -LocalPort 8182 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
  ```
  Files under `static/` are served per request — no restart needed for those.
- **One human can control 4 adventurers** (`canControlMultiple`: fewer than 4
  human players), which is what makes the solo scenario possible.
- Node and Chrome are not on PATH on this machine:
  `E:/Programs/node-v26.4.0-win-x64/node.exe` and
  `C:/Program Files (x86)/Google/Chrome/Application/chrome.exe` (override with
  `CHROME_PATH`).
- The harness drives the page by evaluating jQuery in it (`$('#start-btn').click()`),
  so it follows the app's own code paths rather than faking input events.
