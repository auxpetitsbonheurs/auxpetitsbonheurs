---
name: tech-debt
description: "Maintains the tech-debt register: records debt with cost, risk and a payoff plan, scans for debt signals (TODO/FIXME, skipped tests, outdated deps, oversized files), and prioritises items for upcoming sprints. Use when taking a deliberate shortcut, when the codebase feels slow to change, or at sprint planning."
argument-hint: "['add' <description> | 'scan' | 'review']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Tech Debt

Keeps `production/tech-debt.md` (template: `tech-debt-register`) honest. Debt is
fine when it is deliberate, recorded and scheduled; it is dangerous when it is
invisible.

## Modes

### `add <description>`

Ask for (or infer from context, then confirm): where it lives, why it was taken,
the **interest** (what it slows down or risks), the **principal** (estimated
effort to fix), and a trigger for paying it ("before adding a second payment
provider"). Assign `TD-NN` (`bash .claude/scripts/next-number.sh production/tech-debt.md TD`
reads existing IDs). Ask before appending.

### `scan`

Collect signals (observations only, no verdicts):
- `TODO`, `FIXME`, `HACK`, `@ts-ignore`, `eslint-disable`, `# type: ignore`, `noqa` (Grep, excluding `node_modules`, build output)
- skipped tests (`.skip(`, `it.todo`, `@pytest.mark.skip`, `t.Skip(`)
- files over 400 lines; functions over 40 lines (rough count)
- duplicated blocks the leads point out
- outdated major dependencies (`npm outdated` / `pip list --outdated` output if the user runs it, or the lockfile)

Spawn `lead-frontend` and `lead-backend` in parallel to judge which signals are real
debt. Propose new register entries; ask before adding.

### `review`

Score each open item: interest (1–5) × risk (1–5) ÷ principal (S=1, M=2, L=3).
Show the top five with a recommendation for the next sprint. `producer` decides
capacity; the user decides what goes in.

## Output

`production/tech-debt.md`: table of `ID | Area | Description | Interest | Risk | Principal | Trigger | Status`.

## Next step

`/refactor TD-NN` for the chosen item, or `/sprint-plan`.
