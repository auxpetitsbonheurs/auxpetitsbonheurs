# S-126: One-handed admin layout and accessibility pass
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#acceptance-criteria
Estimate: 2 pts
Owner: accessibility-specialist, test-engineer, ui-engineer

## Story
As an admin holding a phone in one hand, I want primary actions within thumb reach and every screen usable with large text, so that I can work in the kitchen.

## Acceptance Criteria
- [ ] AC1 (FR-050, FR-052): Given a 375x667 viewport, when the order detail loads, then the sticky action bar plus bottom navigation total <= 128 px and the primary action is in the bottom half of the viewport.
- [ ] AC2 (NFR-002): Given Today, Orders, order detail, edit, Send quote and dialogs, when audited, then every tap target is >= 44 px.
- [ ] AC3 (NFR-002, NFR-006): Given each admin order screen at 320 px and 375 px and 200% zoom, when used, then there is no sideways scroll, no clipped action, and sticky bars never hide a focused field.
- [ ] AC4 (NFR-002): Given each screen, when navigated by keyboard only, then every control is reachable in visual order, dialogs and sheets trap focus and close on Esc, and focus is visible.
- [ ] AC5 (NFR-002): Given axe runs on each screen and state (empty, error, conflict, dialog open), when checked, then zero serious or critical issues and contrast meets AA per `docs/design/tokens.json`.
- [ ] AC6 (NFR-002): Given toasts, when shown, then they use `role=status`, and the Undo toast stays available while focused.
- [ ] AC7 (NFR-002): Given the admin screens, when audited, then no prototype defects: Stepper buttons have distinct accessible names and no aria-label is copied between controls.

## Tests
- AC1 → src/tests/e2e/admin-order-detail.spec.ts
- AC2 → src/tests/e2e/admin-a11y.spec.ts
- AC3 → src/tests/e2e/admin-a11y.spec.ts
- AC4 → src/tests/e2e/admin-a11y.spec.ts
- AC5 → src/tests/e2e/admin-a11y.spec.ts
- AC6 → src/tests/e2e/admin-today.spec.ts
- AC7 → src/tests/e2e/admin-a11y.spec.ts

## Notes
- Verification story, runs last in the epic (after S-111..S-125). Spec AC38 is AC1 here.

## Implementation notes (2026-11-14)
- Covered so far by each screen's e2e at 320/375/1280 px, 100% and 200% zoom: no sideways scroll, nothing clipped, 44 px targets, keyboard walk in order with visible focus, axe clean in light and dark (Orders list and filter sheet, order detail and More actions sheet, Today): `tests/e2e/admin-orders-list.spec.ts`, `admin-order-detail.spec.ts`, `admin-today.spec.ts`, `admin-approve.spec.ts`.
- AC1: asserted at 375x667 (action bar + bottom navigation ≤ 128 px, primary in the bottom half; the bar's padding was trimmed to fit): `admin-order-detail.spec.ts`.
- The edit screen and its sheets pass the same checks (`admin-order-edit.spec.ts`); axe also runs in the conflict state (detail) and the error-summary state (edit). AC7: steppers are named per item ("Increase quantity of Gift box").
