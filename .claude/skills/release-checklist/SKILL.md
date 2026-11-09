---
name: release-checklist
description: "Prepares a routine release after launch: scope from done stories, CI and test status, migration safety, feature flags, changelog, release notes, deploy and rollback steps, and a go/no-go. Use for every production release after the first launch."
argument-hint: "[version | date]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*), Bash(git tag*), Bash(git diff*), Bash(git describe*)
model: sonnet
---

# Release Checklist

Makes a routine release predictable and writes
`production/releases/<version-or-date>/checklist.md`. It never tags, merges,
deploys or runs production migrations; it prints those commands.

## Inputs

- `bash .claude/scripts/story-list.sh done` and the stories merged since the last release
- `git describe --tags --abbrev=0` (last release) and `git log <last>..HEAD --oneline`
- Migration files changed since the last release (`git diff --name-only <last>..HEAD`)
- `production/releases/runbook.md`, latest audit reports

## Phases

### Phase 1: Scope

List what is in the release: stories (id, title), bug fixes, dependency
upgrades, config changes. Flag anything merged that is not linked to a story.
Ask the user to confirm the version (SemVer for APIs/packages; date-based like
`2026-11-08` for sites) and whether anything should be held back behind a flag.

### Phase 2: Checks

Spawn `release-manager` (with `qa-lead` and `devops-lead` as needed) to verify:
- CI green on the release commit; critical journeys pass (`/smoke-check` against preview/staging).
- Each included story is `done` per `/story-done` (tests mapped to its acceptance criteria).
- **Migrations**: backward compatible with the currently running code (expand/contract), no table locks on large tables, a backup is taken before applying, and a rollback path exists. Destructive steps (drop/rename) are a no-go unless this is the contract phase of an earlier expand.
- **Flags**: risky changes behind a flag with a default-off rollout plan.
- **Config**: new env vars set in production (the user confirms), secrets rotated if required.
- Open Critical/High findings from audits since the last release.
- Performance: no budget regressions on key routes if `/perf-audit` ran.

### Phase 3: Notes

Generate the changelog section (`/changelog`) and offer user-facing notes
(`/release-notes`) when there are visible changes.

### Phase 4: Go/no-go

Present blockers, risks and the deploy sequence: take backup → apply
migrations → deploy → smoke check → enable flags → watch errors for 30 min.
Print the exact commands from the runbook. Recommend `GO`/`NO-GO`; the user decides.

### Phase 5: Write

Ask "May I write this to `production/releases/<version>/checklist.md`?"
(template `release-checklist`).

## Output

`production/releases/<version-or-date>/checklist.md` (template: `.claude/docs/templates/release-checklist.md`).

## Rigor

- `minimal`: CI green, migrations safe, rollback known.
- `standard`: full checklist.
- `full`: + `QA-RELEASE` verdict from `qa-lead` and perf/security re-checks on changed areas.

## Next step

After deploying: `/smoke-check <production url>`, then `/release-notes`.
