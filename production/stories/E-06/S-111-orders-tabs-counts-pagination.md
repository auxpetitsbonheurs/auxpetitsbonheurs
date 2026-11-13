# S-111: Orders list with tabs, counts and Load more
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#flow
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist

## Story
As an admin on my phone, I want orders grouped in tabs by what needs doing, so that I see first what needs my attention.

## Acceptance Criteria
- [ ] AC1 (FR-049): Given orders in different statuses, when `/admin/orders` loads, then tab To review holds pending_approval and quote_needed (oldest first), Upcoming holds quote_sent, approved, in_preparation, ready_for_pickup, out_for_delivery (by date then window ascending), Completed (newest first), Closed holds cancelled, declined, closed (newest first); each order appears in exactly one tab.
- [ ] AC2 (FR-049): Given tab counts, when the page loads, then each tab shows its count and To review shows a dot when > 0.
- [ ] AC3 (FR-049): Given a quote_sent order, when listed, then it is in Upcoming with a "Waiting for customer" badge (owner Q13).
- [ ] AC4 (FR-049): Given 31 orders in a tab, when loaded, then 30 show and "Load more" fetches the rest by cursor; `limit` is capped at 100 and an invalid cursor or tab returns `VALIDATION_FAILED`.
- [ ] AC5 (FR-049): Given an empty tab, when it loads, then its empty text shows ("No orders to review. Enjoy the quiet." and per-tab equivalents).
- [ ] AC6 (FR-049): Given an anonymous visitor or a signed-in customer, when `/admin/orders` is requested, then redirect to `/admin/login` with no order data; any active Admin or Owner has access.
- [ ] AC7 (FR-049): Given the list fails to load, when requested, then an Alert with Retry shows.
- [ ] AC8 (NFR-002, NFR-006): Given the list at 320 px and 375 px, 200% zoom and keyboard-only, when tabs and rows are used, then tabs follow the tablist pattern with arrow keys, each row is one link with a descriptive name ("APB-0042, Marie, Fri 13 Dec, Approved, unpaid"), status never colour-only, rows >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/orders.test.ts
- AC2 → src/app/routes/admin/orders.test.ts
- AC3 → src/app/routes/admin/orders.test.tsx
- AC4 → src/app/routes/admin/orders.test.ts
- AC5 → src/app/routes/admin/orders.test.tsx
- AC6 → src/app/routes/admin/orders.test.ts
- AC7 → src/app/routes/admin/orders.test.tsx
- AC8 → src/tests/e2e/admin-orders.spec.ts

## Notes
- Loader p95 <= 400 ms at ~12k orders/year: index (status, fulfil_on) and cursor pagination; postgres-specialist confirms the index.
- Depends on E-01 (admin shell, orders table), E-02 (roles). R9 expected.

## Implementation notes (2026-11-13)
- Adjusted (2026-11-13, Juice payment): tabs are To review, Payment (the payment agent's worklists; awaiting_payment lives there), Upcoming, Completed, Closed; Payment also shows a dot when it has orders.
- AC8 adjusted: tabs are links in a `nav` with `aria-current="page"` (each tab is its own address, works before JavaScript, back button), not an ARIA tablist with arrow keys.
- AC4: an invalid cursor or unknown tab is VALIDATION_FAILED (400, Alert with a way back); no tab redirects to To review. Load more appends in place with JavaScript and is a plain link without it.
- Tests: `app/server/repos/admin-order-list.server.test.ts`, `app/routes/admin/orders.test.ts`, `orders-view.test.tsx`, `app/domain/order-tabs.test.ts`, `tests/e2e/admin-orders-list.spec.ts`.
