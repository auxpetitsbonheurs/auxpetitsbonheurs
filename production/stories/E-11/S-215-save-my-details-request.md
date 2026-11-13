# S-215: Offer "Save my details" after a guest order
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#api-contract
Estimate: 3 pts
Owner: ui-engineer, auth-specialist

## Story
As a guest who just ordered, I want to save my details for next time with one tap, so that I do not have to type everything again.

## Acceptance Criteria
- [ ] AC1 (FR-038): Given a guest order with an email and no account on that email, then the confirmation page shows "Save your details for next time"; tapping opens `/account/save-details?t=<tracking token>`.
- [ ] AC2 (FR-038): Given I confirm on that page (Turnstile passed, no password asked), then an unconfirmed account for the order's email is created with a discarded random password, a confirmation email is sent and the page says "Check your email".
- [ ] AC3 (FR-038): Given Save my details completed but not yet confirmed, then My orders shows nothing and the order just placed stays reachable through its tracking link only.
- [ ] AC4 (FR-038): Given `EMAIL_IN_USE`, then the page offers sign-in and creates nothing (same response timing).
- [ ] AC5 (FR-038): Given a manual order without an email, then the card is not offered.
- [ ] AC6 (FR-038): Given a wrong or unknown tracking token, then `NOT_FOUND` (same response for both).
- [ ] AC7 (FR-038, NFR-003): Given 4 requests in an hour from one IP, then `RATE_LIMITED`; given failed Turnstile, `BOT_CHECK_FAILED`.
- [ ] AC8 (FR-038): Given the card is shown only on the confirmation page (owner decision 20), then it is not shown on the tracking page.
- [ ] AC9 (NFR-002): Given keyboard only and a screen reader, then the card action works, focus is visible, and "Check your email" is a status region that takes focus.
- [ ] AC10 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`.
- [ ] AC11 (NFR-007): Given an FR order, then the card, page and email are in French.

## Tests
- AC1 → src/app/routes/account/save-details.test.tsx
- AC2 → src/app/routes/account/save-details.test.ts
- AC3 → src/app/routes/account/save-details.integration.test.ts
- AC4 → src/app/routes/account/save-details.test.ts
- AC5 → src/app/routes/account/save-details.test.tsx
- AC6 → src/app/routes/account/save-details.test.ts
- AC7 → src/app/routes/account/save-details.test.ts
- AC8 → src/tests/e2e/account-save-details.spec.ts
- AC9 → src/tests/e2e/account-save-details.spec.ts
- AC10 → src/tests/e2e/account-save-details.spec.ts
- AC11 → src/app/routes/account/save-details.test.tsx

## Notes
- PRD cut order #4. Spec AC24-AC27. Security: no history is shown at this step (README decision 1); linking is S-216.
- Dependencies (R9): S-206, S-194, E-05 (confirmation page, tracking token). Not yet done; expected.

## Build notes (2026-11-13)
- Turnstile (2026-11-14, reusing E-08's `useTurnstile` and `turnstileContext`): the form carries the invisible widget's token and the server answers BOT_CHECK_FAILED for a missing or bad one (after the rate limit, before any Auth call); without configured keys the check is skipped, as on the custom-cake form. Test: src/app/routes/account/bot-check.test.ts.
- AC1 adjusted: the card shows for every website order when the browser has no customer session; the confirmation page keeps its no-database path (checkout AC48), so it does not check whether the email already has an account. The save-details page answers that case with EMAIL_IN_USE and a Sign in button (AC4).
- AC5: manual orders never reach the confirmation page; save-details refuses orders that are not website orders or have no email (NOT_FOUND).
- Counters: `save_details_completed` here, `account_created` with method `save_details` at confirmation; `save_details_shown` is not counted (it would add a database write to the no-database confirmation path).
- Tests: src/app/routes/account/save-details.test.ts, src/app/routes/site/order-confirmed.test.ts, src/tests/e2e/account.spec.ts.
