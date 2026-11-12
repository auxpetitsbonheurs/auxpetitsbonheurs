# S-247: Admin Pages: add, order and remove photos
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/admin-menu-content.md (add "Pages") · Photo rules: production/stories/E-03/S-047-product-photos-upload.md (reuse)
Estimate: 3 pts
Owner: baas-specialist, ui-engineer, remix-specialist, api-engineer

## Story
As the Owner or an Admin, I want to add photos to Our story, Workshops and Custom order from my phone camera roll, so that the pages look like my bakery.

## Acceptance Criteria
- [x] AC1 (FR-078): Given a page that allows photos, when I choose files, then each is compressed in the browser (WebP, at most 1600 px, at most 300 kB, EXIF dropped, HEIC supported) and uploaded with the S-047 signed-URL flow; progress shows per item after 1 s.
- [x] AC2 (FR-078): Given more photos than the page's limit (our_story 4, workshops 6, custom_order 3), then the extra files are refused with a plain message and the server returns `UPLOAD_REJECTED`; given a non-image or a file over 10 MB, then it is rejected before upload.
- [x] AC3 (FR-078, NFR-002): Given a photo, then an EN alt text is required before Save (FR optional, EN fallback) with a hint "Describe what the photo shows"; Save without it shows an inline error.
- [x] AC4 (FR-078): Given photos, then I can reorder them with Move up / Move down buttons (no drag-only) and remove one with a confirm, and the order and removals show on the public page after Save.
- [x] AC5 (FR-078): Given one upload fails, then it shows an error chip with Retry and the others are kept.
- [x] AC6 (FR-078, NFR-003): Given save, then the server re-checks each photo like S-047 (issued prefix `site/pages/<key>/`, unused, size, magic bytes); a forged path is refused.
- [x] AC7 (FR-078, NFR-001): Given the editor route, then the compression library loads only after files are chosen and route JS stays <= 170 kB gz.
- [x] AC8 (FR-041, NFR-002): Given an Admin, Owner, customer and anonymous request, then Admin and Owner can upload and the others are refused; the picker is a real named button, 320 px / 200% zoom / keyboard OK, progress and errors announced in a live region.
- [x] AC9 (FR-078): Given a removed photo, then its file is queued for Storage removal (existing `storage_purge`) and never shows publicly.

## Tests
- AC1 → src/tests/e2e/admin-pages.spec.ts, src/app/lib/image-compress.test.ts (existing)
- AC2 → src/app/server/services/save-site-page.server.test.ts
- AC3 → src/app/server/services/save-site-page.server.test.ts, src/tests/e2e/admin-pages.spec.ts
- AC4 → src/tests/e2e/admin-pages.spec.ts
- AC5 → src/tests/e2e/admin-pages.spec.ts
- AC6 → src/app/routes/admin/uploads.test.ts
- AC7 → src/app/lib/js-budget.test.ts
- AC8 → src/app/routes/admin/uploads.test.ts, src/tests/e2e/admin-pages.spec.ts
- AC9 → src/app/server/services/save-site-page.server.test.ts

## Notes
- Reuse S-047/S-059 code; do not write a second compression or upload path (Owner decision: reuse S-047 photo upload rules).
- Gallery page photos are not here: they are managed in Gallery (S-054/S-055).
- Depends on: S-246, S-047.

## Build notes (2026-11-12, review)
- Reuses the S-047 upload path as is: `sourceProblem`, `compressPhoto` (loaded on the first photo), `requestUpload` / `putFile`, `isStoredImage` and `removePhotos`; `admin/uploads` takes `scope=page:<key>` (any admin) and issues paths under `site/pages/<key>/<adminId>/<session>/`.
- Deviation: the editor's photo queue is a small separate hook (`use-page-photo-uploads.ts`, uploads one at a time) instead of `usePhotoUploads`. Sharing that module with this route splits it out of the product editor's chunk and pushed that route to 170.2 kB (over budget). Rules and upload code are shared; only the React state is separate.
- Remove asks with an inline confirm (Remove photo / Keep it) instead of a modal.
- Tests as built: AC2, AC3, AC6, AC9 → `src/app/server/services/save-site-page.server.test.ts`; AC6, AC8 → `src/app/routes/admin/uploads.test.ts`; AC1, AC3, AC4, AC7 → `src/tests/e2e/admin-pages.spec.ts`; AC7 budget → `npm run check:js-budget`.
