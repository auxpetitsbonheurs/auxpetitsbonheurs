# S-122: Edit an order with recalculated total or manual override
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#flow
Estimate: 5 pts
Owner: remix-specialist, api-engineer, ui-engineer

## Story
As an admin, I want to change an order's items, date, window, fulfilment or contact and have the total recalculated or set by hand, so that I can correct orders after the customer calls.

## Acceptance Criteria
- [ ] AC1 (FR-053): Given an order not completed or terminal, when `/admin/orders/:id/edit` loads, then all fields are prefilled (items, date, window, fulfilment, address, fee, contact) with a live recalculated total.
- [ ] AC2 (FR-053): Given an item quantity changed from 1 to 2, when saved, then `items_total` and `total_rs` are recalculated on the server and an `edited` event stores before/after values.
- [ ] AC3 (FR-053): Given "Set total by hand" Rs 5,000, when saved, then `total_rs` = 5,000, `total_overridden` = true and the detail shows "Total set by hand"; later item edits keep the override until it is switched off (null clears it).
- [ ] AC4 (FR-053): Given fulfilment changed from delivery to pickup, when saved, then the fee becomes 0 and the address is cleared; given pickup to delivery without an address, then `VALIDATION_FAILED`.
- [ ] AC5 (FR-053): Given free-text lines and catalogue lines, when saved, then both are accepted; a free-text line with price over Rs 1,000,000 or quantity over 50 is rejected.
- [ ] AC6 (FR-053): Given a Completed order, when the edit screen is opened or `save` posted, then the screen is unavailable and the server refuses with `INVALID_TRANSITION`; Back one step first.
- [ ] AC7 (FR-053): Given a hidden catalogue product, when posted, then `PRODUCT_UNAVAILABLE`; sold-out items are accepted for admins with the existing snapshot rules.
- [ ] AC8 (FR-053): Given an edit that changes only notes or the window, when saved, then the order is updated with an event and nothing else changes.
- [ ] AC9 (FR-053, FR-054): Given a stale `version` (including a customer cancel while the admin edits), when saved, then `ORDER_CHANGED` and the typed edits are not lost from the screen.
- [ ] AC10 (FR-053, FR-011): Given the edit total shown in the form, when saved, then the stored total equals the server calculation (client price never trusted).
- [ ] AC11 (NFR-002, NFR-006): Given the edit form at 320 px and 375 px, 200% zoom and keyboard-only, when used, then every field has a visible label, errors are in a summary with links and focus, the "Set total by hand" switch is labelled with its state, Stepper buttons have distinct names ("Increase quantity of <item>"), targets >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order-edit.test.tsx
- AC2 → src/app/routes/admin/order-edit.test.ts
- AC3 → src/app/routes/admin/order-edit.test.ts
- AC4 → src/app/routes/admin/order-edit.test.ts
- AC5 → src/app/routes/admin/order-edit.test.ts
- AC6 → src/app/routes/admin/order-edit.test.ts
- AC7 → src/app/routes/admin/order-edit.test.ts
- AC8 → src/app/routes/admin/order-edit.test.ts
- AC9 → src/app/routes/admin/order-edit.test.ts
- AC10 → src/app/routes/admin/order-edit.test.ts
- AC11 → src/tests/e2e/admin-order-edit.spec.ts

## Notes
- The item/contact form fields are shared with Manual order (E-07, FR-055); whoever lands first builds the shared form component and the other reuses it (cross-epic dependency noted).
- Depends on S-081 (pricing), S-113, S-115. Worker CPU: reuses S-097 measurements.

## Implementation notes (2026-11-14)
- Built: `/admin/orders/:id/edit` with the shared form (`app/components/admin/order-form/`, made for E-07's manual order: `OrderForm`, `LinesEditor`, product and free-text sheets, `model.ts` payload and live total), `app/server/services/edit-order.server.ts`, contract `app/server/contracts/order-edit.ts`.
- Adjusted: `AdminLine` gains a kept line `{ itemId, quantity }`, so an existing item keeps its ordered price (FR-017) instead of being repriced; new catalogue lines are priced now. The form posts one JSON `payload` field (the line list is nested); the edit needs JavaScript (admin app).
- AC7: sold-out products are accepted; hidden ones are PRODUCT_UNAVAILABLE naming the product. AC9: the state lives in the page, so a refused save keeps every typed change.
- Tests: `app/domain/order-edit.test.ts`, `app/components/admin/order-form/model.test.ts`, `app/server/services/edit-order.server.test.ts`, `app/routes/admin/order-edit.test.ts`, `tests/e2e/admin-order-edit.spec.ts`.
