# S-187: Stay inside the free email limit and show the Owner today's usage
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#edge-cases
Estimate: 3 pts
Owner: email-specialist, api-engineer

## Story
As the Owner, I want critical customer emails to keep flowing when the free daily limit is near, and to see how many were sent today, so that busy days never block an order confirmation and I stay within the free plan.

## Acceptance Criteria
- [ ] AC1 (FR-074, NFR-009): Given 90 emails sent today (Mauritius date), when a `thank_you` or `admin_alert_*` email is due, then it is deferred to the next day and an `email_deferred_cap` counter is recorded.
- [ ] AC2 (FR-074, NFR-009): Given 90 emails sent today, when `order_received`, `request_received`, `quote`, `order_confirmed`, `order_updated`, a decline, a cancellation, an auth email or an invitation is due, then it still sends until 100.
- [ ] AC3 (NFR-009): Given 100 emails sent today, then all further rows stay `pending` and send after midnight MU time; no row is marked `dead` because of the cap.
- [ ] AC4 (NFR-009): Given the Owner opens Settings, then "Email usage" shows "n of 100 today" from the settings loader ("0 of 100 today" when none sent).
- [ ] AC5 (FR-074, NFR-003): Given an Admin who is not Owner, when requesting the settings loader data, then the usage figure is not returned (and the screen is refused with 403).
- [ ] AC6 (NFR-004): Given outbox rows older than 90 days, when `purge` runs at 03:00, then their payloads are deleted and newer rows are untouched.
- [ ] AC7 (NFR-009): Given the day rolls over at 00:00 MU, then the counter resets and deferred non-critical rows are sent in the next ticks within the 50-per-tick limit.

## Tests
- AC1 → src/app/server/email/daily-cap.test.ts
- AC2 → src/app/server/email/daily-cap.test.ts
- AC3 → src/app/server/email/daily-cap.test.ts
- AC4 → src/app/routes/admin/settings.test.tsx
- AC5 → src/app/routes/admin/settings.test.tsx
- AC6 → src/app/jobs/purge.test.ts
- AC7 → src/app/server/email/daily-cap.test.ts

## Notes
- Cap split decided 2026-11-10 (README decision 13); admin alert emails are non-critical because push covers them (spec Open Question, assumed).
- The Email usage block is a read-only line on the E-03 Settings screen; a11y of that screen belongs to E-03.
- Dependencies (R9): S-186, E-03 (Settings screen), E-02 (Owner role). Not yet done; expected.
