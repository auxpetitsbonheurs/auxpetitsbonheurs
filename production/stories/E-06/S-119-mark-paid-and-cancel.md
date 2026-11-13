# S-119: Mark paid or unpaid and cancel an order
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#transition-table-enforced-by-domainorderstatus-appendix-b-is-authoritative
Estimate: 3 pts
Owner: remix-specialist, api-engineer, ui-engineer

## Story
As an admin, I want to record that an order was paid and to cancel an order with a reason, so that money and status stay accurate.

## Acceptance Criteria
- [ ] AC1 (FR-052): Given any status, when Mark paid, then `paid=true`, `paid_at` and `paid_by` set, event `marked_paid`, no status change and no email; Mark unpaid reverses it with `marked_unpaid`.
- [ ] AC2 (FR-052): Given an approved order, when Cancel is confirmed with a reason (<= 500 characters), then status is cancelled, a `cancelled` event stores the admin and reason, and "Cancellation confirmed" is queued.
- [ ] AC3 (FR-052, FR-051): Given a quote_sent order, when an admin cancels, then the quote is withdrawn, the customer's accept link is refused with `INVALID_TRANSITION`, the tracking page shows cancelled, and the same email is queued (owner Q6).
- [ ] AC4 (FR-052): Given a Completed, cancelled, declined or closed order, when cancel is posted, then `INVALID_TRANSITION`.
- [ ] AC5 (FR-052): Given a paid order, when cancelled, then the paid flag stays and the log notes it (refund is off-system).
- [ ] AC6 (FR-052, FR-054): Given a stale `version`, when either action is posted, then `ORDER_CHANGED`.
- [ ] AC7 (FR-052): Given a customer or anonymous session, when posted, then no change.
- [ ] AC8 (FR-052): Given the Cancel dialog, when opened, then it says the customer will be emailed and the reason is optional (EN and FR).
- [ ] AC9 (NFR-002, NFR-006): Given the More actions sheet and Cancel dialog at 375x667, 320 px, 200% zoom and keyboard-only, when used, then the sheet items are buttons with distinct names, focus is trapped and restored, Esc closes, targets >= 44 px, destructive action not colour-only, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order.actions.test.ts
- AC2 → src/app/routes/admin/order.actions.test.ts
- AC3 → src/app/routes/admin/order.actions.test.ts
- AC4 → src/app/routes/admin/order.actions.test.ts
- AC5 → src/app/routes/admin/order.actions.test.ts
- AC6 → src/app/routes/admin/order.actions.test.ts
- AC7 → src/app/routes/admin/order.actions.test.ts
- AC8 → src/app/i18n/keys.test.ts
- AC9 → src/tests/e2e/admin-order-detail.spec.ts

## Notes
- Unpaid counts and sales (E-09) depend on the `paid` flag set here. Depends on S-115.

## Implementation notes (2026-11-13)
- Adjusted (Juice payment): Mark paid/unpaid is a flag for orders paid outside Juice and is refused while `awaiting_payment` (Payment received is the way there). AC5: a cancelled paid order keeps `paid` and now records `refund_due_rs` so Refunded and "Refunds to send" track the refund (instead of "off-system").
- Awaiting-payment orders are refused, not cancelled, by an admin.
