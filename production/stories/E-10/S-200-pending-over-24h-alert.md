# S-200: Admins are nudged once when an order waits over 24 hours
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#pending-alert-evening-reminder-quote-expired-rules
Estimate: 3 pts
Owner: api-engineer

## Story
As an admin, I want a single push when a website order has been waiting for approval for more than a day, so that no customer is left unanswered.

## Acceptance Criteria
- [ ] AC1 (FR-075): Given a website order Pending approval for 24 h 1 min, when `pendingAlerts` runs, then each opted-in admin receives exactly one push that opens `/admin/orders/<id>`; no status change and an order event `pending_alert_sent`.
- [ ] AC2 (FR-075): Given the order is approved or cancelled at 23 h, then no push is sent.
- [ ] AC3 (FR-075): Given the job runs again later, then no second push for that order.
- [ ] AC4 (FR-075): Given a custom request waiting over 24 h, then no pending alert (website orders only).
- [ ] AC5 (FR-075): Given two overlapping ticks, then the marker is set in the same statement that selects the rows (`UPDATE ... WHERE pending_alert_sent_at IS NULL RETURNING`), so each order alerts once.
- [ ] AC6 (FR-075, FR-046): Given an admin with push off or deactivated, then they get nothing; no email is sent for this alert.
- [ ] AC7 (FR-075): Given an order at exactly 23 h 59 min, then no alert; the order created at 24 h 1 min is alerted on the next tick.
- [ ] AC8 (FR-075): Given an order is reverted to Pending approval after an alert, then it is not alerted again (marker kept).

## Tests
- AC1 → src/app/jobs/pending-alerts.test.ts
- AC2 → src/app/jobs/pending-alerts.test.ts
- AC3 → src/app/jobs/pending-alerts.test.ts
- AC4 → src/app/jobs/pending-alerts.test.ts
- AC5 → src/app/jobs/pending-alerts.integration.test.ts
- AC6 → src/app/jobs/pending-alerts.test.ts
- AC7 → src/app/jobs/pending-alerts.test.ts
- AC8 → src/app/jobs/pending-alerts.test.ts

## Notes
- FR-075 is Should and not in the PRD cut order (mitigates R11): keep. Email version is an open question (assumed push only).
- AC8 is an inferred edge; the spec says once per order.
- Dependencies (R9): S-196, E-05, E-06 (status). Not yet done; expected.
