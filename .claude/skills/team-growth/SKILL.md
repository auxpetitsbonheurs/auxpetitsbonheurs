---
name: team-growth
description: "Orchestrates the growth team (growth-lead, analytics-engineer, seo-specialist, copywriter, email-specialist) to produce a focused growth sprint plan: metrics baseline, the biggest funnel leak, experiments, SEO and content work, and lifecycle email. Use after launch when planning what to improve next."
argument-hint: "[focus: acquisition | activation | retention | revenue]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Team: Growth

Produces `production/sprints/growth-sprint-NN.md`: a short, ranked plan of
growth work that fits the user's capacity. It plans and drafts; launching
experiments, publishing content and sending email stay with the user.

## Inputs

- `docs/product/prd.md` metrics; `production/analytics/tracking-plan.md`
- Latest `production/analytics/funnel-review-*.md`, `production/audits/seo-*.md`, `production/experiments/*`
- `docs/content/content-strategy.md`, `docs/content/email-flows.md`
- Current numbers from the user (traffic, signups, activation, retention, revenue)

## Agents

| Agent | Contribution |
|---|---|
| `growth-lead` | Focus area, biggest lever, final ranking |
| `analytics-engineer` | Baseline, measurement gaps |
| `seo-specialist` | Technical fixes and content opportunities |
| `copywriter` | Copy changes for key pages |
| `email-specialist` | Lifecycle email improvements |

## Phases

### Phase 1: Baseline and focus

Ask for current numbers and weekly hours available. `growth-lead` picks a
focus (or uses the argument) from the AARRR stage with the biggest gap to the
PRD targets, and says why.

### Phase 2: Ideas (parallel)

Spawn all four specialists with the focus and baseline. Each returns up to
five ideas with expected impact, confidence, effort (hours) and how it will
be measured. `analytics-engineer` also lists measurement gaps that must be
fixed first.

### Phase 3: Rank and fit

`growth-lead` ranks by ICE, fixes measurement gaps first, keeps at most one
or two experiments running at a time (traffic permitting), and fits the plan
to the hours available. Each item becomes: quick fix (story), `/experiment`,
content piece, or email change.

### Phase 4: Write

Show the plan (goal metric and target, items, owners, measurement, review
date). Ask "May I write this to `production/sprints/growth-sprint-NN.md`?"
Offer to create stories for the quick fixes. Name any BLOCKED agent.

## Next step

`/experiment` for the top experiment; `/retrospective` at the review date.
