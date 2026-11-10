# S-046: Create and edit a product's basic details
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#product-editor-sections-order
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist, api-engineer

## Story
As a bakery admin, I want to add a product with its names, price, notice, allergens and status from my phone, so that I can put a new cake on the menu without a developer.

## Acceptance Criteria
- [ ] AC1 (FR-062): Given `/admin/menu/new`, when I enter an English name, an optional French name, descriptions, base price Rs 850, type, optional category, allergen chips and status, and save, then the product exists, a toast says "Saved", and I stay on the page.
- [ ] AC2 (FR-062): Given only an English name, when saved and viewed in French, then the English text shows (EN fallback); the French field shows the hint "French missing, English will show".
- [ ] AC3 (FR-062): Given an empty English name, a name over 120 characters, a description over 2000 characters, a negative or non-integer price, or notice days outside 0 to 60, then `VALIDATION_FAILED` marks each field, the error summary takes focus, and nothing is saved.
- [ ] AC4 (FR-062): Given notice days left blank, then the field shows "Use default (3)" with the current Settings default and the product stores no notice; given a value, then it is stored.
- [ ] AC5 (FR-062): Given a new product, then its slug is generated from the English name using `[a-z0-9-]`; given a slug already used by another product or present in slug history, then `409` with `fields.slug` and nothing is saved.
- [ ] AC6 (FR-062): Given unsaved changes, when I leave the page, then I am asked to confirm; after saving, no prompt shows.
- [ ] AC7 (FR-062): Given two admins save the same product, then the last write wins and the editor shows "Updated by {name} at {HH:mm}" on load only.
- [ ] AC8 (FR-041): Given an Admin or Owner, then they can save; given a customer or anonymous visitor, then redirect or refusal.
- [ ] AC9 (NFR-002): Given the editor at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, the sticky Save bar never hides a field, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; names and descriptions are side by side from `md` up and stacked with a language label on phones.
- [ ] AC10 (NFR-002): Given the form, then every field has a visible label tied to it, chips show state as text and selection (not colour only), errors are linked to fields, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [ ] AC11 (NFR-002): Given a price field, then it uses a numeric keyboard (`inputmode="numeric"`) and prefixes "Rs" outside the input value.

## Tests
- AC1 → src/app/server/services/save-product.server.test.ts and src/tests/e2e/admin-menu.spec.ts
- AC2 → src/app/routes/site/product.test.ts
- AC3 → src/app/server/services/save-product.server.test.ts
- AC4 → src/app/server/services/save-product.server.test.ts
- AC5 → src/app/server/services/save-product.server.test.ts
- AC6 → src/tests/e2e/admin-menu.spec.ts
- AC7 → src/app/server/services/save-product.server.test.ts
- AC8 → src/app/routes/admin/product.test.ts
- AC9 → src/tests/e2e/admin-menu.spec.ts
- AC10 → src/tests/e2e/admin-menu.spec.ts
- AC11 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-041, S-004 (E-01), S-033 (E-02).
- Contract: `admin/product` loader and `save` with `ProductInput` (photos and option groups are added by S-047 and S-048; the schema is already whole, so this story validates with those arrays empty or optional while status is hidden).
- Decisions from the spec: stays on the page after saving; products are last-write-wins (no version column).
- Allergen chip list comes from `allergenTags` in the loader; the kitchen-handles-allergens notice is site-wide (FR-007), not per product.
