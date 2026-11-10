# S-134: Manual order warnings and relaxed availability rules
Status: ready
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-manual-orders.md#ux
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, test-engineer, accessibility-specialist

## Story
As an admin, I want to save an order on a blocked, too-soon or past date or with a sold-out product while seeing a clear warning, so that I can record what the customer and I agreed without the website rules stopping me.

## Acceptance Criteria
- [ ] AC1 (FR-056): Given a blocked date or closed weekday, when selected, then the warning "This day is blocked" shows and Save still succeeds; existing orders on that day are unaffected.
- [ ] AC2 (FR-056): Given a date earlier than the notice days for any item, then "Needs 3 days' notice, earliest is Fri 13 Dec" shows (notice = largest per-item notice, owner Q21) and Save succeeds.
- [ ] AC3 (FR-056): Given a date both blocked and too soon, then both warnings show and Save succeeds.
- [ ] AC4 (FR-056, FR-055): Given yesterday's date, when saved, then the order saves, a "past date" warning shows, notice/closed/blocked warnings are not raised, no `DATE_UNAVAILABLE` occurs, and the order counts in sales for that date.
- [ ] AC5 (FR-056): Given a sold-out product line, then "Sold out: customers cannot order this, you are adding it anyway" shows on the line and Save succeeds with warning `sold_out`; given a customer basket with the same product, then `PRODUCT_UNAVAILABLE` (customers remain blocked).
- [ ] AC6 (FR-056): Given the date picker, then any day within 365 days ahead and any past day is selectable, with blocked/closed/too-soon days hinted; given a date beyond 365 days or an invalid calendar date, then `VALIDATION_FAILED` on date.
- [ ] AC7 (FR-056): Given the order saved with warnings, then `create` returns the flash `warnings[]` (`blocked`, `too_soon`, `past_date`, `sold_out`) and the log line `manual_order_created` lists them without PII.
- [ ] AC8 (FR-041): Given a customer session, then the relaxed rules are unavailable (`create` refused); Admin and Owner both succeed.
- [ ] AC9 (NFR-002): Given a warning appears, then it uses text plus an icon (never colour alone), is announced via `role=status`/`alert`, sits above the sticky bar, and Save remains focusable; the date picker is keyboard-operable (arrows, PageUp/Down) with a labelled input and AA contrast per `docs/design/tokens.json`.
- [ ] AC10 (NFR-006, NFR-008): Given 320/375 px width and 200% zoom, then warnings wrap without horizontal scroll, targets are 44 px, and "today" and dates follow Mauritius time (UTC+4).

## Tests
- AC1 → src/app/routes/admin.orders.new.test.tsx
- AC2 → src/app/domain/availability.test.ts
- AC3 → src/app/routes/admin.orders.new.test.tsx
- AC4 → src/app/routes/admin.orders.new.test.tsx
- AC5 → src/app/routes/admin.orders.new.test.tsx
- AC6 → src/app/domain/availability.test.ts
- AC7 → src/app/routes/admin.orders.new.test.tsx
- AC8 → src/app/routes/admin.orders.new.test.tsx
- AC9 → src/tests/e2e/admin-manual-order.a11y.spec.ts
- AC10 → src/tests/e2e/admin-manual-order.a11y.spec.ts

## Notes
- Depends on S-131; consumes E-05 availability domain (`DayStatus`) and E-03 sold-out flag. Owner decisions Q8, Q9, Q21 applied.
- Edits (admin-orders spec, E-06) reuse the same warning component; keep it shared.
