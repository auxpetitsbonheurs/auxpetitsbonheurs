# S-016: Follow an order on the tracking page
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/specs/features/checkout-and-tracking.md#tracking-page-content
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, api-engineer

## Story
As a customer, I want to open my private tracking link and see my order's status and details, so that I know whether the bakery has accepted it.

## Acceptance Criteria
- [ ] AC1 (FR-026): Given a valid token and no session, when `/t/:token` loads, then it shows the order number, a status badge in customer wording ("Pending approval"), paid status, items, date, time window, delivery or pickup (with address for delivery), delivery fee, total and payment information (Juice number or cash).
- [ ] AC2 (FR-026): Given an order in `pending_approval` or `approved`, then a progress list (`ol`, `aria-current="step"` on the current step) shows the steps Pending approval, Approved, In preparation, Out for delivery or Ready for pickup, Completed, with text such as "Step 2 of 5: Approved" and not by colour alone.
- [ ] AC3 (FR-026): Given a wrong token and an unknown token of valid format, then both return the same 404 page with the same status, body and timing class; given a token not matching `^[A-Za-z0-9_-]{43}$`, then 404 before any database read.
- [ ] AC4 (NFR-004): Given the tracking page, then headers include `Cache-Control: no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`, and the page shows nothing about any other order or customer.
- [ ] AC5 (FR-001): Given the order locale is French, then the page defaults to French and the language switch is present.
- [ ] AC6 (FR-026): Given an admin approves the order, when I reload, then the badge shows "Approved" and the progress moves one step.
- [ ] AC7 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC8 (NFR-002): Given light and dark mode, then every text and badge pair meets WCAG AA contrast per docs/design/tokens.json, status is shown by text as well as colour, and an axe scan reports no serious or critical violations.

## Tests
- AC1 → src/app/routes/site/tracking.test.ts
- AC2 → src/app/domain/status.test.ts (progress steps) and src/tests/e2e/tracking.spec.ts
- AC3 → src/app/routes/site/tracking.test.ts
- AC4 → src/app/routes/site/tracking.test.ts
- AC5 → src/app/routes/site/tracking.test.ts
- AC6 → src/tests/e2e/skeleton-order.spec.ts
- AC7 → src/tests/e2e/tracking.spec.ts
- AC8 → src/tests/e2e/tracking.spec.ts

## Notes
- Depends on: S-013.
- Contract: `site/tracking` loader, minimal subset: order summary, items, `payment`, `progress`. Out of this slice: cancel (FR-027), quote block, decline/cancelled alerts, WhatsApp button (needs Settings content and E-06), RL-track rate limit (class defined with the rate-limit helper in E-02 S-023; applied here in E-05).
- Statuses shown here are `pending_approval` and `approved`; the other statuses render a generic label until E-06.
