<!-- Template: release-checklist | Filled by: /release-checklist (release-manager) | Output: production/releases/<version-or-date>/checklist.md -->
# Release Checklist — [VERSION / DATE]

Scope: [STORIES / PRs] · Risk: [LOW | MEDIUM | HIGH] · Verdict: [GO | NO-GO]

## Before
- [ ] All included stories `done`; changelog drafted (`/changelog`)
- [ ] CI green on the release commit [SHA]
- [ ] Critical journeys pass on preview
- [ ] New/changed env vars set in production (by the user)
- [ ] Migrations backward compatible (expand phase); backup taken
- [ ] Feature flags configured; risky changes behind flags
- [ ] Security/dependency checks clean for changed areas
- [ ] Budgets re-checked on changed routes

## Deploy (run by the user or on their instruction)
- [ ] Deploy command / merge: [COMMAND]
- [ ] Migrations applied in order: [STEPS]

## After
- [ ] `/smoke-check` against production
- [ ] Error rate and latency normal for [30] minutes
- [ ] Release notes published (`/release-notes`)

## Rollback
- Trigger: [ERROR RATE > X% / CRITICAL JOURNEY BROKEN]
- Steps: [STEPS] · Data: [FORWARD-FIX OR RESTORE PLAN]
