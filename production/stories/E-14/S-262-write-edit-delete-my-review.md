# S-262: Write, edit and delete my review
Status: review
Epic: E-14-customer-reviews
Spec: docs/specs/features/bakery-reviews.md (to write) · Auth: E-11 S-207
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist, api-engineer, auth-specialist

## Story
As a signed-in customer, I want to rate the bakery and write a comment, change it later or delete it, so that I can share my experience and stay in control of my words.

## Acceptance Criteria
- [ ] AC1 (FR-082): Given I am not signed in, when I open `/reviews/write` (and `/fr/reviews/write`), then I see "Sign in to leave a review" with Sign in and Create account buttons that return me to the form after sign-in (same-site `next` only), and no form.
- [ ] AC2 (FR-082): Given I am signed in with no review, then the form has a star rating (radio group with 5 options named "1 star" to "5 stars", operable by keyboard and tap, 44 px targets), a comment textarea with label and live character count (max 1000), and a Send button; stars are never the only cue (selected value also shown as text "4 of 5").
- [ ] AC3 (FR-082): Given I send a rating and a comment, then the review is saved as `pending`, the page says "Thank you. Your review will appear after we approve it." and shows my review with the status "Waiting for approval", and focus moves to that status message.
- [ ] AC4 (FR-082): Given no star chosen or an empty comment, then inline errors with a summary link to the fields show (focus on the summary); given 1001 characters, then the 1001st is refused client-side and server-side `VALIDATION_FAILED`.
- [ ] AC5 (FR-082): Given I already have a review, then `/reviews/write` shows it for editing with its status ("Waiting for approval", "Published", "Not published"); when I save a change to a published or rejected review, then it returns to `pending`, I am told "It will appear again after we approve it", and it is no longer on the public site until approved.
- [ ] AC6 (FR-082): Given my profile has no name, then the form first asks for my first and last name (saved to my profile) before sending; the display name shown later is first name and last initial.
- [ ] AC7 (FR-082, NFR-003): Given HTML such as `<b>x</b>` in the comment, then it is stored as text and shown escaped everywhere; given a duplicate submit (double tap), then only one review exists (idempotent upsert on my account).
- [ ] AC8 (FR-082, NFR-003): Given 5 posts or edits within an hour, then the next returns `RATE_LIMITED` with a friendly wait message and `Retry-After` (S-023 helper); given an admin session or a signed-out session calling the action, then `FORBIDDEN` or `UNAUTHENTICATED` and nothing is written.
- [ ] AC9 (FR-086): Given my review, when I press "Delete my review" and confirm in a dialog (focus trapped and returned), then it is deleted from the database, disappears from the site, and I see the empty form again with "Your review was deleted".
- [ ] AC10 (FR-082, NFR-002, NFR-006, NFR-007): Given 320 px, 375 px, 200% zoom and keyboard only, then all controls reach in order with visible focus, nothing clips, no horizontal scroll, AA contrast; every label, error and message exists in EN and FR; an action error keeps what I typed.

## Tests
- AC1 → src/app/routes/site/review-write.test.tsx, src/tests/e2e/reviews.spec.ts
- AC2 → src/app/routes/site/review-write.test.tsx
- AC3 → src/app/server/services/review.server.test.ts, src/tests/e2e/reviews.spec.ts
- AC4 → src/app/server/services/review.server.test.ts, src/app/routes/site/review-write.test.tsx
- AC5 → src/app/server/services/review.server.test.ts
- AC6 → src/app/routes/site/review-write.test.tsx
- AC7 → src/app/server/services/review.server.test.ts
- AC8 → src/app/server/services/review.server.test.ts
- AC9 → src/app/server/services/review.server.test.ts, src/tests/e2e/reviews.spec.ts
- AC10 → src/tests/e2e/reviews.spec.ts (axe, 320/375, 200%, fr)

## Notes
- Where the entry points are: a "Write a review" button on the Reviews page (S-267) and in the Home section (S-266); it is not in the main navigation.
- Depends on: S-261, E-11 S-206/S-207/S-210, S-023.
- Open question: display name snapshot vs live (epic Q1); this story snapshots at each save.

## Build notes (2026-11-13)
- AC2: the stars are a fieldset (legend "Your rating") of five native radios inside 44 px labels, so arrow keys and Space work natively; the chosen value is also written ("4 of 5").
- AC8: an admin session gets FORBIDDEN (403), signed out UNAUTHENTICATED (401).
- Tests: src/app/server/services/reviews.server.test.ts, src/app/routes/site/reviews.test.ts, src/tests/e2e/reviews.spec.ts.
