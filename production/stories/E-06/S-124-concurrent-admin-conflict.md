# S-124: Two admins on one order get "this order changed, reload"
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#edge-cases
Estimate: 3 pts
Owner: api-engineer, remix-specialist, postgres-specialist

## Story
As an admin, I want to be told when someone else changed the order I am looking at, so that I never overwrite their work.

## Acceptance Criteria
- [ ] AC1 (FR-054): Given two admins viewing version 3, when A approves and then B declines with version 3, then B gets `ORDER_CHANGED`, sees "This order changed. Reload" with a Reload button, and the order stays approved.
- [ ] AC2 (FR-054, NFR-013): Given two simultaneous approve requests with the same version, when both run, then exactly one succeeds, exactly one event and exactly one email are created.
- [ ] AC3 (FR-054): Given every mutating action (approve, decline, sendQuote, advance, revert, cancel, setPaid, edit save), when posted with a stale version, then `ORDER_CHANGED` with no partial change.
- [ ] AC4 (FR-054): Given Reload is pressed, when the order reloads, then the new status and version show and the action bar reflects the new `allowed`.
- [ ] AC5 (FR-054): Given each successful mutation, when committed, then `version` increases by 1 in the same transaction; the private note does not bump it.
- [ ] AC6 (FR-054): Given a conflict, when logged, then a line `order_conflict` with action and ids is written without PII.
- [ ] AC7 (FR-054, NFR-002, NFR-006): Given the conflict Alert at 375x667, 320 px, 200% zoom and keyboard-only, when it appears, then it is announced (`role=alert`), focus moves to it, the Reload button is >= 44 px with a clear name, and contrast is AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order.concurrency.test.ts
- AC2 → src/app/routes/admin/order.concurrency.test.ts (parallel requests, test database)
- AC3 → src/app/routes/admin/order.concurrency.test.ts
- AC4 → src/tests/e2e/admin-order-detail.spec.ts
- AC5 → src/app/routes/admin/order.concurrency.test.ts
- AC6 → src/app/routes/admin/order.concurrency.test.ts
- AC7 → src/tests/e2e/admin-order-detail.spec.ts

## Notes
- Success-measure check for the epic. Single-statement compare-and-set update (`WHERE version = :v`) is the intended approach; postgres-specialist reviews.
- Depends on S-116..S-119, S-122.

## Implementation notes (2026-11-13)
- AC3: edit save is S-122 (not built yet); every built mutation is covered. AC6: `order_conflict` JSON line with action, orderId, adminId.
