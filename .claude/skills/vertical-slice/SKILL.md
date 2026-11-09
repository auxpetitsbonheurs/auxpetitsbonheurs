---
name: vertical-slice
description: "Builds the thinnest production-quality end-to-end slice of a risky feature: one screen, one endpoint, one table, deployed to a preview, with tests, to prove the architecture before building the rest. Use at the start of Build, or before a feature with integration or performance risk."
argument-hint: "<feature-slug>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git status*), Bash(git diff*)
model: sonnet
---

# Vertical Slice

Unlike `/prototype`, this code is **kept**: it follows every rule and test
standard. It is deliberately narrow: UI → API → DB → preview deploy for a single
happy path, so that architecture, tooling and deploy problems surface on day
one instead of week six.

## Inputs

- `docs/specs/features/<feature-slug>.md` (flow, contract, data model)
- `docs/architecture/architecture.md` and ADRs
- `project.yaml → stack`, `.claude/docs/stack-matrix.md`
- CI and deploy config, if `/ci-setup` and `/deploy-setup` have run

## Phases

### Phase 1: Define the slice

With `technical-director`, pick the **one** path that exercises the most risk:
- auth'd page that reads and writes the main entity
- the integration call (payments sandbox, CMS fetch, LLM stream)
- the deploy target and its runtime limits

Write the slice as a story (`/create-stories` format, Status: ready) and show it.
Ask "Build this slice?"

### Phase 2: Build it

Run `/dev-story` on that story. Brief in parallel when the contract is fixed:
- backend specialist: migration + endpoint/action + integration test
- frontend specialist + `ui-engineer`: route + component + component test
- `test-engineer`: one Playwright test for the slice

### Phase 3: Prove it runs where it will run

Ask `devops-lead` for the preview deploy steps. Print the deploy/preview
command for the user to run (e.g. push the branch for a PR preview); do not
deploy. Once the user confirms the preview URL, run the Playwright test against it
(`BASE_URL=<url> npx playwright test tests/e2e/<slice>.spec.ts`).

### Phase 4: Report

Write `production/milestones/vertical-slice-<feature-slug>.md`: what was built,
what broke and how it was fixed, measured numbers (LCP, API p95, cold start),
and the architecture changes needed (each one an ADR or a spec change). Ask
before writing.

## Next step

`/architecture-decision` for anything the slice disproved; otherwise `/create-stories` for the rest of the feature.
