---
name: gate-check
description: "Runs a stage gate (discovery, design, build or launch): checks the required artifacts for the current rigor, collects verdicts from the signing directors and leads, writes a gate report, and on PASS offers to advance the stage. Use when a stage's work looks finished, before moving to the next stage, or before launch."
argument-hint: "<discovery | design | build | launch>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Gate check

Decides whether the project may move from `<stage>` to the next stage, using
the definitions in `.claude/docs/gates.md`. It writes one report to
`production/gates/<stage>-YYYY-MM-DD.md` and changes `project.stage` only after
a PASS (or CONCERNS) **and** the user's yes.

## Inputs

- Argument: the stage being exited. Without one, use `project.stage`.
- `.claude/docs/gates.md`: required artifacts, criteria, signers per rigor
- `modes.rigor`, `project.type` (design and SEO rows are skipped for `api`)
- `bash .claude/scripts/project-state.sh`, `bash .claude/scripts/story-list.sh`, `bash .claude/scripts/test-run.sh all` (build gate only; ask before running a long suite)

## Phases

### Phase 1: Artifact check

For each row of the gate's table at the current rigor, check existence (and
age, for audit reports: older than 14 days or than the last release counts as
missing). Build the artifact table: required, found, path, notes. A required
artifact that is missing is a blocking finding; do not run signers on it.

### Phase 2: Signers

Under `minimal`, skip signers. Otherwise spawn the gate's signers (primary
under `standard`, all under `full`) **in parallel**. Brief each:

> You are signing `<GATE-ID>` for the `<stage>` gate. Read `.claude/docs/gates.md`
> section "Gate: <stage>" and these artifacts: <paths, by section>. Judge only
> the criteria listed for your gate ID. Reply with exactly one verdict from
> `APPROVE`, `CONCERNS`, `REJECT`, or `NOT ASSESSED: <input>`, followed by at
> most 5 findings with file:line references. Do not edit any file.

Signer mapping: `PD-GATE` → `product-director`, `TD-GATE` →
`technical-director`, `DD-GATE` → `design-director`, `QA-RELEASE` → `qa-lead`,
`SEC-LAUNCH` → `security-lead`.

### Phase 3: Verdict

- `FAIL`: any required artifact missing, or any `REJECT`.
- `CONCERNS`: all required present; any `CONCERNS` or `NOT ASSESSED`, or an optional artifact missing.
- `PASS`: everything required present and all signers `APPROVE`.

Draft the report (format at the end of `gates.md`) and show the summary:
verdict, blocking findings, concerns, and the 1–3 next steps that would fix
them (with the skill for each). Ask "May I write this to
`production/gates/<stage>-YYYY-MM-DD.md`?"

### Phase 4: Advance

- `PASS` → ask "Move the project to `<next stage>`?" On yes run `bash .claude/scripts/set-stage.sh <next>`.
- `CONCERNS` → same question, noting the concerns travel with the project.
- `FAIL` → do not offer to advance, except under `minimal` rigor, where the gate is advisory: offer it with the failures restated.

Stage order: discovery → design → build → launch → grow.

## Output

`production/gates/<stage>-YYYY-MM-DD.md`; optionally `project.stage`.

## Next step

The first skill of the next stage (see `docs/WORKFLOW-GUIDE.md`), or the fixes listed.
