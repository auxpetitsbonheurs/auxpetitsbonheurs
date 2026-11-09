<!-- Template: runbook | Filled by: /observability-setup, /deploy-setup (observability-engineer, devops-lead) | Output: docs/runbooks/<topic>.md -->
# Runbook — [SYSTEM / ALERT NAME]

Owner: [the user] · Last tested: [YYYY-MM-DD]

## When this fires
- Alert: [NAME] · Condition: [THRESHOLD] · Dashboard: [LINK]

## Impact
[WHAT USERS EXPERIENCE]

## Diagnose
1. Check [DASHBOARD / LOGS QUERY]: `[QUERY]`
2. Check recent deploys: [WHERE]
3. Check dependencies: [DB, PROVIDER STATUS PAGES]

## Mitigate
| Situation | Action | Command / where |
|---|---|---|
| Bad deploy | Roll back | [HOST UI / COMMAND] |
| DB overloaded | [ACTION] | |
| Provider outage | [FALLBACK / STATUS MESSAGE] | |

## Verify recovery
- [METRIC BACK TO NORMAL], smoke check passes

## Escalate / communicate
- Status page / user message template: [LINK]
- Then open an incident: `/incident`
