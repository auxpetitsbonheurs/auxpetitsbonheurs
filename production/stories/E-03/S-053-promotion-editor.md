# S-053: Create and edit a promotion with discounts
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#promotions
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist, api-engineer

## Story
As a bakery admin, I want to set up a promotion with a banner and discounted products and choose when it runs, so that I can run an offer without help.

## Acceptance Criteria
- [ ] AC1 (FR-063): Given a title EN, optional FR, text, start and end (Mauritius date and time), placement (banner, card or both), a link (none, product, category or custom form) and active on, when I save, then the promotion exists and I return to the list with the toast "Promotion saved".
- [ ] AC2 (FR-063): Given the end is at or before the start, then `VALIDATION_FAILED` on the dates and nothing is saved.
- [ ] AC3 (FR-063): Given a discounted product with percent 15 or a fixed sale price, then the editor shows the resulting price for that product; percent must be 1 to 99; a sale price at or above the base price saves with a warning, not an error.
- [ ] AC4 (FR-063): Given the same product added twice, or percent 0 or 100, or a missing value, then `VALIDATION_FAILED` and nothing is saved.
- [ ] AC5 (FR-063, FR-017): Given a product already in another live or scheduled promotion, then a note reminds "The lowest price applies, offers do not add up"; saving is allowed.
- [ ] AC6 (FR-063): Given a start in the past, then it saves and is Live at once; given an end in the past, then it saves as Ended.
- [ ] AC7 (FR-063): Given placement banner, link to product X and 15% on X, then the stored link and discount match and the data needed for the banner link and struck price on X is returned by the promotion query (display is E-04).
- [ ] AC8 (FR-063): Given an optional image, then it uses the same compression and upload rules as product photos (S-047); a non-image or over-limit file is rejected with a plain message and `UPLOAD_REJECTED` on the server.
- [ ] AC9 (FR-063): Given no discounted products, then the table shows "None, banner/card only" and saving is allowed.
- [ ] AC10 (FR-041): Given an Admin or Owner, then they can save; given a customer or anonymous visitor, then redirect or refusal.
- [ ] AC11 (NFR-002): Given the editor at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC12 (NFR-002): Given the form, then every field has a visible label, date and time fields show a text format hint, the discount table rows have distinct names ("Percent off for Chocolate cake"), errors are linked and focus the summary, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/save-promotion.server.test.ts and src/tests/e2e/admin-promotions.spec.ts
- AC2 → src/app/server/services/save-promotion.server.test.ts
- AC3 → src/app/domain/promotions.test.ts and src/app/server/services/save-promotion.server.test.ts
- AC4 → src/app/server/services/save-promotion.server.test.ts
- AC5 → src/tests/e2e/admin-promotions.spec.ts
- AC6 → src/app/server/services/save-promotion.server.test.ts
- AC7 → src/app/server/repos/promotions.server.test.ts
- AC8 → src/app/server/storage.server.test.ts
- AC9 → src/tests/e2e/admin-promotions.spec.ts
- AC10 → src/app/routes/admin/promotions.test.ts
- AC11 → src/tests/e2e/admin-promotions.spec.ts
- AC12 → src/tests/e2e/admin-promotions.spec.ts

## Notes
- As built (2026-11-13): `/admin/promotions/new` and `/admin/promotions/:id`. Built: AC1 (toast "Promotion saved", back to the list), AC2, AC3 (resulting price per product; a sale price not below base saves and shows "no offer will show"), AC4 (one row per product, so a product cannot be added twice), AC5 (note on the row), AC6, AC7, AC9, AC10. Not built: AC8 (promotion image upload). Tests: `src/app/routes/admin/promotion.test.ts`, `src/tests/e2e/admin-promotions.spec.ts`.
- Depends on: S-052, S-047 (upload path).
- Contract: `admin/promotion` loader and `save` (contracts.md). Discount applies to base price only, never options or delivery (FR-016, FR-017); the price rules and the customer display are E-04 and E-05.
