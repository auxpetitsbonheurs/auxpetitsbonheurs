# S-054: Upload gallery photos and tag them by occasion
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#gallery
Estimate: 5 pts
Owner: baas-specialist, ui-engineer, remix-specialist, api-engineer

## Story
As a bakery admin, I want to upload photos of finished cakes and tag them (birthday, wedding), so that customers can browse examples.

## Acceptance Criteria
- [ ] AC1 (FR-064): Given 5 photos selected, when uploaded, then all 5 appear in the grid, each compressed in the browser (at most 1600 px and 300 kB) and shown as soon as each finishes.
- [ ] AC2 (FR-064): Given one of the 5 fails, then it shows an error chip with Retry and the other 4 are kept.
- [ ] AC3 (FR-064): Given more than 20 photos in a batch, then the extra files are refused with a plain message and `UPLOAD_REJECTED` on the server; given a file that is not an image or over 10 MB, then it is rejected before upload.
- [ ] AC4 (FR-064): Given each uploaded photo, then I can set an occasion tag (up to 40 characters) from the existing list (suggestions) or type a new one; a tag over 40 characters is refused.
- [ ] AC5 (FR-064): Given a photo tagged "Wedding", when a customer filters the gallery by Wedding (E-04), then the gallery query by occasion returns it.
- [ ] AC6 (FR-064): Given no photos, then "No photos yet." and an "Upload photos" button show.
- [ ] AC7 (FR-041): Given an Admin or Owner, then they can upload; given a customer or anonymous visitor, then redirect or `FORBIDDEN`, and `requestUploadUrls` is refused.
- [ ] AC8 (NFR-001): Given the gallery route, then the compression library loads only after files are chosen.
- [ ] AC9 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; the file chooser is a real button with a name.
- [ ] AC10 (NFR-002): Given the grid, then each image has alt text from its caption or occasion ("Wedding cake photo"), progress and errors are announced in a live region, error chips are text not colour only, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/tests/e2e/admin-gallery.spec.ts
- AC2 → src/tests/e2e/admin-gallery.spec.ts
- AC3 → src/app/server/services/gallery.server.test.ts
- AC4 → src/app/server/services/gallery.server.test.ts
- AC5 → src/app/server/repos/gallery.server.test.ts
- AC6 → src/tests/e2e/admin-gallery.spec.ts
- AC7 → src/app/routes/admin/gallery.test.ts
- AC8 → src/app/lib/js-budget.test.ts
- AC9 → src/tests/e2e/admin-gallery.spec.ts
- AC10 → src/tests/e2e/admin-gallery.spec.ts

## Notes
- Depends on: S-047 (shared compression and signed upload code), S-004 (E-01).
- Contract: `admin/gallery` loader, `requestUploadUrls`, `addPhotos` (at most 20), occasions list (contracts v0.2). Occasion list: free text with suggestions (spec Open Question 3, assumption).
