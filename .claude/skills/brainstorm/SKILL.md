---
name: brainstorm
description: "Turns no idea or a rough idea into a written product brief: problem, target user, solution, why now, differentiation and riskiest assumption. Use when the user has no idea yet ('open'), a vague idea, or wants to explore directions before writing a PRD."
argument-hint: "<open | idea in a few words>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, WebSearch, Bash(bash .claude/scripts/*)
model: opus
---

# Brainstorm

Structured ideation that ends in `docs/product/brief.md`, written from
`.claude/docs/templates/project-brief.md`. It explores widely, then narrows
with the user to one direction. It never picks the direction for the user.

## Inputs

- Argument: `open` (no idea yet) or a hint ("booking for dog groomers")
- `project.type` if set; `docs/product/brief.md` if one already exists (then offer to revise rather than replace)

## Phases

### Phase 1: Seed

- **open**: ask up to three questions: what the user knows well (work,
  hobbies, communities), problems they have seen people pay to solve, and the
  kind of project they want (SaaS / marketing site / store / API / not sure).
- **hint**: restate the idea in one sentence and ask who has the problem most
  painfully and what they do today instead.

### Phase 2: Diverge

Spawn `product-director` with the seed: "Propose 5 distinct product directions.
For each: target user, problem, solution in one line, why now, how it makes
money, the riskiest assumption." For an `open` start, ground directions in the
user's own domains. You may spot-check market reality with WebSearch (cite
sources; mark estimates).

Present the directions as a table and ask the user to pick one, combine some,
or discard all and reseed.

### Phase 3: Converge

For the chosen direction, work through these with the user (one round of
questions at a time, at most three rounds):

1. **User**: who exactly; the trigger moment they look for a solution.
2. **Problem**: in their words; how often; what it costs them.
3. **Alternatives**: what they use today (including spreadsheets and doing nothing).
4. **Solution**: the core loop in three steps; what is deliberately left out.
5. **Why now**: technology, regulation, behaviour or market change.
6. **Differentiation**: why this beats the alternatives for this user.
7. **Business model**: who pays, roughly how much, how they find it.
8. **Riskiest assumption** and the cheapest test of it.

### Phase 4: Write the brief

Draft the brief from the template (one page). Show it and ask "May I write
this to `docs/product/brief.md`?" If `project.type` is unset and the type is
now clear, offer to set it with `config-set.sh project.type=<type>`.

## Output

`docs/product/brief.md`.

## Rigor

- `minimal`: Phase 3 may stop after items 1, 2, 4 and 8.
- `full`: Phase 2 also spawns `ux-researcher` for a quick competitor scan.

## Next step

`/write-prd` (or `/market-research` and `/personas` first under `full` rigor).
