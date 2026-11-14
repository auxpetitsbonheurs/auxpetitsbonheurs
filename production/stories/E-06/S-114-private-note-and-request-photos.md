# S-114: Private note autosave and reference photos on the order
Status: in-progress
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#acceptance-criteria
Estimate: 2 pts
Owner: remix-specialist, api-engineer

## Story
As an admin, I want to keep a private note on an order and see the customer's reference photos, so that the team shares details the customer never sees.

## Acceptance Criteria
- [ ] AC1 (FR-050): Given a private note edit, when idle for 1 s, then `saveNote` stores it and "Saved" shows; the note never appears on the tracking page or in any customer email.
- [ ] AC2 (FR-050, FR-054): Given a note autosave while another admin changes the status, when saved, then no `ORDER_CHANGED` occurs (note takes no `version`, last write wins) and no order event is written.
- [ ] AC3 (FR-050): Given a note over 2000 characters, when saved, then `VALIDATION_FAILED` and a visible error; the text is kept.
- [ ] AC4 (FR-050): Given a custom request with 3 photos, when the detail loads, then 3 photos show via signed URLs that tap to enlarge; an 11-minute-old URL is not reusable; the images are never public.
- [ ] AC5 (FR-050): Given an expired signed URL, when an image fails, then a "Reload to see photos" prompt shows.
- [ ] AC6 (FR-050): Given a non-admin, when posting `saveNote`, then redirect or `FORBIDDEN` and nothing stored.
- [ ] AC7 (NFR-002, NFR-006): Given the note and photo viewer at 320 px and 375 px, 200% zoom and keyboard-only, when used, then the note has a visible label, "Saved" is announced politely (`role=status`), photos have alt text ("Reference photo 1 of 3"), the enlarge dialog traps focus and closes on Esc, targets >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order.note.test.ts
- AC2 → src/app/routes/admin/order.note.test.ts
- AC3 → src/app/routes/admin/order.note.test.ts
- AC4 → src/app/routes/admin/order.photos.test.ts
- AC5 → src/app/routes/admin/order.photos.test.tsx
- AC6 → src/app/routes/admin/order.note.test.ts
- AC7 → src/tests/e2e/admin-order-detail.spec.ts

## Notes
- Photos exist only for custom requests (E-08 creates them); this story renders any present. Until E-08 lands AC4 uses seeded fixtures.
- Depends on S-113.

## Implementation notes (2026-11-13)
- AC1-AC3, AC6, AC7 (note) built: 1 s idle autosave and on blur, `saveNote` without version or event, "Saved" in a polite status, >2000 keeps the text with an error.
- AC4, AC5 (reference photos with signed URLs) not built yet: E-08 creates the photos; to do once its storage paths land.
