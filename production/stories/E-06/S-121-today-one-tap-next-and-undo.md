# S-121: One-tap next status on Today with Undo
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#flow
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, api-engineer

## Story
As an admin in the kitchen, I want to mark an order as the next status with one tap and undo a slip, so that I keep orders current without opening each one.

## Acceptance Criteria
- [ ] AC1 (FR-048, FR-052): Given an approved order today, when the next-status button is tapped, then status becomes in_preparation, an event stores the admin, and a toast "Marked In preparation" with Undo shows; no email is queued for that step.
- [ ] AC2 (FR-048): Given the toast, when Undo is tapped within 6 s, then status returns to approved with a `status_reverted` event and no email.
- [ ] AC3 (FR-048): Given a pending_approval or quote_needed order on Today, when the row renders, then there is no one-tap button and the row opens the detail.
- [ ] AC4 (FR-054): Given another admin advanced the order, when Undo or the tap is used with a stale version, then `ORDER_CHANGED`, the toast reads "Could not undo, the order changed." or the row refreshes, and nothing double-advances.
- [ ] AC5 (FR-048): Given a double tap, when the first request is pending, then the button is disabled and the second request carries the old version and is rejected.
- [ ] AC6 (FR-048): Given the forward tap on an order whose next step sends an email (ready, out, completed), when Undo is used, then the status reverts without a second email and the earlier email is not recalled (documented, no email on undo).
- [ ] AC7 (FR-048, NFR-002, NFR-006): Given the toast and rows at 375x667, 320 px, 200% zoom and keyboard-only, when used, then the Undo button is reachable by keyboard for the full 6 s and the timer extends while it is focused, the toast is `role=status`, the next-status button names the order and action ("Mark APB-0042 in preparation"), targets >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/today.actions.test.ts
- AC2 → src/app/routes/admin/today.actions.test.ts
- AC3 → src/app/routes/admin/today.test.tsx
- AC4 → src/app/routes/admin/today.actions.test.ts
- AC5 → src/app/routes/admin/today.actions.test.ts
- AC6 → src/app/routes/admin/today.actions.test.ts
- AC7 → src/tests/e2e/admin-today.spec.ts

## Notes
- Reuses `advance` and `revert` from S-117. Depends on S-120.
- AC6 records a known limitation: an undone forward step that emailed the customer cannot unsend it; E-10 owns email copy and any "ignore if undone" wording.

## Implementation notes (2026-11-13)
- Undo toast: 6 s, paused while focused or hovered, `role=status`; Undo sends `revert` with the version after the forward step. A refused tap says "{number} changed meanwhile" and refreshes the list.
- Tests: `app/routes/admin/today.test.ts`, `tests/e2e/admin-today.spec.ts`.
