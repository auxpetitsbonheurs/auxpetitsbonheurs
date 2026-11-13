# S-112: Search and filter orders
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#flow
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist

## Story
As an admin, I want to find an order by name, phone or number and filter by date, fulfilment and payment, so that I can answer a customer in seconds.

## Acceptance Criteria
- [ ] AC1 (FR-049): Given a customer phone typed with spaces or +230 ("5712 3456", "+230 5712 3456"), when searched, then the matching orders show (digits normalised, 230 prefix ignored).
- [ ] AC2 (FR-049): Given a search "42" or "APB-0042", when searched, then order 42 shows; a name search is case- and accent-insensitive.
- [ ] AC3 (FR-049): Given filters delivery + unpaid + a date, when applied, then only orders matching all three show; chips under the search show the active filters; Clear filters restores the tab default.
- [ ] AC4 (FR-049): Given a date range filter with `from` after `to`, when applied, then `VALIDATION_FAILED` shown on the field and the list is unchanged.
- [ ] AC5 (FR-049): Given no match, when searched, then "No orders match. Clear filters." shows; no "search all orders" offer is shown because search spans the active tab only (recorded open question).
- [ ] AC6 (FR-049): Given an empty query, when submitted, then the tab default shows; a query over 80 characters is rejected with `VALIDATION_FAILED`.
- [ ] AC7 (FR-049): Given search text with SQL or LIKE wildcards (`%`, `_`, `'`), when searched, then it is treated as literal text via parameterised queries and returns no error.
- [ ] AC8 (NFR-002, NFR-006): Given search and the filter sheet at 320 px and 375 px, 200% zoom and keyboard-only, when used, then the search input has a visible or `aria-label` label, the filter sheet traps focus and closes on Esc returning focus, chips have labels ("Remove filter: Delivery"), targets >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/orders.search.test.ts
- AC2 → src/app/routes/admin/orders.search.test.ts
- AC3 → src/app/routes/admin/orders.search.test.ts
- AC4 → src/app/routes/admin/orders.search.test.ts
- AC5 → src/app/routes/admin/orders.search.test.tsx
- AC6 → src/app/routes/admin/orders.search.test.ts
- AC7 → src/app/routes/admin/orders.search.test.ts
- AC8 → src/tests/e2e/admin-orders.spec.ts

## Notes
- Decision: search stays within the active tab (spec default); "search all orders" is an open ux-lead question, not built.
- Depends on S-111.

## Implementation notes (2026-11-13)
- AC4: a bad date range is not applied; the field message shows above the list and in the sheet, and the list stays as it was (no 400 for a filter).
- AC6: a query over 80 characters is reported on the search field and kept as typed; the list is the tab default.
- Filters sheet: delivery/pickup, paid/unpaid, from/until dates (`date` = one day); chips link to the list without that filter.
- Tests: `app/domain/order-search.test.ts`, `admin-order-list.server.test.ts` (wildcards literal), `orders-view.test.tsx`, `tests/e2e/admin-orders-list.spec.ts`.
