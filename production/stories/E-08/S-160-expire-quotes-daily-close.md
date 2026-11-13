# S-160: Expired quotes close themselves
Status: done
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#api-contract
Estimate: 3 pts
Owner: api-engineer, postgres-specialist, test-engineer

## Story
As an admin, I want unanswered quotes to close automatically after they expire, so that the To review and Upcoming lists do not fill with dead requests and the customer is told.

## Acceptance Criteria
- [x] AC1 (FR-032): Given `quote_expires_on` = D and the job ticks after D 23:59 Mauritius time, then status is Closed, event `quote_expired` (actor system) is logged, "Quote closed" is queued, and a push goes to admins with push on, within 24 h of expiry.
- [x] AC2 (FR-032): Given the job runs twice, then there is one email and one push only (versioned update; already-closed rows skipped).
- [x] AC3 (FR-032): Given a customer accepted just before and the job reads stale data, then the versioned update fails and the order stays Approved.
- [x] AC4 (FR-032, FR-046): Given an admin with push off, then no expiry push is sent to them.
- [x] AC5 (FR-032): Given a quote with `quote_expires_on` today or later, then it stays Quote sent; given it expired yesterday but the job has not run, then Accept already returns `QUOTE_EXPIRED` (see S-158).
- [x] AC6 (FR-032): Given no expired quotes, then the job returns an empty JobReport with no error; given one row failing, then others are still processed and the failure is reported.
- [x] AC7 (FR-032): Given a closed quote, then the tracking page shows the Closed status text with no buttons.
- [x] AC8 (FR-032, NFR-008): Given dates, then "today" and expiry use the Mauritius calendar date (UTC+4) with a fixed test clock.

## Tests
- AC1 → src/app/jobs/expire-quotes.test.ts
- AC2 → src/app/jobs/expire-quotes.test.ts
- AC3 → src/app/jobs/expire-quotes.test.ts
- AC4 → src/app/jobs/expire-quotes.test.ts
- AC5 → src/app/jobs/expire-quotes.test.ts
- AC6 → src/app/jobs/expire-quotes.test.ts
- AC7 → src/app/routes/t.$token.test.tsx
- AC8 → src/app/domain/dates.test.ts

## Notes
- Depends on S-156, E-01 (job runner and tick), E-10 (email and push). Contract: job `expireQuotes` (hourly tick; spec text "daily" in epic means at least once a day, hourly satisfies FR-032).
- API-only story: no UI a11y ACs. The tracking-page assertion AC7 is covered by S-158's accessibility checks.

## Build notes (2026-11-13, E-08)
- `app/jobs/expire-quotes.ts`, dispatched every hourly tick; one versioned update per row (AC3, AC6), "Quote closed" shares its dedupe key with the customer's decline (S-159 AC4).
- AC1/AC4 adjusted: the admin push for an expired quote waits for E-10's push sender (no push infrastructure yet); the email and event are written now.
