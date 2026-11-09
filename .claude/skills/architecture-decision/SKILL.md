---
name: architecture-decision
description: "Records an architecture decision as a numbered ADR with context, options, decision and consequences, after the user chooses. Use for any choice that is expensive to reverse: framework, database, auth provider, hosting, rendering strategy, monorepo, queue, vendor."
argument-hint: "<decision title> | supersede <NNNN>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, WebFetch, Bash(bash .claude/scripts/*)
model: opus
---

# Architecture Decision Record

Produces `docs/architecture/adr/NNNN-<slug>.md`. The skill frames the decision
and the options with `technical-director`; **the user decides**; the ADR records
it. With `supersede NNNN` it writes a new ADR and marks the old one superseded.

## Inputs

- Argument: the decision title, or `supersede <NNNN>`
- Existing ADRs in `docs/architecture/adr/` (Grep titles and statuses)
- `docs/architecture/architecture.md`, `docs/product/prd.md` constraints
- `project.yaml`: `stack.*`, `budgets`, `privacy.regions`, `project.type`

## Phases

### Phase 1: Frame

Check no existing ADR already decides this (Grep titles). State the decision,
the forces (requirements, budgets, team skills, cost, compliance, deadlines)
and what happens if it is deferred. Ask the user to confirm the framing.

### Phase 2: Options

Spawn `technical-director` with the frame. It returns 2–4 real options; for each:
how it works here, cost at expected scale (money and effort), operational
burden, lock-in and exit path, security/compliance impact, and fit with the
existing stack. For any product or vendor claim it is unsure of (pricing,
limits, features), it checks the vendor docs with WebFetch or marks it unverified.
It recommends one and says why.

If the decision is mainly about a specific stack, also brief the matching
specialist (e.g. `hosting-platform-specialist`, `postgres-specialist`) in parallel.

### Phase 3: Decide

Present the options table and the recommendation. Ask the user to choose.
Never record a decision the user has not made.

### Phase 4: Gate

Spawn `technical-director` for `TD-ADR` on the draft: are the options honest,
consequences complete (positive and negative), and follow-ups listed? Fix gaps.

### Phase 5: Write

Get the number with `bash .claude/scripts/next-number.sh docs/architecture/adr`.
Fill `.claude/docs/templates/adr.md`: Status (Accepted), Date, Context, Options
considered, Decision, Consequences, Follow-ups, Related ADRs. Ask
"May I write this to `docs/architecture/adr/NNNN-<slug>.md`?" For `supersede`,
also ask to set the old ADR's status to `Superseded by NNNN`.

If the ADR changes `project.yaml → stack`, show the `config-set.sh` commands and
run them only after a separate yes.

## Output

`docs/architecture/adr/NNNN-<slug>.md`.

## Next step

`/propagate-design-change docs/architecture/adr/NNNN-<slug>.md` if existing
specs or code are affected; otherwise `/create-architecture` or `/architecture-review`.
