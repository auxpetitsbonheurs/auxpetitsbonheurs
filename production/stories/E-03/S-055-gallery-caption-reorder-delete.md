# S-055: Caption, reorder and delete gallery photos
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#gallery
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, accessibility-specialist, api-engineer

## Story
As a bakery admin, I want to add captions, put the best photos first and remove old ones, so that the gallery always shows my best work.

## Acceptance Criteria
- [ ] AC1 (FR-064): Given a photo, when I save a caption in EN (and optionally FR) of at most 200 characters, then it is stored; a longer caption is refused.
- [ ] AC2 (FR-064): Given a caption only in EN, then the French gallery query returns the EN caption (fallback).
- [ ] AC3 (FR-064): Given I reorder photos with the arrow buttons or by drag, then the gallery order and the first 6 for the home preview follow it after reload.
- [ ] AC4 (FR-064): Given keyboard only, when I use the move buttons, then a polite live region announces the new position ("Photo moved to position 2 of 12").
- [ ] AC5 (FR-064): Given Delete confirmed, then the photo disappears from the site query, and a custom request that referenced it keeps its own copy (source id set to null).
- [ ] AC6 (FR-064): Given `reorder` ids that are not exactly the current photos, then `VALIDATION_FAILED` "The gallery changed, reload" and no change; an unknown photo id gives `NOT_FOUND`.
- [ ] AC7 (FR-041): Given a customer or anonymous caller, when `update`, `reorder` or `delete` is posted, then redirect or refusal and no change.
- [ ] AC8 (NFR-002): Given the controls at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs, tap targets are at least 44 x 44 px, and the delete dialog traps focus and returns it.
- [ ] AC9 (NFR-002): Given repeated controls, then each name includes the photo ("Move Wedding photo 3 earlier", "Delete Wedding photo 3"), and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/gallery.server.test.ts
- AC2 → src/app/server/repos/gallery.server.test.ts
- AC3 → src/app/server/services/gallery.server.test.ts
- AC4 → src/tests/e2e/admin-gallery.spec.ts
- AC5 → src/app/server/services/gallery.server.test.ts (Postgres container)
- AC6 → src/app/server/services/gallery.server.test.ts
- AC7 → src/app/routes/admin/gallery.test.ts
- AC8 → src/tests/e2e/admin-gallery.spec.ts
- AC9 → src/tests/e2e/admin-gallery.spec.ts

## Notes
- Depends on: S-054.
- Contract: `admin/gallery` `update`, `reorder`, `delete`. Data model: `custom_request_photo.source_gallery_photo_id` is `ON DELETE SET NULL`.
