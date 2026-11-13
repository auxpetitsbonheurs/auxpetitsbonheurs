# S-115: Status transitions enforced on the server per Appendix B
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#transition-table-enforced-by-domainorderstatus-appendix-b-is-authoritative
Estimate: 3 pts
Owner: api-engineer, test-engineer

## Story
As the bakery owner, I want orders to move only along the allowed steps, so that no order is skipped, double-advanced or reopened by mistake.

## Acceptance Criteria
- [ ] AC1 (FR-051): Given the transition table (approve, decline, sendQuote, advance, revert, cancel, edit, setPaid), when every (status, action) pair is generated, then the server accepts exactly the listed pairs and rejects all others with `INVALID_TRANSITION` (table-driven test derived from PRD Appendix B).
- [ ] AC2 (FR-051): Given a Completed order, when `cancel` is posted, then `INVALID_TRANSITION`; given pending_approval, when `advance` is posted, then `INVALID_TRANSITION`.
- [ ] AC3 (FR-051): Given a pickup order in_preparation, when `advance`, then the target is ready_for_pickup; a delivery order gives out_for_delivery; ready or out then gives completed; the target is derived from status and fulfilment, never from input.
- [ ] AC4 (FR-051): Given revert, when applied, then in_preparation -> approved, ready/out -> in_preparation, completed -> ready/out by fulfilment; Back one step from approved is not offered (owner Q12).
- [ ] AC5 (FR-051): Given the loader, when `allowed` is computed, then it equals the table for that status and fulfilment (`approve`, `decline`, `sendQuote`, `advance`, `revert`, `cancel`, `edit`, `setPaid`, `saveNote`); `cancel` is true for pending_approval, quote_needed, quote_sent, approved, in_preparation, ready_for_pickup, out_for_delivery.
- [ ] AC6 (FR-051): Given setPaid, when applied in any status, then it is a flag change and never a transition.
- [ ] AC7 (FR-051): Given a customer-driven transition (quote accept/decline/expire, customer cancel), when evaluated, then the domain module exposes it to those routes without a second table.
- [ ] AC8 (FR-051): Given the table in code and in the PRD, when CI runs, then a test compares them so drift fails the build.

## Tests
- AC1 → src/app/domain/orderStatus.test.ts
- AC2 → src/app/domain/orderStatus.test.ts
- AC3 → src/app/domain/orderStatus.test.ts
- AC4 → src/app/domain/orderStatus.test.ts
- AC5 → src/app/domain/orderStatus.test.ts
- AC6 → src/app/domain/orderStatus.test.ts
- AC7 → src/app/domain/orderStatus.test.ts
- AC8 → src/app/domain/orderStatus.appendix-b.test.ts

## Notes
- No UI, no a11y ACs. Risk "transition table drift": tests are generated from Appendix B rows.
- E-01 has a minimal approve transition; this story replaces it with the full module (refactor, behaviour kept).

## Implementation notes (2026-11-13)
- Adjusted (2026-11-13, Juice payment): the table also holds markPaid/undoPaid and Refuse (`decline` from awaiting_payment, pending_approval, approved, in_preparation, the payment agent's model); a custom request is declined with the separate `declineRequest`. `domain/status` `transitionTarget` delegates to the table. Tests: `app/domain/order-transitions.test.ts`, `order-transitions.appendix-b.test.ts` (PRD Appendix B now lists the payment rows; `docs/product/prd.md` counts as code in CI).
