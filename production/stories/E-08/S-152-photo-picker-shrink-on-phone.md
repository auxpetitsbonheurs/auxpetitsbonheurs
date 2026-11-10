# S-152: Pick photos and shrink them on the phone
Status: ready
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#photo-rules-client
Estimate: 5 pts
Owner: ui-engineer, remix-specialist, accessibility-specialist, test-engineer

## Story
As a customer on a phone, I want to attach up to 5 photos that are shrunk before sending, so that I can show the cake I imagine without using lots of data.

## Acceptance Criteria
- [ ] AC1 (FR-029): Given a JPEG, PNG, WebP, HEIC or HEIF file (checked by MIME and file signature) up to 10 MB, when I choose it, then it is resized to a longest edge of 1600 px, re-encoded to JPEG or WebP, lowering quality from 0.82 toward 0.5 then the long edge toward 1200 px until at most 300 KB, and never above 1 MB.
- [ ] AC2 (FR-029): Given an 8 MB HEIC, when chosen, then it is decoded in the browser by a `lazy()`-loaded decoder (not in the initial bundle) and results in a JPEG/WebP of at most 1 MB (target <= 300 KB).
- [ ] AC3 (FR-029): Given a PDF or any other type (including a file renamed to .jpg), when chosen, then it is rejected immediately with a message naming the allowed types and an entry `photo_rejected` (reason type).
- [ ] AC4 (FR-029): Given an 11 MB JPEG, then it is rejected before decoding with a size message.
- [ ] AC5 (FR-029): Given a photo that cannot get under 1 MB, then it is rejected with "This photo is too detailed, try another".
- [ ] AC6 (FR-029): Given 5 photos attached, when I add a 6th, then it is blocked with "5 photos maximum"; a photo pre-attached from the gallery counts as one of the 5.
- [ ] AC7 (FR-029): Given a phone photo with EXIF orientation and GPS metadata, then the output is upright and contains no location metadata.
- [ ] AC8 (FR-029): Given no photos, then a dashed "Add photos (up to 5)" tile shows and photos are optional; given the same file twice, then it is allowed and counts twice.
- [ ] AC9 (FR-029, NFR-001): Given a mid-range phone, then each photo shrinks in under 3 s with a spinner tile, and the compressor adds nothing to the initial JS budget until the first pick.
- [ ] AC10 (NFR-002): Given keyboard and screen reader, then the Add tile and each photo tile are buttons with unique names ("Remove photo 2", "Try again photo 3"), progress and errors are announced politely (`role=status`), and an alternative text label is required per photo state, not "image" copied across tiles.
- [ ] AC11 (NFR-002, NFR-006): Given 320/375 px and 200% zoom, then tiles reflow without horizontal scroll, targets are 44 px, error chips meet AA contrast per `docs/design/tokens.json` and do not rely on colour alone.

## Tests
- AC1 → src/app/lib/photo-shrink.test.ts
- AC2 → src/app/lib/photo-shrink.test.ts
- AC3 → src/app/lib/photo-validate.test.ts
- AC4 → src/app/lib/photo-validate.test.ts
- AC5 → src/app/lib/photo-shrink.test.ts
- AC6 → src/app/components/photo-picker.test.tsx
- AC7 → src/app/lib/photo-shrink.test.ts
- AC8 → src/app/components/photo-picker.test.tsx
- AC9 → src/tests/e2e/custom-request.perf.spec.ts
- AC10 → src/tests/e2e/custom-request.a11y.spec.ts
- AC11 → src/tests/e2e/custom-request.a11y.spec.ts

## Notes
- Depends on S-151 (form). Risk from epic: HEIC on mid-range phones; manual device test is required before release and is a test-session item for qa-lead (not in this AC map).
- Decision: image processing is unit-tested with fixtures in src/app/lib/__fixtures__; the 8 MB HEIC fixture is generated in test setup rather than committed.
- 300 KB target and 1 MB hard cap per consolidation decision 4.
