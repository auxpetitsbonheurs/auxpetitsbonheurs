# S-116: Approve or decline an order
Status: ready
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#api-contract
Estimate: 3 pts
Owner: remix-specialist, api-engineer, ui-engineer

## Story
As an admin, I want to approve or decline a pending order with an optional reason, so that the customer knows quickly whether the bakery can take it.

## Acceptance Criteria
- [ ] AC1 (FR-052): Given pending_approval, when Approve is pressed, then status is approved, an `approved` event stores the admin id, an "Order confirmed" email is queued in the order's locale, all in one transaction.
- [ ] AC2 (FR-052): Given pending_approval or quote_needed, when Decline is confirmed with a reason (<= 500 characters), then status is declined, the reason is stored and the "Order declined" email contains it; without a reason the email omits it.
- [ ] AC3 (FR-052): Given a reason over 500 characters, when posted, then `VALIDATION_FAILED` and nothing changes.
- [ ] AC4 (FR-052): Given an order in any other status, when approve or decline is posted, then `INVALID_TRANSITION` and no event or email.
- [ ] AC5 (FR-052, FR-054): Given a stale `version`, when posted, then `ORDER_CHANGED` and no change.
- [ ] AC6 (FR-052): Given the email transaction fails, when approving, then status, event and outbox roll back together; given the email provider is down after commit, then the action succeeds and the outbox retries.
- [ ] AC7 (FR-052): Given an unauthenticated or customer session, when the action is posted, then no change (redirect or `FORBIDDEN`).
- [ ] AC8 (FR-052): Given the Decline dialog, when opened, then it says "Decline this order? The customer will get an email." with an optional reason; copy exists in EN and FR.
- [ ] AC9 (NFR-002, NFR-006, NFR-013): Given the sticky action bar and dialog at 375x667, 320 px, 200% zoom and keyboard-only, when used, then Approve sits in the bottom half of the viewport, targets >= 44 px, the dialog traps focus and returns it, button names include the order ("Approve APB-0042"), the double tap is blocked while pending, contrast AA per `docs/design/tokens.json`.

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
- Email content/templates are E-10; this story queues outbox rows only. Depends on S-113, S-115.
