# S-157: Admin declines a custom request
Status: ready
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#api-contract
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want to decline a request that we cannot make, with an optional reason, so that the customer gets a polite answer and a link to the menu.

## Acceptance Criteria
- [ ] AC1 (FR-030): Given Quote needed, when I decline with a reason, then status is Declined, an event is logged, and "Request declined" is queued including the reason and a menu link.
- [ ] AC2 (FR-030): Given no reason, then it still declines and the email omits the reason line.
- [ ] AC3 (FR-030): Given a reason over 500 characters, then `VALIDATION_FAILED` and nothing changes.
- [ ] AC4 (FR-030): Given the status is not Quote needed (Approved, Closed), when `decline` is called, then `INVALID_TRANSITION`; given a stale `version`, then `ORDER_CHANGED` with Reload.
- [ ] AC5 (FR-030, FR-041): Given a customer or anonymous session, then `decline` is refused; Admin and Owner may decline.
- [ ] AC6 (NFR-002, NFR-006): Given the Decline action, then it opens a confirm dialog (focus trapped and restored, labelled reason textarea with counter, default focus on Cancel), 44 px targets, AA contrast per `docs/design/tokens.json`, fitting 320/375 px at 200% zoom.

## Tests
- AC1 → src/app/routes/admin.orders.$id.test.tsx
- AC2 → src/app/routes/admin.orders.$id.test.tsx
- AC3 → src/app/routes/admin.orders.$id.test.tsx
- AC4 → src/app/domain/order-transitions.test.ts
- AC5 → src/app/routes/admin.orders.$id.test.tsx
- AC6 → src/tests/e2e/admin-request.a11y.spec.ts

## Notes
- Depends on S-155, E-06 (shared `decline` action may already exist for manual-review orders; reuse, and only add Quote needed coverage if so), E-10 email.
