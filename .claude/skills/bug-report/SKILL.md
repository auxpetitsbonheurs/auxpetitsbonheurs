---
name: bug-report
description: "Writes a structured, reproducible bug report in production/bugs/BUG-NNN: environment, steps, expected vs actual, evidence (console, network, logs, screenshots), severity and suspected area. Can also draft (never file) an issue for an upstream library or vendor. Use when something is broken, a test or audit finds a defect, or a user reports a problem."
argument-hint: "[short description]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*), Bash(npx playwright*)
model: sonnet
---

# Bug Report

Turns "it's broken" into a report someone can reproduce and fix, saved to
`production/bugs/BUG-NNN-<slug>.md`. It does not fix the bug (that is
`/hotfix` or a story) and it **never** files issues in third-party
repositories: upstream reports are drafts the user submits.

## Inputs

- The user's description, a failing test, an audit finding, or an error-tracking event
- `bash .claude/scripts/next-number.sh production/bugs BUG` for the ID

## Phases

### Phase 1: Gather

Ask for whatever is missing (one question at a time, only what matters):
where (URL/route, environment: local/preview/production, browser/device,
account role), what happened, what was expected, how often, since when. Never
ask the user to paste secrets or customers' personal data; redact them if
pasted.

### Phase 2: Reproduce

Try to reproduce: locally, via the failing test, or with Playwright (capture
console errors, failed requests, a trace). Record minimal steps. If it does
not reproduce, say so and note what was tried.

### Phase 3: Locate (light)

Grep for the error message and the route's handler/component; check
`git log -p --since=<when> -- <paths>` for recent changes. Name the suspected
area and owner agent, without claiming a root cause that was not proven.

### Phase 4: Classify

Severity: **S1** data loss, security, payments or the core journey broken for
everyone; **S2** a key feature broken or a workaround is painful; **S3** minor
feature or cosmetic with an easy workaround; **S4** trivial. Security bugs are
marked confidential and summarised without exploit detail.

### Phase 5: Write

Use the `bug-report` template: title, ID, severity, environment, steps,
expected, actual, evidence, suspected area, regression-test requirement
(the test that will prove the fix). Ask "May I write this to
`production/bugs/BUG-NNN-<slug>.md`?"

### Phase 6: Upstream (only if the cause is a dependency)

Draft an issue for the library/vendor (minimal repro, versions, expected vs
actual) in the bug file under "Upstream draft". Tell the user it is a draft
for them to submit.

## Output

`production/bugs/BUG-NNN-<slug>.md` (template: `.claude/docs/templates/bug-report.md`).

## Next step

`/bug-triage`; for S1 on production, `/incident` and `/hotfix`.
