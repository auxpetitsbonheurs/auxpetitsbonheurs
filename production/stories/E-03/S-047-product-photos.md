# S-047: Add up to five product photos from the phone
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#product-editor-sections-order
Estimate: 5 pts
Owner: baas-specialist, ui-engineer, remix-specialist, api-engineer

## Story
As a bakery admin, I want to add photos straight from my phone camera or gallery, so that the menu looks good without me resizing pictures.

## Acceptance Criteria
- [x] AC1 (FR-029, NFR-001, NFR-009): Given an 8 MB HEIC photo, when I add it, then the browser converts and compresses it to at most 1600 px on the long edge and at most 300 kB (WebP, JPEG fallback) before upload, with EXIF data removed, and the stored object is that file.
- [x] AC2 (FR-029): Given a PDF, an unsupported type or a source file over 10 MB, when I add it, then it is rejected before upload with a plain message and nothing is sent.
- [x] AC3 (FR-029): Given a forged upload over 1 MB, a wrong MIME type or an object path that was not issued, when the product is saved, then `UPLOAD_REJECTED` and the product keeps its previous photos.
- [x] AC4 (FR-062): Given 5 photos, then the add control is disabled and says why; given the sixth is forced through `save`, then `UPLOAD_REJECTED`.
- [x] AC5 (FR-062): Given I reorder photos with the up/down buttons or by drag, then the first photo becomes the card image and the order is saved; removing a photo renumbers the rest.
- [x] AC6 (FR-062): Given a photo upload fails midway, then the failed photo shows an error chip with Retry, other photos continue, and the saved product keeps its previous photos until Save succeeds; uploads run at most 3 in parallel and show progress when slower than 1 second.
- [x] AC7 (FR-062): Given the product has no photo, then status `available` is refused on save with "Add a photo first"; `hidden` is allowed.
- [x] AC8 (NFR-001): Given the editor route, then the image-compression library loads only when the first photo is chosen (initial route JavaScript stays within 170 kB gzipped).
- [x] AC9 (NFR-002): Given each photo, then its alt text is the product name (no field), controls are named "Move photo 2 earlier" and "Remove photo 2", at 320 px and 375 px wide and at 200% zoom every control is reachable by keyboard with a visible focus indicator, nothing is clipped and tap targets are at least 44 x 44 px; changes are announced in a live region.
- [x] AC10 (NFR-002): Given light and dark mode, then every pair meets WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [x] AC11 (FR-062): Given the admin requests upload URLs, then the request needs an admin session (customer or anonymous refused) and no Turnstile; the object paths live under a prefix issued to this session in bucket `public-images`.

## Tests
- AC1 → src/app/lib/image-compress.test.ts (HEIC, JPEG, PNG, WebP paths with decoder/encoder doubles) and src/tests/e2e/admin-menu.spec.ts "S-047 … AC1" (real JPEG with EXIF and real HEIC fixtures in tests/e2e/fixtures, compressed in Chromium; the stored bytes are WebP, ≤ 300 kB, 1600 x 1200, no EXIF)
- AC2 → src/app/lib/image-compress.test.ts and src/tests/e2e/admin-menu.spec.ts "AC2" (no request is sent); src/app/routes/admin/uploads.test.ts (the server refuses the same types and sizes)
- AC3 → src/app/server/services/save-product.server.test.ts "photos (S-047)" (over 1 MB, wrong type, bytes not matching the type, empty, another admin's or session's path, outside the prefix, `..`, never uploaded, another product's photo) and src/app/server/storage.server.test.ts (range read of size, type and first bytes)
- AC4 → src/app/server/services/save-product.server.test.ts and src/tests/e2e/admin-menu.spec.ts
- AC5 → src/tests/e2e/admin-menu.spec.ts (Move buttons, drag by the picture, remove renumbers) and save-product.server.test.ts (order saved, removed file purged)
- AC6 → src/tests/e2e/admin-menu.spec.ts (failed upload with Retry while the other continues, progress after 1 s, Save waits for uploads, stored photos unchanged until Save); concurrency 3 is `UPLOAD_CONCURRENCY` in use-photo-uploads.ts
- AC7 → src/app/server/services/save-product.server.test.ts and src/tests/e2e/admin-menu.spec.ts
- AC8 → src/app/lib/js-budget.test.ts (no static import of image-compress or heic-to on the editor's path) and src/tests/e2e/admin-menu.spec.ts (the chunk is requested only after a photo is chosen); `npm run check:js-budget` passes
- AC9 → src/tests/e2e/admin-menu.spec.ts
- AC10 → src/tests/e2e/admin-menu.spec.ts
- AC11 → src/app/routes/admin/uploads.test.ts (admin only, customer FORBIDDEN, anonymous redirect, paths under `products/<adminId>/<uploadSessionId>/`) and src/app/server/storage.server.test.ts (signing)
- Implementation: `POST /admin/uploads` resource route (contracts.md v0.23); browser code in app/lib/image-compress.ts (lazy), app/lib/photo-upload.ts, app/components/admin/photo-manager.tsx; HEIC decoding falls back to `heic-to` (LGPL-3.0, loaded only for HEIC files on browsers that cannot read them; Safari reads HEIC itself).
- Caveat: the real-device iPhone HEIC check stays a manual test session (E-12). Uploaded files that are never saved (editor closed before Save) stay in Storage under `products/<adminId>/…`; a cleanup job is a follow-up (tech debt).

## Notes
- Depends on: S-046, S-004 (E-01, buckets).
- Contract: `requestUploadUrls` (as customer, bucket `public-images`, no TS) and `ProductInput.photos`. Limits are constants in `contracts/shared.ts` (`MAX_PHOTOS = 5`, `UPLOAD_MAX_BYTES = 1_048_576`, `UPLOAD_TARGET_BYTES = 307_200`).
- Shared by promotions (S-053), gallery (S-054) and Settings images (S-059).
- Risk: free storage limit 1 GB; photos at 300 kB keep it comfortable (NFR-009).
- Real-device HEIC conversion check on iPhone is a manual test session (E-12); unit fixtures cover the code path.
