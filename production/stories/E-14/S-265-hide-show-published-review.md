# S-265: Hide and show a published review
Status: review
Epic: E-14-customer-reviews
Spec: docs/specs/features/bakery-reviews.md (to write)
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, api-engineer

## Story
As the Owner or an Admin, I want to hide a review I already approved, and show it again if I change my mind, so that I can remove a review that turns out to be wrong without deleting the customer's words.

## Acceptance Criteria
- [ ] AC1 (FR-084): Given a published review, when I press Hide in the Published tab and confirm in a dialog, then it becomes `hidden`, disappears from Home and `/reviews` within 60 s, the average and count are recalculated without it, and it moves to the "Not published" tab labelled "Hidden".
- [ ] AC2 (FR-084): Given a hidden review, when I press Show, then it becomes `approved` again, an Undo is not needed, and it returns publicly within 60 s.
- [ ] AC3 (FR-084): Given the customer edits a hidden review, then it becomes `pending` (not public) and needs approval again; given the customer deletes it, then it is removed (S-262).
- [ ] AC4 (FR-084): Given the customer opens their own review while it is hidden, then the status reads "Not published" (the same word as rejected; the reason "hidden by us" is not revealed).
- [ ] AC5 (FR-084): Given two admins act at once, then the second gets `REVIEW_CHANGED` and a refresh; given the last published review is hidden, then Home omits the Reviews section.
- [ ] AC6 (FR-041, NFR-002): Given customer or anonymous requests, then `FORBIDDEN`/`UNAUTHENTICATED`; given 320 px, 375 px, 200% zoom and keyboard only, then Hide and Show buttons are >= 44 px with the reviewer in their names, AA contrast, no horizontal scroll.
- [ ] AC7 (FR-084): Given Hide or Show, then an activity-log entry records who and when (no comment text).

## Tests
- AC1 → src/app/server/services/review-decision.server.test.ts, src/tests/e2e/admin-reviews.spec.ts
- AC2 → src/app/server/services/review-decision.server.test.ts
- AC3 → src/app/server/services/review.server.test.ts
- AC4 → src/app/routes/site/review-write.test.tsx
- AC5 → src/app/server/services/review-decision.server.test.ts, src/app/routes/home.test.tsx
- AC6 → src/app/routes/admin/reviews.test.ts, src/tests/e2e/admin-reviews.spec.ts
- AC7 → src/app/server/services/review-decision.server.test.ts

## Notes
- Depends on: S-263.

## Build notes (2026-11-13)
- Tests: src/app/server/services/reviews.server.test.ts (moves, REVIEW_CHANGED, events), src/tests/e2e/reviews.spec.ts (hide in the journey).
