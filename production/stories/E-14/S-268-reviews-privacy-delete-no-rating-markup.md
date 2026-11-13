# S-268: Reviews privacy: delete, account deletion, no rating markup
Status: review
Epic: E-14-customer-reviews
Spec: docs/product/prd.md NFR-004 (privacy), FR-086 · Legal: Mauritius Data Protection Act 2017 (`[TO CONFIRM]`, PRD question 12)
Estimate: 2 pts
Owner: security-lead, remix-specialist, copywriter, api-engineer

## Story
As a customer, I want to know what is shown about me in a review and be able to remove it, so that I stay in control of my personal data.

## Acceptance Criteria
- [ ] AC1 (FR-086): Given the review form and the Reviews page, then a short note (EN/FR, copywriter) states what is shown (first name, last initial, date, your words), that the bakery approves reviews first, and that you can delete your review at any time, with a link to the privacy note.
- [ ] AC2 (FR-086): Given a customer deletes their account (E-11) or their account is removed on request, then their review is deleted in the same transaction (cascade) and is gone from Home, `/reviews` and caches within 60 s.
- [ ] AC3 (FR-086, NFR-004): Given the review table and the logs, then the review row holds no email, phone, address or order id, and server logs for review actions carry the account id and action only, never the comment or name.
- [ ] AC4 (FR-086): Given the privacy note in Settings (S-059), then it includes a reviews line (what is collected, why, shown publicly in part, deletion); a missing line produces the same non-blocking warning pattern as S-059 AC4.
- [ ] AC5 (FR-086, FR-085): Given the public pages and sitemap, then no `Review` or `AggregateRating` structured data is emitted (guard test), so no personal name goes into search results as structured data.
- [ ] AC6 (FR-086): Given a customer asks the bakery by WhatsApp to remove their review, then an Admin can delete it from the Reviews screen (Delete in the Not published tab, with confirm); the deletion is final and logged without the comment text.

## Tests
- AC1 → src/app/routes/site/review-write.test.tsx
- AC2 → src/tests/db/review-cascade.test.ts, src/app/server/services/review.server.test.ts
- AC3 → src/app/server/services/review.server.test.ts (log assertion), src/tests/db/review-migration.test.ts
- AC4 → src/app/domain/settings.test.ts
- AC5 → src/app/routes/site/seo-pages.test.ts
- AC6 → src/app/server/services/review-decision.server.test.ts

## Notes
- Open: retention period and controller (PRD Q12). This story implements deletion on request and account removal only.
- Depends on: S-261, S-262, S-263, E-11 account deletion (S-210 or later; if no account deletion exists yet, AC2 is tested at the database cascade level and a follow-up is noted in E-11).

## Build notes (2026-11-13)
- Done: AC1 note on the form (the link to the privacy note waits for a public privacy page, none exists yet), AC2 at database level (customer row delete cascades; there is no customer self-deletion in v1, follow-up for E-11), AC3, AC5, AC6.
- AC4 built: saving Settings warns (non-blocking, like S-059 AC4) when the privacy note does not mention reviews ("review" / "avis"). The Owner still has to add the line to the privacy note text (handover: Settings > Privacy note). Tests: src/app/domain/settings.test.ts.
