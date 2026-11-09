<!-- Template: postmortem | Filled by: /postmortem (observability-engineer, producer) | Output: production/incidents/YYYY-MM-DD-<slug>-postmortem.md -->
# Postmortem — [INCIDENT TITLE]

Date: [YYYY-MM-DD] · Incident: [LINK] · Severity: [SEV] · Blameless: yes

## Summary
[2–3 SENTENCES: WHAT HAPPENED, IMPACT, HOW IT WAS FIXED]

## Impact
- Users affected: [N / %] · Duration: [MIN] · Revenue / data impact: [DETAILS]

## Timeline
| Time | Event |
|---|---|

## Root cause
<!-- 5 whys. Focus on systems and processes, not people. -->
1. Why? [ANSWER]
2. Why? [ANSWER]
…

## Contributing factors
- [MISSING TEST / ALERT / REVIEW STEP / DOCS]

## What went well
- [ITEM]

## What went badly
- [ITEM]

## Detection
Time to detect: [MIN] · Time to mitigate: [MIN] · Could we have caught it earlier? [HOW]

## Action items
| Action | Type (prevent/detect/mitigate) | Owner | Due | Story / issue |
|---|---|---|---|---|
| [ADD REGRESSION TEST FOR …] | prevent | test-engineer | [DATE] | S-[NNN] |
