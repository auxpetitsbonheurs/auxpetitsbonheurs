# S-186: Order emails are queued and retried so no order is lost when email fails
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#edge-cases
Estimate: 5 pts
Owner: email-specialist, api-engineer

## Story
As a customer placing an order, I want my order saved even when the email provider is down, so that I am never told "failed" for an order the bakery can still fulfil and I still get my emails later.

## Acceptance Criteria
- [ ] AC1 (FR-074, NFR-005): Given an order is placed, when the status change commits, then one `email_outbox` row per customer email is inserted in the same DB transaction and sending runs after commit via `ctx.waitUntil`, never blocking the customer response.
- [ ] AC2 (FR-074): Given Resend returns 500, when an order is placed, then the order exists, admins are alerted by push (see S-195) and the outbox row is `pending` with `next_attempt_at` = now + 1 h.
- [ ] AC3 (FR-074): Given a pending row due and Resend healthy, when `retryEmails` runs, then the row becomes `sent` with `provider_id` and exactly one email is delivered; at most 50 due rows are sent per tick.
- [ ] AC4 (FR-074): Given repeated failures, then retries happen at 1 h, 2 h, 4 h, 8 h, 24 h and the 6th failure sets `dead`, writes an `email_failed` order event with the reason and sends a Sentry alert.
- [ ] AC5 (FR-074): Given Resend answers a permanent 4xx other than 429 (e.g. invalid address), when sending, then the row is `dead` at once with no further retries; given 429, then it is retried as a transient failure.
- [ ] AC6 (FR-074, NFR-003): Given the same action replayed (double tap, retry) with the same `dedupe_key` (`order:<id>:<key>:v<orderVersion>`), then no second outbox row and no duplicate email.
- [ ] AC7 (FR-074): Given Resend does not answer within 8 s, then the call times out, the row stays `pending` with backoff and the request is not held.
- [ ] AC8 (FR-074): Given `RESEND_API_KEY` is empty (rollback switch), then rows stay `pending` and are sent after the key is restored; no row is lost.
- [ ] AC9 (FR-074): Given the `retryEmails` job has no due rows, then it returns `{ ran: true, processed: 0 }` and no error.
- [ ] AC10 (NFR-003): Given `RESEND_API_KEY` and all email env vars, then they are read from validated typed env and documented only as placeholders in `.env.example`; no key appears in logs.

## Tests
- AC1 → src/app/server/email/outbox.test.ts
- AC2 → src/app/server/email/outbox.test.ts
- AC3 → src/app/jobs/retry-emails.test.ts
- AC4 → src/app/jobs/retry-emails.test.ts
- AC5 → src/app/server/email/send.test.ts
- AC6 → src/app/server/email/outbox.test.ts
- AC7 → src/app/server/email/send.test.ts
- AC8 → src/app/server/email/send.test.ts
- AC9 → src/app/jobs/retry-emails.test.ts
- AC10 → src/app/server/env.test.ts

## Notes
- Replaces the E-01 outbox stub; keeps its table and `dedupe_key` pattern. Resend is mocked (no real network, fixed clock).
- The order-log display of `email_failed` is in S-203.
- Dependencies (R9): E-01 (outbox stub, jobs dispatch), E-05/E-06/E-08 (callers). Not yet done; expected.
