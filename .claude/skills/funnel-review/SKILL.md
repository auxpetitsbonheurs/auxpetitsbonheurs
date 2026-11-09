---
name: funnel-review
description: "Reviews an acquisition → activation → retention → revenue → referral funnel from numbers the user provides, finds the biggest leak, and proposes ranked fixes and experiments. Use after launch when growth stalls, before a growth sprint, or when a funnel step looks wrong."
argument-hint: "[funnel name, e.g. 'signup' | 'checkout']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Funnel Review

Writes `production/analytics/funnel-review-YYYY-MM-DD.md` using the template
`.claude/docs/templates/funnel-review.md`. It works from numbers the user
pastes or exports; it never logs into analytics tools on its own.

## Inputs

- `production/analytics/tracking-plan.md` (funnel definitions)
- `docs/product/prd.md` metrics and targets
- `docs/design/ux/*.md` for the flows behind each step
- Funnel numbers from the user (step counts for a period, segmented if possible)

## Phases

### Phase 1: Define the funnel

If the tracking plan defines it, use it. Otherwise propose stages for the
project type:

| Type | Default funnel |
|---|---|
| saas | visit → signup start → signup complete → activation event → week-1 return → paid |
| ecommerce | visit → product view → add to cart → checkout start → payment → repeat purchase |
| marketing | visit → engaged (scroll/time) → CTA click → lead form submit → qualified lead |

Ask the user to confirm the stages and the period, then for the counts per
step (and by device, channel or new/returning if available).

### Phase 2: Analyse

Compute step conversion and cumulative conversion. Flag:
- The step with the largest absolute drop (users lost)
- Steps below the PRD target or typical benchmarks (label benchmarks as rough)
- Segment gaps (mobile vs desktop is often the biggest)
- Data smells: steps that increase, missing events, bot traffic

### Phase 3: Diagnose

Spawn in parallel:
- `growth-lead`: likely causes and fixes for the biggest leak
- `ux-lead`: friction in the flow behind that step (reads the UX doc)
- `performance-engineer`: whether speed could explain it (mobile LCP/INP on those pages)

### Phase 4: Recommend

Rank fixes by impact × confidence ÷ effort (ICE). Each fix is one of: a
quick fix (just do it), an `/experiment` candidate, or research (`/ux-review`,
user interviews). Show the report and ask "May I write this to
`production/analytics/funnel-review-YYYY-MM-DD.md`?"

## Output

`production/analytics/funnel-review-YYYY-MM-DD.md`

## Next step

`/experiment` for the top candidate, or `/cro-review` for the leaking page.
