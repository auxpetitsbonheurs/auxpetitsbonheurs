# E-05: Pricing, availability, checkout and tracking

Status: planned · Milestone: MVP
PRD: FR-006, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, FR-025, FR-026, FR-027 · Specs: docs/specs/features/pricing-availability-promotions.md, checkout-and-tracking.md
Release phase: 3 Customer site and checkout (part 2)

## Goal
A guest orders with correct prices and valid dates, sees a clear confirmation, tracks the order by private link, and can cancel while pending.

## Success measure
Phase 3 exit: a guest places a 2-item delivery order on a phone, cancels it from tracking, and every Availability, Pricing and Promotions rule check passes (J1, J2, J3, J7, J8). Server total always equals the displayed total.

## Scope
- In: server-side price calculation and copy onto the order (FR-011, FR-012), seasonal window judged on the delivery date (FR-006), notice rule (largest notice, default 3 days, Sunday closed) (FR-013), date picker with reasons (FR-014), submit-time recheck and PRICE_CHANGED handling (FR-015), promotions live/ended by Mauritius time (FR-016, FR-017), one-page basket and checkout (FR-018), pickup/delivery and fee (FR-019), time windows (FR-020), details and +230 phone format (FR-021), policy acceptance (FR-022), confirmation (FR-025), tracking page and wrong-token "not found" (FR-026), customer cancel while pending (FR-027). A11y acceptance criteria on basket and checkout (keyboard-usable, labels, 200% zoom, 320/375 px, tap targets).
- Out: idempotent submit and order number (built in E-01, reused here); custom requests (E-08); emails (E-10); accounts prefill (E-11).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-081 | Pricing rules: server-calculated line and basket totals | ready | 5 |
| S-082 | Promotions: live window, best price, no stacking | ready | 3 |
| S-083 | Availability rules: notice, closed days, blocked days, horizon | ready | 5 |
| S-084 | Seasonal products judged on the pickup/delivery date | ready | 3 |
| S-085 | Basket lines: review, change quantity, remove | ready | 5 |
| S-086 | Choose pickup or delivery, with the delivery fee | ready | 3 |
| S-087 | Date picker that explains unavailable days | ready | 5 |
| S-088 | Choose a time window for delivery or pickup | ready | 2 |
| S-089 | Customer details with Mauritius phone formatting | ready | 3 |
| S-090 | Order summary, payment information and policy acceptance | ready | 3 |
| S-091 | Order submit re-checks dates, products and prices | ready | 5 |
| S-092 | Prices and promotions are copied onto the order | ready | 2 |
| S-093 | Order confirmation page | ready | 2 |
| S-094 | Tracking page by private link | ready | 3 |
| S-095 | Tracking progress bar, final-state alerts and quote block | ready | 3 |
| S-096 | Customer cancels an order while it is pending | ready | 3 |
| S-097 | Re-measure Worker CPU on pricing and checkout (risk T3) | ready | 2 |
| S-098 | Checkout journeys end to end on a phone | ready | 3 |

Total: 60 pts. Files: `production/stories/E-05/`.

## Dependencies
- E-01, E-03 (settings, availability, promotions data), E-04 (product page add-to-basket).

## Risks
- Time-boundary bugs (18:00 promo end, D vs D+1 seasonal); use fixed clocks in tests.
- Worker CPU for price calculation; re-measure after this epic.
