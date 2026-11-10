# S-153: Upload request photos and verify them on the server
Status: ready
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#api-contract
Estimate: 5 pts
Owner: api-engineer, baas-specialist, postgres-specialist, test-engineer

## Story
As a customer, I want my shrunk photos to upload safely with the request, so that the baker can see them, and as the bakery I want only valid images stored in private storage.

## Acceptance Criteria
- [ ] AC1 (FR-029): Given 1 to 5 files of allowed type up to 1 MB, when `requestUploadUrls` is called with an `uploadSessionId`, then signed upload URLs to the private `request-photos` bucket are returned under that session prefix.
- [ ] AC2 (FR-029): Given a file type outside JPEG/PNG/WebP, a size over 1 MB or more than 5 files, when `requestUploadUrls` is called, then `UPLOAD_REJECTED`.
- [ ] AC3 (FR-029, FR-028): Given a submit whose `photoPaths` exist under the session prefix with allowed MIME and size, then `custom_request_photo` rows are written with `sort_order` 0..4 in the same transaction as the order.
- [ ] AC4 (FR-029): Given a crafted `submitCustomRequest` pointing at an object that is missing, of a disallowed MIME (e.g. PDF), over 1 MB, or outside the session prefix, then `UPLOAD_REJECTED` and no order is created.
- [ ] AC5 (FR-029): Given 6 paths, or `photoPaths` plus `galleryPhotoId` totalling more than 5, then `UPLOAD_REJECTED`.
- [ ] AC6 (FR-029): Given one upload fails, then its tile offers "Try again", the form stays, and submit is blocked until every tile is uploaded or removed; given a network drop then retry, already uploaded paths are reused.
- [ ] AC7 (FR-029): Given abandoned uploads, then the `purge` job removes orphan objects after 24 h and never removes objects attached to an order.
- [ ] AC8 (FR-029, NFR-003): Given the bucket, then it is private with MIME and size restrictions, and anonymous reads of `request-photos` are denied.
- [ ] AC9 (FR-029, NFR-002): Given upload progress, then per-tile status is announced politely and failure chips include text ("Upload failed. Try again") with a 44 px retry button and AA contrast per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/custom-cake.upload.test.ts
- AC2 → src/app/routes/custom-cake.upload.test.ts
- AC3 → src/app/routes/custom-cake.test.tsx
- AC4 → src/app/routes/custom-cake.upload.test.ts
- AC5 → src/app/routes/custom-cake.upload.test.ts
- AC6 → src/tests/e2e/custom-request.spec.ts
- AC7 → src/app/jobs/purge.test.ts
- AC8 → src/app/routes/custom-cake.upload.test.ts
- AC9 → src/tests/e2e/custom-request.a11y.spec.ts

## Notes
- Depends on S-151, S-152, E-01 (storage client, job runner). `purge` job may be owned by another epic (E-12 or E-01); if it does not exist at build time, AC7 splits into a follow-up story and is the only blocker.
- Open spec question: gallery photo referenced via `source_gallery_photo_id` (not copied), per spec assumption; confirm with lead-backend.
- Retention 90 days after final status is `[TO CONFIRM]` in the PRD and out of scope here.
