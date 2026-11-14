# S-175: Search customers by name, phone or email
Status: done
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#customers
Estimate: 2 pts
Owner: remix-specialist, postgres-specialist, test-engineer

## Story
As an admin, I want to search customers by name, phone or email, so that I find the right customer fast while on the phone with them.

## Acceptance Criteria
- [x] AC1 (FR-065): Given a customer stored as +23057123456, when I search "5712 3456", then they are found (digits normalised, FR-021).
- [x] AC2 (FR-065): Given a partial name or a partial email, then matching customers show.
- [x] AC3 (FR-065): Given no match, then "No match for 'x'." and a Clear button show; Clear restores the full list.
- [x] AC4 (FR-065): Given a query longer than 80 characters, then `VALIDATION_FAILED`; given special characters or SQL wildcards (`%`, `_`, `'`), then they are escaped and parameterised and match literally.
- [x] AC5 (FR-065, NFR-004): Given the log, then `customers_searched` records query length only, never the query.
- [x] AC6 (FR-065): Given anonymised customers, then they are excluded from search.
- [x] AC7 (FR-065, FR-041): Given a customer or anonymous session, then search is refused.
- [x] AC8 (NFR-002, NFR-006): Given the sticky search field, then it has a visible label (not placeholder only), a search role, results announced via a polite status ("12 customers"), 44 px height, AA contrast per `docs/design/tokens.json`, and works at 320/375 px at 200% zoom.

## Tests
- AC1 → src/app/domain/customer-search.test.ts, src/app/server/repos/admin-customers.server.test.ts
- AC2 → src/app/routes/admin/customers.test.tsx
- AC3 → src/app/routes/admin/customers.test.tsx
- AC4 → src/app/domain/customer-search.test.ts, src/app/server/repos/admin-customers.server.test.ts
- AC5 → src/app/routes/admin/customers.test.tsx
- AC6 → src/app/server/repos/admin-customers.server.test.ts
- AC7 → src/app/routes/admin/customers.test.tsx
- AC8 → src/tests/e2e/admin-customers.spec.ts

## Notes
- Cuttable (cut order #2) with S-174. Depends on S-174; reuses the E.164 normalisation from S-133.
- Built 2026-11-14. One field for name, email or phone; a phone-looking query (≥ 3 digits) also matches the stored number's digits. Only the search field and its button stay pinned while scrolling; Sort sits just below (same GET form via the `form` attribute) and applies at once with JavaScript. AC7 for search: a customer session opening `/admin/customers?q=…` is redirected to sign-in like every admin page.
