---
name: changelog-release
description: How to add a Dungeon Escape changelog entry and set the version. Use it BEFORE writing any heading in changelog.md, editing static/version.json, or bumping the service-worker cache — i.e. on every batch of work that ends in a commit. It exists because versions are calendar-based and were repeatedly dated wrong (a version in the future, and two different days merged under one heading).
---

# Changelog entries and versioning

The scheme is calendar-based: `vYYYY.MM.DD`, where the date is **the real day the
work is done**. Everything below follows from that.

## 1. Get the real date first — never guess it

Ask the machine, every time. Do not infer it from the previous heading, from file
timestamps, or from memory of what day it was earlier in the conversation.

```powershell
Get-Date -Format 'yyyy-MM-dd'
```

To place work that is already committed, use the commit's own date:

```bash
git log --date=format:'%Y-%m-%d %H:%M' --pretty='%h %ad %s' -10
```

## 2. One heading per day, and only for days that have happened

- If `changelog.md` already opens with a heading for **today**, add to that
  section. Do **not** create a new version.
- A heading dated **after** today is always a bug. It has happened twice.
- Never rename an existing heading to a different day to absorb new work: that
  silently moves finished features to a day they were not built on. Add a new
  section above it instead.
- Sections stay in reverse chronological order.

## 3. Keep the three version markers in step

| What | Where | When to touch it |
| --- | --- | --- |
| Changelog heading | `changelog.md` | every batch of user-visible work |
| Displayed version | `static/version.json` | must equal the topmost heading |
| Service-worker cache | `CACHE` in `static/service-worker.js` | whenever `static/` CSS/JS/HTML changed since the **last commit that shipped** — otherwise returning players keep the old files |

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
- Reference an older version when re-fixing something (`as already decided in
  v2026.07.11`) — that is how a regression becomes visible.

## 5. Before committing

Run `/verify-game` (the `verify-game` skill) when `static/` or `server/` changed,
then commit changelog + version + code together, so a version never ships
describing work that is not in the same commit.
