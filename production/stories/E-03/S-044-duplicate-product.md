# S-044: Duplicate a product as a starting point
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#menu-list
Estimate: 3 pts
Owner: remix-specialist, api-engineer, baas-specialist, postgres-specialist

## Story
As a bakery admin, I want to copy an existing cake, so that I can make a similar one without re-entering sizes, flavours and photos.

## Acceptance Criteria
- [ ] AC1 (FR-061): Given a cake with 3 option groups and 3 photos, when I confirm Duplicate, then a new product exists with status `hidden`, the same price, notice, allergens, seasonal dates, groups and choices (new ids) and its own photo files, and the editor opens on the copy.
- [ ] AC2 (FR-061): Given the copy, then its names are the original plus " (copy)" in EN and " (copie)" in FR (only where the original has that language) and its slug is regenerated and unique.
- [ ] AC3 (FR-061): Given the copy's photo files, then they are copied server-side to new storage paths, so deleting the original's photos never removes the copy's.
- [ ] AC4 (FR-061): Given copying a photo fails midway, then no copy is left (database changes rolled back, already copied files removed or queued for the orphan purge) and the admin sees "Could not duplicate, try again".
- [ ] AC5 (FR-061): Given the original, then it is unchanged after Duplicate.
- [ ] AC6 (FR-061): Given an unknown id, then `NOT_FOUND`; given a customer or anonymous caller, then redirect or refusal.
- [ ] AC7 (NFR-002): Given the Duplicate confirm dialog at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then focus is trapped and returns to the trigger, every control is reachable with a visible focus indicator and tap targets are at least 44 x 44 px; the result is announced in a live region; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/duplicate-product.server.test.ts (Postgres container, fake storage)
- AC2 → src/app/server/services/duplicate-product.server.test.ts
- AC3 → src/app/server/services/duplicate-product.server.test.ts
- AC4 → src/app/server/services/duplicate-product.server.test.ts
- AC5 → src/app/server/services/duplicate-product.server.test.ts
- AC6 → src/app/routes/admin/menu.test.ts
- AC7 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-046, S-047, S-048 (editor and the data being copied).
- Contract: `admin/menu` `duplicate { id }` redirects to the copy (contracts v0.2: photo objects are copied server-side).
