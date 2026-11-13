# S-154: Request something similar from a gallery photo
Status: done
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#flow
Estimate: 2 pts
Owner: remix-specialist, ui-engineer, test-engineer

## Story
As a customer browsing the gallery, I want a "Request something similar" button that opens the request form with that photo already attached, so that I do not have to describe or re-upload it.

## Acceptance Criteria
- [x] AC1 (FR-028): Given `/custom-cake?fromGallery=<id>` with a valid gallery photo id, then the form shows that photo attached as photo 1, counted toward the 5.
- [x] AC2 (FR-028): Given the request is submitted, then the photo is saved as photo 1 via `source_gallery_photo_id` and admins see it in the request.
- [x] AC3 (FR-028): Given an unknown or unpublished gallery id, then it is ignored and the normal empty form shows with no error.
- [x] AC4 (FR-028): Given the pre-attached photo, when I remove it, then it detaches and I can add up to 5 of my own.
- [x] AC5 (FR-028): Given the gallery page, then each photo has a "Request something similar" link whose accessible name includes the photo's alt text, and it works in FR at `/fr/`.
- [x] AC6 (NFR-002, NFR-006): Given keyboard, 320/375 px and 200% zoom, then the button is reachable, 44 px tall, has AA contrast per `docs/design/tokens.json`, and the pre-attached tile has the unique name "Remove photo 1".

## Tests
- AC1 → src/app/routes/custom-cake.test.tsx
- AC2 → src/app/routes/custom-cake.test.tsx
- AC3 → src/app/routes/custom-cake.test.tsx
- AC4 → src/app/components/photo-picker.test.tsx
- AC5 → src/tests/e2e/custom-request.spec.ts
- AC6 → src/tests/e2e/custom-request.a11y.spec.ts

## Notes
- Depends on S-151, S-152, E-04 (gallery page and FR-009). The FR-009 link is a PRD item of E-04; this story only covers the form side and the gallery button wiring named in the spec.

## Build notes (2026-11-13, E-08 slice 1)
- The gallery photo is referenced (`source_gallery_photo_id`), not copied, and stored as photo 1; "Request something similar" links sit under each gallery photo with the photo's alt text in their accessible name.
