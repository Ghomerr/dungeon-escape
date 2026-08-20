# Changelog entries and versioning

Since `v1.0.0` the scheme is **semantic versioning followed by the release
date**: `## vMAJOR.MINOR.PATCH — YYYY-MM-DD`, e.g. `## v1.2.0 — 2026-09-03`.

Everything under `v0.` is the old calendar naming (`v0.2026.08.19`). It is
**frozen history** — never renumber it, never fold new work into it.

## 1. Get the real date first — never guess it

Ask the machine, every time. Do not infer it from the previous heading, from
file timestamps, or from memory of what day it was earlier in the conversation.

```powershell
Get-Date -Format 'yyyy-MM-dd'
```

To place work that is already committed, use the commit's own date:

```bash
git log --date=format:'%Y-%m-%d %H:%M' --pretty='%h %ad %s' -10
```

## 2. Pick the number, then the date

Bump exactly one component off the topmost version:

| Bump | When |
| --- | --- |
| **MAJOR** | a rule or save format changes in a way that breaks existing games or stored data; a redesign the player cannot ignore |
| **MINOR** | a new feature, a new difficulty, a new option, a new screen — anything additive |
| **PATCH** | fixes, balance tweaks, wording, tooling, refactors with no user-visible addition |

Rules that follow from this:

- **One heading per release, not per day.** Two releases on the same day get two
  headings with two numbers and the same date. That is normal.
- If the topmost heading is **an unreleased version you are still adding to**
  (same number, same day, nothing pushed), extend that section instead of
  inventing a new number.
- A heading dated **after** today is always a bug. It has happened twice.
- Never renumber or re-date an existing heading to absorb new work: that
  silently moves finished features onto a release they were not in. Add a new
  section above it.
- Sections stay in reverse chronological order, which is also descending version
  order.

## 3. Keep the three version markers in step

| What | Where | When to touch it |
| --- | --- | --- |
| Changelog heading | `changelog.md` | every batch of user-visible work |
| Displayed version | `static/version.json` | must equal the topmost heading's **number** (no date), e.g. `v1.2.0` |
| Service-worker cache | `CACHE` in `static/service-worker.js` | whenever `static/` CSS/JS/HTML changed since the **last commit that shipped** — otherwise returning players keep the old files |

The service-worker cache counter is **independent** of the game version: it only
ever increments (`dungeon-escape-v11` → `v12`). Do not try to align it with the
release number.

Quick audit:

```bash
grep -m1 '^## v' changelog.md; cat static/version.json; grep -n 'CACHE =' static/service-worker.js
```

## 4. Writing the entry

- Group under `### Added` / `### Changed` / `### Fixed`, plus `### Tooling` for
  developer-facing work.
- Lead each bullet with a bold subject, then say what changed **and why it
  matters to a player**. For a fix, name the wrong behaviour — "it waited for a
  render that never came" is worth more than "fixed the tour".
- Write it in English, like the rest of the file, even when the conversation is
  in French.
- Quote measured numbers when the change is a balance change: this project has a
  simulator (`tools/sim/`), so "2.8 % → 14.8 % wins at 4 adventurers" is
  available and beats "slightly easier".
- Reference an older version when re-fixing something (`as already decided in
  v0.2026.07.11`) — that is how a regression becomes visible.

## 5. Before committing

Run `/verify-game` (the `verify-game` skill) when `static/` or `server/`
changed, and `node tools/sim/check-fixes.js` when `server/` changed. Then commit
changelog + version + code together, so a version never ships describing work
that is not in the same commit.

## 6. Commit messages

This project does **not** credit AI assistance in its history: no
`Co-Authored-By` trailer for an assistant, no "generated with" footer, no
mention in the body. Write the message as the project's own.
