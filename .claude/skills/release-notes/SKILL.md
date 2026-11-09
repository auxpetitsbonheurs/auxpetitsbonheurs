---
name: release-notes
description: "Writes user-facing release notes (what's new, improvements, fixes) in the brand voice from the changelog and done stories, with optional variants for an in-app changelog, email and social post. Use after a release with visible changes."
argument-hint: "[version | date]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*)
model: sonnet
---

# Release Notes

Turns what shipped into words users care about, saved to
`production/releases/<version-or-date>/notes.md`. It never publishes, emails
or posts anything; it drafts.

## Inputs

- `CHANGELOG.md` section for the release (run `/changelog` first if missing)
- Done stories in the release (`story-list.sh done`) and their specs
- `docs/design/brand-guide.md` (voice and tone)

## Phases

### Phase 1: Select

Keep only changes a user would notice. Group as **New**, **Improved**,
**Fixed**. Drop internal refactors, dependency bumps and CI changes unless
they fix something users saw (then describe the symptom, not the cause).

### Phase 2: Draft

Spawn `copywriter` with the list and the voice: lead with the most valuable
change, one or two sentences each, benefits over mechanics, and how to use it
(where to click). Mention breaking changes and required user actions first and
clearly. No invented metrics or quotes.

Ask which variants the user wants: `In-app / changelog page` (default),
`Email to users` (hand to `/email-flows` for sending), `Short social post`.

### Phase 3: Write

Ask "May I write this to `production/releases/<version>/notes.md`?"
(template `release-notes`).

## Output

`production/releases/<version-or-date>/notes.md` (template: `.claude/docs/templates/release-notes.md`).

## Next step

`/email-flows` if the notes should go out by email; `/retrospective` at milestone ends.
