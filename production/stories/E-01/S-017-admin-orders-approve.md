# S-017: See new orders and approve one from the phone
Status: review
Epic: E-01-walking-skeleton
Spec: docs/specs/features/admin-orders.md#acceptance-criteria
Estimate: 5 pts
Owner: remix-specialist, api-engineer, ui-engineer, postgres-specialist

## Story
As the bakery Owner on my phone, I want to see orders waiting for review and approve one, so that the customer knows the bakery accepted the order.

## Acceptance Criteria
- [x] AC1 (FR-048): Given orders in `pending_approval`, when I open `/admin/orders?tab=review`, then they are listed with number, customer name, date, window, total and source, newest first, with at most 30 per page and a cursor; given none, then "No orders to review." shows.
- [x] AC2 (FR-050): Given a pending order, when I open `/admin/orders/:id`, then I see items with options, contact, fulfilment and address, date, window, total, status and the current `version`.
- [x] AC3 (FR-052): Given `pending_approval`, when I press Approve with the current version, then status becomes `approved`, `version` increases by 1, an `order_event` `approved` with my admin id and an `email_outbox` row `order_confirmed` (order locale, dedupe key per version) are written in one transaction.
- [x] AC4 (FR-054): Given I loaded version 3 and someone else already changed the order, when I press Approve, then `ORDER_CHANGED` (409) shows "This order changed. Reload", and nothing changes.
- [x] AC5 (FR-054): Given two simultaneous Approve requests with the same version, then exactly one succeeds and exactly one outbox row exists.
- [x] AC6 (FR-052): Given an order that is not `pending_approval`, when Approve is posted, then `INVALID_TRANSITION` (409) and no change.
- [x] AC7 (FR-039, FR-041): Given an anonymous visitor or a customer session, when opening `/admin/orders` or posting `approve`, then I am redirected to `/admin/login` and no order data is returned; an Admin and an Owner may both approve; an unknown order id gives `NOT_FOUND`.
- [x] AC8 (NFR-002): Given the list and detail pages at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px, with the Approve button reachable with one thumb.
- [x] AC9 (NFR-002): Given Approve is pressed, then the button shows a loading state and keeps its name, the result is announced in a polite live region, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/admin/orders.test.ts, src/app/routes/admin/orders-view.test.tsx (empty state) and src/tests/e2e/admin-approve.spec.ts
- AC2 → src/app/routes/admin/order.test.ts and src/tests/e2e/admin-approve.spec.ts
- AC3 → src/app/server/services/approve-order.server.test.ts (PGlite with the real migrations) and src/tests/e2e/admin-approve.spec.ts (local Postgres)
- AC4 → src/app/server/services/approve-order.server.test.ts, src/app/routes/admin/order.test.ts and src/tests/e2e/admin-approve.spec.ts
- AC5 → src/app/server/services/approve-order.server.test.ts and src/tests/e2e/admin-approve.spec.ts (concurrent posts against Postgres)
- AC6 → src/app/server/services/approve-order.server.test.ts and src/app/domain/status.test.ts
- AC7 → src/app/routes/admin/orders.test.ts, src/app/routes/admin/guard.test.ts and src/tests/e2e/admin-approve.spec.ts
- AC8 → src/tests/e2e/admin-approve.spec.ts
- AC9 → src/tests/e2e/admin-approve.spec.ts

## Notes
- Depends on: S-009, S-013, S-016.
- Contract subset: `admin/orders` loader (tab `review`, cursor) and `admin/order` loader with the `approve` intent only; `allowed` returns `approve` only. Decline, quote, advance, edit, search and the other tabs are E-06.
- The spec's AC17 queues an "Order confirmed" email; here only the outbox row is written (sending is E-10).
- Admin/Owner role checks beyond "active admin" are enforced in E-02 (S-022); both roles may approve anyway.
- UX: `docs/design/ux/admin-order-day.md` (order detail and approve).
- Bottom bar and Today are E-02/E-06; this slice is reached by typed URL or a link on the shell.

### Decisions (2026-11-10, implementation)
- Review tab is newest first, as this story says (the spec's Flow says oldest first; E-06 settles the tab defaults). Keyset paging on the gap-free order number (unique, increases with creation) with an opaque base64url cursor: exact, no timestamp precision issues. A tab other than `review` redirects to `?tab=review` in this slice.
- Approve is one conditional `UPDATE ... WHERE id AND version AND status = 'pending_approval'` in a transaction with the `approved` event and the `order_confirmed` outbox row (`order:<id>:order_confirmed:v<newVersion>`, order locale); no row matched is then explained as NOT_FOUND, ORDER_CHANGED (version differs) or INVALID_TRANSITION. An order without email (manual) gets no outbox row.
- The order screen shows a sticky Approve bar, the result in a visible polite status region, and a focused conflict Alert with a "Reload the order" link. `domain/status.ts` holds the transition table (`transitionTarget`, `allowedActions`), approve only.
- S-016 AC6's direct DB write in `skeleton-order.spec.ts` is replaced by the Owner approving on the admin order screen (separate page).
- Admin and Owner both approve (no role check beyond active admin, as noted above).
