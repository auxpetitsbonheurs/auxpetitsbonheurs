# S-177: Private note on a customer
Status: ready
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#customers
Estimate: 2 pts
Owner: remix-specialist, postgres-specialist, test-engineer

## Story
As an admin, I want to keep a private note on a customer (allergies, preferences), so that the whole team remembers it next time.

## Acceptance Criteria
- [ ] AC1 (FR-065): Given a note typed, when I tap Save, then "Saved" status shows and the note persists; when another admin opens the customer, then the note shows.
- [ ] AC2 (FR-065): Given a note of 2001 characters, then `VALIDATION_FAILED` and nothing is saved; 2000 saves; an empty note clears it.
- [ ] AC3 (FR-065, NFR-004): Given a saved note, then it never appears on the customer's tracking page, in any email, in the CSV, or in logs.
- [ ] AC4 (FR-065): Given two admins editing at once, then last write wins and each sees the other's note on reload (accepted; no `version`).
- [ ] AC5 (FR-065): Given an unknown customer id, then `NOT_FOUND`; given a save failure, then an error message shows and the typed text is kept.
- [ ] AC6 (FR-065, FR-041, FR-039): Given Admin or Owner, then `saveNote` works; given a customer or anonymous session, then it is refused.
- [ ] AC7 (NFR-002, NFR-006): Given the textarea, then it has a visible label, a live character counter, explicit Save button (44 px), the "Saved" status is announced via `role=status`, AA contrast per `docs/design/tokens.json`, and it fits 320/375 px at 200% zoom.

## Tests
- AC1 → src/app/routes/admin.customers.$id.test.tsx
- AC2 → src/app/routes/admin.customers.$id.test.tsx
- AC3 → src/app/routes/admin.customers.$id.test.tsx
- AC4 → src/app/routes/admin.customers.$id.test.tsx
- AC5 → src/app/routes/admin.customers.$id.test.tsx
- AC6 → src/app/routes/admin.customers.$id.test.tsx
- AC7 → src/tests/e2e/admin-customers.a11y.spec.ts

## Notes
- Cuttable (cut order #2). Depends on S-176. `saveNote` is unversioned (contract). Log `customer_note_saved` carries customerId and role only.
