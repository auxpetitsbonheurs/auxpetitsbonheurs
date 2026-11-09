<!-- Template: experiment-brief | Filled by: /experiment (growth-lead) | Output: production/experiments/EXP-NN-<slug>.md -->
# EXP-[NN]: [EXPERIMENT NAME]

Status: [draft | running | stopped | concluded] · Owner: growth-lead · Dates: [START → END]

## Hypothesis
Because [EVIDENCE], we believe [CHANGE] for [AUDIENCE] will [EFFECT], measured by [METRIC].

## Design
- Type: [A/B | multivariate | before/after | qualitative test]
- Variants: Control = [CURRENT]; B = [CHANGE]
- Audience / allocation: [WHO, % SPLIT] · Flag: [FLAG NAME]

## Metrics
- Primary: [METRIC] · Baseline: [X%]
- Guardrails: [REVENUE, ERROR RATE, LCP, UNSUBSCRIBES]

## Power
- Minimum detectable effect: [X% RELATIVE] · Required sample: [N per variant] · Expected duration: [DAYS at TRAFFIC]
<!-- If the required duration is unrealistic, use a qualitative test or a bigger change instead. -->

## Stop rule
Run until [N per variant] or [DATE]; no early stopping on peeks. Stop early only if a guardrail breaches [THRESHOLD].

## Result (filled at end)
| Variant | Users | Conversions | Rate | Δ vs control | 95% CI |
|---|---|---|---|---|---|
Decision: [SHIP B | KEEP CONTROL | ITERATE] · Learning: [WHAT WE LEARNED]
