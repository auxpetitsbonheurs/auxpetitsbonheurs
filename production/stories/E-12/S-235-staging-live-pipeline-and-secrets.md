# S-235: Staging and live deploy automatically with secrets in the bakery's accounts
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: hosting-platform-specialist, observability-engineer

## Story
As the Owner, I want safe automatic deploys and monitoring on accounts I own, so that releases are routine and problems are noticed.

## Acceptance Criteria
- [ ] AC1 (NFR-012): Given a merge to the main branch, then staging deploys automatically after tests pass, and live deploys by an explicit promotion step; a failing test blocks both.
- [ ] AC2 (NFR-012): Given the live and staging environments, then each has its own database, storage, Resend domain, Turnstile keys, VAPID keys and hook secret in the bakery's accounts; production values differ from staging.
- [ ] AC3 (NFR-003): Given staging, then it sends emails only to test inboxes and is not indexed (`noindex`, auth-gated or robots block).
- [ ] AC4 (NFR-012): Given a bad release, then rollback to the previous deployment is documented and was tried once on staging (time to roll back recorded).
- [ ] AC5 (NFR-005): Given Sentry on live, then errors arrive with release and request ID, no PII, and an alert reaches the builder and Owner; a deliberate test error proves the path.
- [ ] AC6 (NFR-012): Given `/healthz`, then it returns 200 on live and an uptime check pings it with an alert on failure.
- [ ] AC7 (NFR-012): Given migrations, then they are forward-only and applied to live only on the Owner's/builder's instruction after staging success; no migration is run against live by an agent.

## Tests
- AC1 → production/audits/pipeline-2026.md
- AC2 → production/audits/pipeline-2026.md
- AC3 → src/tests/e2e/staging-guard.spec.ts
- AC4 → production/audits/pipeline-2026.md
- AC5 → production/audits/pipeline-2026.md
- AC6 → src/app/routes/healthz.test.ts
- AC7 → production/audits/pipeline-2026.md

## Notes
- Builds on E-01 pipeline. No production deploys or migrations are executed by this story's agents without the user's instruction.
- Dependencies (R9): E-01. Not yet done; expected.
