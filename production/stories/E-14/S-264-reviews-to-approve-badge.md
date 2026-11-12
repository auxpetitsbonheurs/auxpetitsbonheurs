# S-264: Reviews to approve count badge
Status: ready
Epic: E-14-customer-reviews
Spec: docs/specs/features/admin-access-team.md (badges) · Pattern: E-02 S-034 (`badges: { toReview }` in the `admin/layout` loader, contracts.md v0.14)
Estimate: 2 pts
Owner: remix-specialist, ui-engineer

## Story
As the Owner or an Admin, I want to see how many reviews are waiting for me, so that I do not leave customers' reviews unanswered.

## Acceptance Criteria
- [ ] AC1 (FR-083): Given 3 pending reviews, when any admin page loads, then the `admin/layout` loader returns `badges.reviewsToApprove = 3` (uncapped; the "9+" cap is a view concern) from one indexed count, and contracts.md records the field (lead-backend + lead-frontend).
- [ ] AC2 (FR-083): Given the count is above 0, then the More item in the bottom bar shows a count dot with accessible text "3 reviews to approve", and the Reviews row inside More shows the number "Reviews (3)"; given 0, then no dot and no number.
- [ ] AC3 (FR-083): Given I approve or reject one, then the badge drops after the action without a manual reload (default revalidation).
- [ ] AC4 (FR-083): Given more than 9, then the dot shows "9+" and the accessible text still gives the real number.
- [ ] AC5 (FR-083, NFR-002): Given the badge, then it is never colour-only (number or dot plus text), contrast meets AA, bottom bar labels do not truncate at 320 px, and the Orders dot is unchanged.
- [ ] AC6 (FR-041): Given a customer or anonymous request, then no badge data is returned (the layout loader is guarded).

## Tests
- AC1 → src/app/routes/admin/layout.test.ts
- AC2 → src/app/components/admin/bottom-bar.test.tsx
- AC3 → src/tests/e2e/admin-reviews.spec.ts
- AC4 → src/app/components/admin/bottom-bar.test.tsx
- AC5 → src/tests/e2e/admin-reviews.spec.ts
- AC6 → src/app/routes/admin/route-guards.test.ts

## Notes
- Cost: one more indexed count per admin page load; watch against the worker CPU check (T3). Combine with the existing `toReview` count in one query if cheap.
- Depends on: S-261, S-263, S-034.
