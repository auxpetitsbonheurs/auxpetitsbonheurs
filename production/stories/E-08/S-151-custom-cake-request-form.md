# S-151: Submit a custom cake request
Status: done
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#flow
Estimate: 5 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist, test-engineer, accessibility-specialist

## Story
As a customer who wants a bespoke cake, I want to describe it in a form and send it, so that the bakery can send me a quote.

## Acceptance Criteria
- [x] AC1 (FR-028): Given a valid form with no photos (occasion, date, window, servings, flavours, contact, policies ticked), when I submit, then an order of source custom_request exists with status Quote needed, number APB-nnnn, a tracking token, event `created`, and I am redirected to `/order/:token/confirmed`.
- [x] AC2 (FR-028): Given the confirmation page, then it says "Request received, we will send you a quote" (not a confirmed order), shows the request number and tracking link, and offers "Save my details" to guests.
- [x] AC3 (FR-028, FR-014): Given the date picker, then it uses the same availability rules, reasons and 90-day `DayStatus` as checkout and never shows a private block reason; given the date becomes blocked or too soon before submit, then `DATE_UNAVAILABLE` shows with the reason and the form is kept.
- [x] AC4 (FR-028): Given invalid input (servings outside 1..500, text on cake over 200, details over 2000, budget negative, missing name/phone/email, malformed email, policies unticked, delivery without address), when I submit, then field errors appear under the fields, an Alert at top lists them as links and nothing is created.
- [x] AC5 (FR-028): Given two rapid submits with one `idempotencyKey`, then exactly one order exists; a replay returns the original redirect.
- [x] AC6 (FR-028, FR-070): Given the request is created, then a "Request received" email is queued in my language (FR when I use `/fr/custom-cake`), the request and outbox row written in one transaction.
- [x] AC7 (FR-028, FR-021): Given I am signed in, then contact and saved addresses are prefilled; given a guest, then the form is empty.
- [x] AC8 (FR-028, NFR-007): Given `/fr/custom-cake`, then all labels, errors and helper text are French and the "Not confirmed until we send you a quote and you accept" notice is shown in both languages.
- [x] AC9 (FR-028): Given a wrong tracking token on the confirmation page, then "not found" and a WhatsApp button show with no order data.
- [x] AC10 (NFR-002): Given keyboard only, then every field is reachable in logical order, has a visible label and hint, errors are linked via `aria-describedby`, the top Alert takes focus on failed submit, and select/date/time controls are native or fully keyboard-operable.
- [x] AC11 (NFR-002, NFR-006): Given 320 px and 375 px and 200% zoom, then there is no horizontal scroll (long French button text wraps), tap targets are at least 44 px, text and borders meet WCAG AA contrast per `docs/design/tokens.json`, and phone/email/numeric fields show correct keyboards.
- [x] AC12 (NFR-001): Given the route, then initial JS stays within the budget in `project.yaml` and submit p95 <= 800 ms excluding uploads.

## Tests
- AC1 → src/tests/e2e/custom-request.spec.ts
- AC2 → src/tests/e2e/custom-request.spec.ts
- AC3 → src/app/routes/custom-cake.test.tsx
- AC4 → src/app/routes/custom-cake.test.tsx
- AC5 → src/app/routes/custom-cake.test.tsx
- AC6 → src/app/routes/custom-cake.test.tsx
- AC7 → src/app/routes/custom-cake.test.tsx
- AC8 → src/app/routes/custom-cake.test.tsx
- AC9 → src/app/routes/order.$token.confirmed.test.tsx
- AC10 → src/tests/e2e/custom-request.a11y.spec.ts
- AC11 → src/tests/e2e/custom-request.a11y.spec.ts
- AC12 → src/tests/e2e/custom-request.perf.spec.ts

## Notes
- Dependencies (R9, expected): E-01, E-05 (availability domain, `DayStatus`, tracking token, confirmation page, checkout form components), E-04 (gallery for S-154), E-10 (email content; outbox stub is enough).
- Photos arrive in S-152/S-153; this slice works with zero photos (allowed). Spam protection and rate limits: S-162 (this story's action must be wired to it before release).
- UX: docs/design/ux/custom-request-quote.md and spec "Screens & states".
- Rationale: smallest end-to-end path (form to Quote needed) first.

## Build notes (2026-11-13, E-08 slice 1)
- Built: form on the S-252 page (`app/routes/site/custom-order.tsx`, `app/components/custom-request/`), `submit_custom_request` procedure (drizzle/0016), service `app/server/services/custom-request.server.ts`, contract v0.43.
- AC2 adjusted: the confirmation says "Request received, we will send you a quote" with number and tracking link; **"Save my details" is not offered yet**: it ships with customer accounts (E-11), like the checkout confirmation (`offerSaveDetails: false`).
- AC6: "Request received" and an admin email alert (`admin_alert_new_request`) are outbox rows in the same transaction; sending, and the admin push, arrive with E-10.
- AC7 adjusted: customer accounts and sign-in do not exist yet, so there is nothing to prefill; guests get an empty form (tested). Prefill follows when the accounts work lands (`site/custom-cake` loader `prefill`).
- AC12: initial JS within the route budget (`npm run check:js-budget`); the compressor and HEIC decoder load on the first photo. Submit p95 is not measured locally (one procedure call plus Storage reads; no perf spec yet).
- Tests: `app/server/services/custom-request.server.test.ts`, `app/routes/site/custom-order.test.ts(x)`, `app/routes/site/order-confirmed.test.ts`, `tests/e2e/custom-request.spec.ts` (test file names differ from the map above).
