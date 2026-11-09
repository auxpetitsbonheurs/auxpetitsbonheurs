---
name: tech-spike
description: "Runs a time-boxed technical spike with the prototyper to answer one risky question (can this API do X, will this library work on the edge runtime, is this fast enough) and records the finding. Use when an estimate has low confidence, before an ADR, or when an integration is unproven."
argument-hint: "<question> [time-box hours, default 4]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, WebFetch, Bash
model: sonnet
---

# Tech spike

Answers **one** question cheaply in `prototypes/<slug>/`, then writes the
finding to `prototypes/<slug>/README.md`. Spike code is throwaway: it is never
imported into `src/`. It uses sandbox/test credentials only and calls no paid
API without the user's yes.

## Inputs

- Argument: the question, and a time-box (default 4 hours of agent work, with
  a hard stop at the time-box or 40 turns)
- The PRD/spec/ADR context that raised the question
- `project.yaml → stack` (the spike should use the real stack unless the question is "which stack?")

## Phases

### Phase 1: Sharpen the question

Rewrite the question so it has a yes/no or numeric answer, with success
criteria, e.g. "Can Drizzle + Neon serverless driver run inside a Vercel Edge
function with < 150 ms p95 for a single-row read?" Ask the user to confirm the
question, the time-box, and any credentials they will provide (test-mode only;
they put them in their own `.env`, never in chat).

### Phase 2: Spike

Spawn `prototyper` (plus the stack specialist for the technology in question).
Brief: the question, success criteria, time-box, `prototypes/<slug>/` as the
only writable directory, "use official docs (WebFetch) for current APIs; hard-code
and mock freely; stop at the time-box and report what you have".

Name the folder `<yyyy-mm-dd>-<topic>`.

### Phase 3: Record the finding

Write `prototypes/<slug>/README.md` (ask first):

```markdown
# Spike: <question>
Date: YYYY-MM-DD   Time-box: N h   Result: YES | NO | PARTIAL
## Answer
## Evidence (commands run, numbers, links)
## What production would need
## Risks and unknowns left
## Recommendation (ADR needed? estimate impact?)
```

If the finding settles an architecture choice, suggest `/architecture-decision`
with the README as input; if it changes an estimate, say by how much.

## Output

`prototypes/<slug>/` (throwaway code) and `prototypes/<slug>/README.md`.

## Next step

`/architecture-decision` or `/estimate`.
