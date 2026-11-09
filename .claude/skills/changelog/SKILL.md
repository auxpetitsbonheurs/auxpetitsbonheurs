---
name: changelog
description: "Generates or updates CHANGELOG.md from conventional commits since the last tag, grouped into Added, Changed, Fixed, Security, Removed, with story and bug IDs linked. Use when preparing a release or when asked what changed."
argument-hint: "[from-ref] [to-ref]"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash(git log*), Bash(git describe*), Bash(git tag*)
model: haiku
---

# Changelog

Turns commit history into a developer-facing changelog in `CHANGELOG.md`
(Keep a Changelog format). It never tags or pushes.

## Inputs

- Range: argument, or `git describe --tags --abbrev=0`..`HEAD` (all history if there is no tag)
- `git log <range> --no-merges --pretty=format:'%h%x09%s%x09%b'`
- Existing `CHANGELOG.md`

## Phases

### Phase 1: Collect

Parse conventional commits `type(scope)!: subject`. Map:
`feat` → Added; `fix` → Fixed; `perf`, `refactor` with user impact → Changed;
`security` or fixes mentioning CVE/GHSA → Security; removals → Removed;
`!` or `BREAKING CHANGE:` → a **Breaking** note at the top. Skip `chore`,
`ci`, `test`, `docs`, `style` unless they affect users. Extract `S-NNN` and
`BUG-NNN` references.

### Phase 2: Draft

Write one line per change in plain language (rewrite cryptic subjects; keep the
scope as a bold prefix), deduplicate, and list non-conventional commits
separately under "Unclassified" for the user to place.

### Phase 3: Write

Show the new section (`## [<version>] - YYYY-MM-DD`, or `## [Unreleased]`).
Ask "May I add this to `CHANGELOG.md`?" Create the file with the
`changelog` template header if it does not exist.

## Output

`CHANGELOG.md` (template: `.claude/docs/templates/changelog.md`).

## Next step

`/release-notes` for the user-facing version.
