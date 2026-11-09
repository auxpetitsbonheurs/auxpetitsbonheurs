---
name: write-prd
description: "Writes the product requirements document from the brief, personas and research: problem, users, goals and metrics, MVP scope, functional and non-functional requirements, risks and non-goals, then gets product-director sign-off (PD-PRD). Use after /brainstorm, when the concept is clear, or to revise requirements."
argument-hint: "[revise <section>]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Write the PRD

Produces `docs/product/prd.md` from `.claude/docs/templates/prd.md`.
`product-manager` drafts it, the user decides every open question, and
`product-director` reviews it (`PD-PRD`). It specifies **what** and **why**;
the **how** belongs to feature specs and ADRs.

## Inputs

- `docs/product/brief.md` (if missing, ask for the concept in a few sentences or suggest `/brainstorm`)
- `docs/product/personas/*.md`, `docs/product/research/*.md` if present
- `project.yaml`: `project.type`, `budgets`, `a11y.standard`, `i18n.locales`, `privacy.regions`
- Argument `revise <section>`: edit one section of an existing PRD (with a changelog line)

## Phases

### Phase 1: Fill the gaps

List what the template needs that the inputs do not say, as numbered
questions, at most 6 per round: e.g. success metric and target, launch
deadline, weekly capacity, must-have integrations, regions and languages,
regulated data (health, finance, children). Ask with the question tool.

### Phase 2: Draft

Spawn `product-manager` with the inputs and the answers. The PRD must contain:

1. **Problem and audience** (primary persona, JTBD)
2. **Goals and success metrics**: North Star + activation/retention metrics with targets and timeframe
3. **Scope**: MVP features (each with a one-line user value), later, and **non-goals**
4. **User journeys**: the critical journeys (signup, onboarding, core task, checkout…) that e2e tests will protect
5. **Functional requirements**: `FR-NN` numbered, testable, linked to a feature
6. **Non-functional requirements**: performance (from `budgets`), accessibility (`a11y.standard`), security, privacy (`privacy.regions`), i18n, SEO, availability, browsers/devices
7. **Integrations and constraints** (auth, payments, CMS, AI, email, compliance)
8. **Risks and assumptions** (riskiest first) and **open questions**
9. **Release plan**: milestones (MVP, beta, launch) at headline level

Rules for the drafter: no requirement without a testable statement; no
implementation choices unless they are true constraints; mark anything unknown
`[TO CONFIRM]`.

### Phase 3: Review (PD-PRD)

Under `standard` and `full`, spawn `product-director`: "Sign `PD-PRD` on this
draft: check coherence of problem → metric → scope, that the MVP is the
smallest test of the riskiest assumption, and that non-goals are explicit.
Reply `APPROVE`, `CONCERNS` or `REJECT` with at most 5 findings." Under `full`,
also spawn `technical-director` for a feasibility read of the NFRs (in parallel).

Show the draft, the verdict(s) and findings. Resolve findings with the user
(revise or accept with a note).

### Phase 4: Write

Ask "May I write this to `docs/product/prd.md`?" For a revision, append a line
to the PRD's `## Changelog` and name the specs and stories that may be
affected (suggest `/propagate-design-change`).

## Output

`docs/product/prd.md`.

## Rigor

- `minimal`: sections 1, 2, 3, 4 and 5 are enough; no review.
- `full`: every FR links a persona need; NFRs have numbers; both reviews run.

## Next step

`/scope-check`, then `/gate-check discovery`.
