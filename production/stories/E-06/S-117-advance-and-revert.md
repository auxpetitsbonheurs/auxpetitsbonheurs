# S-117: Move an order forward or back one step
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#transition-table-enforced-by-domainorderstatus-appendix-b-is-authoritative
Estimate: 3 pts
Owner: remix-specialist, api-engineer

## Story
As an admin, I want to move an order to its next status, or back one step if I tapped too soon, so that customers get the right emails and the board stays accurate.

## Acceptance Criteria
- [ ] AC1 (FR-052): Given an approved order, when Next status, then in_preparation with no email.
- [ ] AC2 (FR-052): Given a pickup order in_preparation, when Next, then ready_for_pickup and a "Ready" email; a delivery order gives out_for_delivery and "On the way".
- [ ] AC3 (FR-052): Given ready_for_pickup or out_for_delivery, when Next, then completed and a "Thank you" email.
- [ ] AC4 (FR-052): Given in_preparation, ready or out, or completed, when Back one step, then the previous status per fulfilment and no email; a `status_reverted` event is stored.
- [ ] AC5 (FR-052): Given an approved order, when Back is requested, then `INVALID_TRANSITION` (not offered, owner Q12); the button is absent.
- [ ] AC6 (FR-052, FR-054): Given a stale `version` or a repeated identical `advance` after the first succeeded, when posted, then `ORDER_CHANGED` and the order never double-advances.
- [ ] AC7 (FR-052): Given any advance or revert, when committed, then exactly one `order_event` with actor admin id, from/to status and timestamp is stored in the same transaction as the status and outbox row.
- [ ] AC8 (FR-052): Given the primary button label, when rendered, then it names the next status ("Mark ready for pickup", "Mark out for delivery", "Mark completed") from `allowed.advance` and is hidden when null.
- [ ] AC9 (NFR-002, NFR-006): Given the action bar at 375x667, 320 px, 200% zoom and keyboard-only, when used, then the primary action is in the bottom half, >= 44 px, disabled while pending with `aria-busy`, a toast `role=status` announces the result, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order.actions.test.ts
- AC2 → src/app/routes/admin/order.actions.test.ts
- AC3 → src/app/routes/admin/order.actions.test.ts
- AC4 → src/app/routes/admin/order.actions.test.ts
- AC5 → src/app/routes/admin/order.actions.test.ts
- AC6 → src/app/routes/admin/order.actions.test.ts
- AC7 → src/app/routes/admin/order.actions.test.ts
- AC8 → src/app/routes/admin/order.test.tsx
- AC9 → src/tests/e2e/admin-order-detail.spec.ts

## Notes
- Depends on S-115, S-116 (action bar). Emails content E-10.

## Implementation notes (2026-11-13)
- AC9: the result is announced by the bar's focused `role=status` line rather than a floating toast (matches S-017 and the Juice payment screen).
