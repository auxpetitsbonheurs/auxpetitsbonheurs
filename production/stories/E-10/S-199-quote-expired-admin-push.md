# S-199: Admins are told when a quote expires
Status: done
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#pending-alert-evening-reminder-quote-expired-rules
Estimate: 2 pts
Owner: api-engineer

## Story
As an admin, I want a push when a quote I sent runs out without an answer, so that I can follow up with the customer.

## Acceptance Criteria
- [ ] AC1 (FR-072): Given a quote that expires, when `expireQuotes` closes it, then each admin with push on receives one push opening `/admin/orders/<id>` and the customer gets `quote_closed` (see S-190).
- [ ] AC2 (FR-072): Given the status update fails or the row is already closed, then no push is sent.
- [ ] AC3 (FR-072): Given an admin with push off or deactivated, then nothing is sent; no email is sent for this alert to anyone.
- [ ] AC4 (FR-072): Given the job runs twice, then only one push per admin for that quote (already-closed rows skipped).
- [ ] AC5 (NFR-004): Given the push, then it shows order number and first name only, in the admin's locale.

## Tests
- AC1 → src/app/jobs/expire-quotes.push.test.ts
- AC2 → src/app/jobs/expire-quotes.push.test.ts
- AC3 → src/app/jobs/expire-quotes.push.test.ts
- AC4 → src/app/jobs/expire-quotes.push.test.ts
- AC5 → src/app/jobs/expire-quotes.push.test.ts

## Notes
- The expiry logic and status change belong to E-08; this story adds the push hook after the status update succeeds.
- Dependencies (R9): S-196, S-190, E-08. Not yet done; expected.

## Implementation notes
- Implemented 2026-11-13 (push hook in `app/jobs/expire-quotes.ts` after a successful close).
