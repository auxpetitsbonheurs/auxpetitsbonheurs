# S-098: Checkout journeys end to end on a phone
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#acceptance-criteria
Estimate: 3 pts
Owner: test-engineer, accessibility-specialist

## Story
As the bakery owner, I want the main ordering journeys proven end to end on a phone-sized screen, so that I can trust the site before launch.

## Acceptance Criteria
- [x] AC1 (FR-018, FR-019, FR-021, FR-022, FR-025): Given a 375 px viewport, when a guest adds 2 items, chooses delivery (fee Rs 200), a valid date and window, enters details and accepts policies, then the order is placed and the confirmation shows the number and tracking link (J1).
- [x] AC2 (FR-019, FR-025, NFR-007): Given a French pickup order on `/fr`, when placed, then no fee is charged, the confirmation and tracking pages are French (J2).
- [x] AC3 (FR-027): Given a pending order, when the guest cancels from tracking, then it shows Cancelled; after an admin approves a second order no Cancel button shows (J3).
- [x] AC4 (FR-026): Given a wrong token, when opened, then "We can't find this order" shows (J7).
- [x] AC5 (FR-023, FR-015): Given a double click on Place order, when sent twice, then one order exists; given a promotion ending between render and submit, then the price-changed flow shows and the second submit succeeds (J8).
- [x] AC6 (FR-006, FR-013): Given a seasonal item and a blocked day, when picking dates, then out-of-season and blocked dates are refused client and server side.
- [x] AC7 (FR-011): Given the displayed total, when the order is placed, then the server total, the confirmation total and the tracking total are equal.
- [x] AC8 (NFR-002, NFR-006): Given the whole checkout at 320 px and 375 px, 200% zoom and keyboard only, when axe runs on each step and state (empty, error, price changed), then there are zero serious or critical issues, no prototype stepper-label or copied aria-label defects, tap targets >= 44 px, contrast AA per `docs/design/tokens.json`.
- [ ] AC9 (NFR-001): Given `/basket` on throttled 4G, when measured, then LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1.

## Tests
- AC1 → src/tests/e2e/checkout.spec.ts
- AC2 → src/tests/e2e/checkout.spec.ts
- AC3 → src/tests/e2e/tracking.spec.ts
- AC4 → src/tests/e2e/tracking.spec.ts
- AC5 → src/tests/e2e/checkout.spec.ts (fixed clock via test hook)
- AC6 → src/tests/e2e/checkout.spec.ts
- AC7 → src/tests/e2e/checkout.spec.ts
- AC8 → src/tests/e2e/checkout-a11y.spec.ts
- AC9 → src/tests/e2e/perf-budgets.spec.ts

## Notes
- Closes the epic success measure (phase 3 exit). Approve step in AC3 uses the E-01 minimal admin approve. Runs after S-085..S-096.
- Test data: Juice number placeholder, pickup Beau Bassin, delivery fee Rs 200.

## Implementation notes (2026-11-13, E-05 finish)
- AC1, AC7, AC3: new journey "S-098 journeys on a phone" in src/tests/e2e/checkout.spec.ts (320, 375 and 1280 px): two items, delivery Rs 200, date, window, details, policies; the button, the stored order, the confirmation and the tracking page all show Rs 1,900; then the guest cancels from tracking (`cancel_reason = customer`). No Cancel after approval: src/tests/e2e/tracking.spec.ts S-096 AC3.
- AC2: checkout.spec.ts S-013 French pickup order (no fee, locale fr, /fr confirmation) + tracking.spec.ts S-016 AC5 (French tracking).
- AC4: tracking.spec.ts S-016 AC3. AC5: checkout.spec.ts S-014 AC7 (double click, one order); the offer ending at 18:00 between render and submit is pinned with a fixed clock in place-order-options.server.test.ts, and the PRICE_CHANGED page flow end to end in basket-instant.spec.ts (price changed after render, then the second submit succeeds). AC6: checkout-dates.spec.ts (S-087 AC5, AC6; S-084).
- AC8: axe, 44 px targets, keyboard and 200% zoom run on the empty basket, error summary, price changed, date picker, confirmation, tracking, cancel dialog and not-found.
- AC9 open: LCP/INP/CLS on throttled 4G need the Lighthouse run against staging (S-276 measured LCP there). Not run from this job.
