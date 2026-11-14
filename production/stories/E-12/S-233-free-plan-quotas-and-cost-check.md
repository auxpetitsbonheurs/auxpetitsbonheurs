# S-233: Everything stays on free plans except the domain
Status: in-progress
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 2 pts
Owner: hosting-platform-specialist, observability-engineer

## Story
As the Owner, I want to know every service stays free and what happens near the limits, so that I never get a surprise bill or a stopped site.

## Acceptance Criteria
- [x] AC1 (NFR-009): Given the service list (Cloudflare Workers, Supabase, Resend, Sentry, push), then each is on a free plan that allows commercial use, checked against its current terms, and the result is recorded in the handover sheet (yearly cost column).
- [x] AC2 (NFR-009): Given the limits (about 100 emails/day, 1 GB photos, DB size, Worker requests and CPU), then current usage, a projection from expected orders and an alert threshold are documented.
- [x] AC3 (NFR-009): Given usage crosses 80% of a limit, then the Owner is notified by email (or a documented manual check weekly) and the action to take is written down.
- [ ] AC4 (NFR-005): Given a free-plan service that pauses on inactivity, then the keep-alive keeps it awake and `/healthz` returns 200 with `db: ok, auth: ok`; a failing health check raises a Sentry alert.
- [ ] AC5 (NFR-009): Given a limit is breached on staging in a test (e.g. email cap), then the system degrades as designed (critical emails still go, others defer) and no order is lost.
- [x] AC6 (NFR-009): Given any item that would need a paid plan (e.g. Worker CPU, Resend volume), then it is raised to the Owner as a decision, not enabled.

## Tests
- AC1 → production/audits/cost-quotas-2026.md
- AC2 → production/audits/cost-quotas-2026.md
- AC3 → production/audits/cost-quotas-2026.md
- AC4 → src/app/routes/healthz.test.ts
- AC5 → src/app/server/email/daily-cap.test.ts
- AC6 → production/audits/cost-quotas-2026.md

## Notes
- Do not call paid APIs or change plans; read dashboards only (user instruction needed otherwise). Plan terms may have changed; verify on the day.
- Dependencies (R9): E-01, S-187, S-231. Not yet done; expected.

## Launchprep notes (2026-11-14)
- docs/runbooks/free-plans.md: limits, usage, projection at 50 orders/week, 80% thresholds, weekly 5-minute check; repository is public (Actions free); GitHub's 60-day rule for scheduled workflows flagged; Supabase photo egress is the first limit likely to bite. AC4: healthz and keepAlive verified on staging, no Sentry alert yet. AC5 (cap degrade test on staging) not run: the E-10 daily cap has unit tests.
