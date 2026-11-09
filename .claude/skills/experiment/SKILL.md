---
name: experiment
description: "Designs an A/B or multivariate experiment with a hypothesis, primary and guardrail metrics, minimum detectable effect and a shown sample-size calculation, or reads out a finished one. Use when testing a change to a page, flow, pricing or onboarding; use 'readout EXP-NN' to analyse results."
argument-hint: "[idea | 'readout EXP-NN']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Experiment

Writes an experiment brief to `production/experiments/EXP-NN-<slug>.md`
before any test starts, and a readout into the same file when it ends. It
never launches, stops or changes a live experiment or flag itself, and it
refuses to call a winner without the pre-registered stop rule.

## Inputs

- `production/analytics/tracking-plan.md` (events available to measure)
- `docs/product/prd.md` metrics section
- `production/experiments/` (existing experiments, numbering)
- `project.yaml`: `stack.analytics` (flags/experiments support)
- The user's baseline conversion rate and weekly traffic for the page or flow

## Design mode (default)

### Phase 1: Hypothesis

Ask for the idea if no argument was given. Shape it into:
"Because we saw **[evidence]**, we believe **[change]** for **[audience]**
will increase **[primary metric]**. We'll know when **[metric moves by MDE]**."
If there is no evidence, say so; the experiment is still allowed but labelled
exploratory.

### Phase 2: Metrics

- **One primary metric**, an event from the tracking plan (missing → suggest `/analytics-plan`).
- **Guardrails**: revenue per visitor, error rate, page performance (LCP/INP), unsubscribe or refund rate as relevant.
- Unit of randomisation (user, not session, for logged-in flows) and exposure event.

### Phase 3: Sample size (show the maths)

Ask for the baseline rate `p` and weekly eligible visitors. With α = 0.05
(two-sided) and power 0.8, per variant:

```
n ≈ (1.96 + 0.84)² × [p(1−p) + p₂(1−p₂)] / (p₂ − p)²     where p₂ = p × (1 + relative MDE)
duration (weeks) = n × variants ÷ weekly eligible visitors   (round up to whole weeks, min 1, max 6)
```

Show the numbers. Example: p = 4%, MDE +20% → p₂ = 4.8%, n ≈ 10,300 per
variant; at 3,000 visitors/week with 2 variants ≈ 7 weeks.

**Low-traffic warning.** If duration > 6 weeks, say so plainly and offer:
`Bigger swing (raise the MDE)`, `Qualitative test instead (5 usability sessions, `/ux-review`)`,
`Sequential before/after with caveats`, `Run anyway`.

### Phase 4: Brief

Spawn `growth-lead` to review the hypothesis and metrics. Fill
`.claude/docs/templates/experiment-brief.md`: hypothesis, variants (with
copy/design references), audience and targeting, metrics, sample size,
duration, stop rule (fixed horizon; no peeking-and-stopping), risks,
implementation notes (flag key, exposure event). Get the number from
`bash .claude/scripts/next-number.sh production/experiments EXP`.
Ask "May I write this to `production/experiments/EXP-NN-<slug>.md`?"

## Readout mode (`readout EXP-NN`)

1. Read the brief. Ask the user for the result numbers per variant
   (exposures, conversions, guardrails); never fetch them from a live system.
2. Check the stop rule was met (sample size reached). If not, label the readout
   `INCONCLUSIVE: stopped early`.
3. Compute rates, absolute and relative lift, and a two-proportion z-test
   p-value and 95% CI. Show the working.
4. Verdict: `WIN`, `LOSS`, `NO DIFFERENCE` or `INCONCLUSIVE`, with guardrail status.
5. Record learnings, including null results. Ask before appending the
   `## Readout` section.

## Output

`production/experiments/EXP-NN-<slug>.md` (template `experiment-brief`).

## Next step

Design: `/dev-story` for the variant implementation. Readout: `/retrospective` or the next `/experiment`.
