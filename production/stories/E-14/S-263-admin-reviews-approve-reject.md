# S-263: Admin: Reviews to approve with Approve and Reject
Status: ready
Epic: E-14-customer-reviews
Spec: docs/specs/features/bakery-reviews.md (to write) · Design: docs/design/design-system.md (Admin one-handed patterns, Tabs, Alert)
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, api-engineer, tailwind-shadcn-specialist

## Story
As the Owner or an Admin, I want a list of reviews waiting for approval with Approve and Reject, so that only reviews I am happy with appear on the site.

## Acceptance Criteria
- [ ] AC1 (FR-083): Given Owner or Admin, when I open More > Reviews (`/admin/reviews`), then tabs "To approve (n)", "Published", "Not published" (rejected and hidden, each with its status word) list reviews newest first with stars (as text "4 of 5" plus icons), display name, date and the full comment; rows are >= 64 px.
- [ ] AC2 (FR-083): Given a pending review, when I press Approve, then it becomes `approved` with `decided_by`/`decided_at`, an Undo toast shows for a few seconds, the count drops, and it appears publicly within 60 s.
- [ ] AC3 (FR-083): Given a pending review, when I press Reject, then a confirm dialog (focus trapped and returned) asks first, then it becomes `rejected`, is never public, and the customer sees "Not published" in their own form (S-262); no reason is sent.
- [ ] AC4 (FR-083): Given two admins act on the same review (the second sees it already decided), then `REVIEW_CHANGED` with "Someone already decided this review" and the list refreshes; nothing is double-applied.
- [ ] AC5 (FR-083): Given no pending reviews, then "Nothing to approve." shows; given the list fails to load, then an error state with Retry shows; given 20+ reviews, then a "Show more" button loads more.
- [ ] AC6 (FR-041, NFR-003): Given a customer, an anonymous visitor, then `/admin/reviews` redirects to sign-in and actions return `FORBIDDEN`/`UNAUTHENTICATED`; Admin and Owner both allowed; comments are shown escaped as plain text with line breaks.
- [ ] AC7 (FR-083, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then Approve and Reject are real buttons >= 44 px with distinct names including the reviewer ("Approve review by Anna K."), the destructive action is never next to the primary without spacing (8 px) and is not filled except in its dialog, tab counts are announced, AA contrast.
- [ ] AC8 (FR-083): Given Approve or Reject, then an activity-log entry records who decided and what (existing audit trail), without storing the comment text in the log.

## Tests
- AC1 → src/app/routes/admin/reviews.test.ts, src/tests/e2e/admin-reviews.spec.ts
- AC2 → src/app/server/services/review-decision.server.test.ts, src/tests/e2e/admin-reviews.spec.ts
- AC3 → src/app/server/services/review-decision.server.test.ts
- AC4 → src/app/server/services/review-decision.server.test.ts
- AC5 → src/app/routes/admin/reviews.test.ts
- AC6 → src/app/routes/admin/reviews.test.ts, src/app/routes/admin/route-guards.test.ts
- AC7 → src/tests/e2e/admin-reviews.spec.ts
- AC8 → src/app/server/services/review-decision.server.test.ts

## Notes
- Depends on: S-261, S-262, S-033 (frame, More). The "Reviews" row in More carries the count (S-264).
- Admin UI is EN-first; comments display in the language they were written (no translation).
