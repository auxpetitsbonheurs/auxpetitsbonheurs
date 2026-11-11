# S-046: Create and edit a product's basic details
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#product-editor-sections-order
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist, api-engineer

## Story
As a bakery admin, I want to add a product with its names, price, notice, allergens and status from my phone, so that I can put a new cake on the menu without a developer.

## Acceptance Criteria
- [x] AC1 (FR-062): Given `/admin/menu/new`, when I enter an English name, an optional French name, descriptions, base price Rs 850, type, optional category, allergen chips and status, and save, then the product exists, a toast says "Saved", and I stay on the page.
- [x] AC2 (FR-062): Given only an English name, when saved and viewed in French, then the English text shows (EN fallback); the French field shows the hint "French missing, English will show".
- [x] AC3 (FR-062): Given an empty English name, a name over 120 characters, a description over 2000 characters, a negative or non-integer price, or notice days outside 0 to 60, then `VALIDATION_FAILED` marks each field, the error summary takes focus, and nothing is saved.
- [x] AC4 (FR-062): Given notice days left blank, then the field shows "Use default (3)" with the current Settings default and the product stores no notice; given a value, then it is stored.
- [x] AC5 (FR-062): Given a new product, then its slug is generated from the English name using `[a-z0-9-]`; given a slug already used by another product or present in slug history, then `409` with `fields.slug` and nothing is saved.
- [x] AC6 (FR-062): Given unsaved changes, when I leave the page, then I am asked to confirm; after saving, no prompt shows.
- [x] AC7 (FR-062): Given two admins save the same product, then the last write wins and the editor shows "Updated by {name} at {HH:mm}" on load only.
- [x] AC8 (FR-041): Given an Admin or Owner, then they can save; given a customer or anonymous visitor, then redirect or refusal.
- [x] AC9 (NFR-002): Given the editor at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, the sticky Save bar never hides a field, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; names and descriptions are side by side from `md` up and stacked with a language label on phones.
- [x] AC10 (NFR-002): Given the form, then every field has a visible label tied to it, chips show state as text and selection (not colour only), errors are linked to fields, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [x] AC11 (NFR-002): Given a price field, then it uses a numeric keyboard (`inputmode="numeric"`) and prefixes "Rs" outside the input value.

## Tests
- AC1 → src/app/server/services/save-product.server.test.ts and src/tests/e2e/admin-menu.spec.ts
- AC2 → src/app/routes/site/product.test.ts (saved through the editor action, viewed on /fr) and src/tests/e2e/admin-menu.spec.ts (hint)
- AC3 → src/app/server/services/save-product.server.test.ts
- AC4 → src/app/server/services/save-product.server.test.ts
- AC5 → src/app/server/services/save-product.server.test.ts and src/app/domain/product.test.ts (slug rule); src/app/routes/admin/product.test.ts (409 envelope)
- AC6 → src/tests/e2e/admin-menu.spec.ts
- AC7 → src/app/server/services/save-product.server.test.ts and src/app/routes/admin/product.test.ts (loader `updated`); src/tests/e2e/admin-menu.spec.ts ("Updated by Sarah at HH:mm")
- AC8 → src/app/routes/admin/product.test.ts
- AC9 → src/tests/e2e/admin-menu.spec.ts
- AC10 → src/tests/e2e/admin-menu.spec.ts
- AC11 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-041, S-004 (E-01), S-033 (E-02).
- Contract: `admin/product` loader and `save` with `ProductInput` (photos and option groups are added by S-047 and S-048; the schema is already whole, so this story validates with those arrays empty or optional while status is hidden).
- Decisions from the spec: stays on the page after saving; products are last-write-wins (no version column).
- Allergen chip list comes from `allergenTags` in the loader; the kitchen-handles-allergens notice is site-wide (FR-007), not per product.

## Build notes (2026-11-12)
- New products start Hidden (a product needs a photo before it can be Available or Sold out; photos arrive with S-047). Trying another status without a photo says "Add a photo first" on the Status field.
- A "Web address" field (optional) holds the slug: blank on create = made from the English name; a taken one is `SLUG_TAKEN` (409, contract v0.20). Changing it on an existing product keeps the old one in `product_slug_history` (redirect arrives with S-050).
- Migration 0002 adds `product.updated_by` (nullable FK, expand only) for "Updated by {name} at {HH:mm}". CI applies it on the next staging deploy.
- Allergen chips: Eggless, Nut-free, Gluten-free, Dairy-free (`ALLERGEN_TAGS` in `app/domain/product.ts`; the Owner can ask for more).
- The unsaved-changes prompt covers in-app links (dialog "Leave without saving?") and closing the tab (browser prompt).
