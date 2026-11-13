# S-159: Customer declines a quote
Status: done
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#api-contract
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As a customer who does not want the quoted price, I want to decline the quote, so that the bakery knows and the request closes.

## Acceptance Criteria
- [x] AC1 (FR-031): Given Quote sent, when I confirm Decline, then status is Closed, "Quote closed" is queued, and admins get a push and email.
- [x] AC2 (FR-031): Given I tap Decline, then a confirm dialog asks first; cancelling the dialog changes nothing.
- [x] AC3 (FR-031): Given the status is Approved, Closed or Cancelled, when `declineQuote` is called, then `INVALID_TRANSITION`; given a stale `version`, then `ORDER_CHANGED`.
- [x] AC4 (FR-031): Given an expired quote not yet closed by the job, when I decline, then it closes (decline is allowed) without a second email from the job later.
- [x] AC5 (FR-031): Given an admin with push off, then they receive no push for it (FR-046) but still get the email if enabled.
- [x] AC6 (NFR-002, NFR-006): Given the dialog, then it traps and restores focus, default focus is on Cancel, buttons are 44 px with AA contrast per `docs/design/tokens.json`, and it fits 320/375 px at 200% zoom with wrapped French text.

## Tests
- AC1 → src/app/routes/t.$token.test.tsx
- AC2 → src/tests/e2e/custom-request.spec.ts
- AC3 → src/app/routes/t.$token.test.tsx
- AC4 → src/app/routes/t.$token.test.tsx
- AC5 → src/app/routes/t.$token.test.tsx
- AC6 → src/tests/e2e/custom-request.a11y.spec.ts

## Notes
- Depends on S-156, S-158 (tracking panel). AC5 cites FR-046 (admin alert preferences, E-02/E-10).
- Decision: AC4 allows decline after expiry; spec is silent. Harmless and consistent with the Closed end state; flag to product-director if undesired.

## Build notes (2026-11-13, E-08 slice 2)
- The dialog is the shared Modal (native dialog): default focus on "Keep the quote"; without JavaScript the Decline button posts at once.
- AC5: admin alert preferences (FR-046) apply to the email alert (`alert_email`); push is E-10.
