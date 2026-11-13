# S-179: CSV safety, Excel encoding and access control
Status: done
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#api-contract
Estimate: 2 pts
Owner: api-engineer, test-engineer

## Story
As the Owner opening the export in Excel, I want accented names to display correctly and no cell to run as a formula, and as the bakery I want only signed-in admins to download it.

## Acceptance Criteria
- [x] AC1 (FR-069, NFR-003): Given a customer name starting with "=", "+", "-" or "@", then the exported cell is prefixed with an apostrophe so it is not evaluated as a formula.
- [x] AC2 (FR-069, NFR-007): Given French names with accents (e.g. "Hélène", "François"), then the file is UTF-8 with BOM, comma-separated with CRLF, and opens correctly in Excel.
- [x] AC3 (FR-069, NFR-003): Given a value containing a comma, quote or newline, then it is quoted and escaped per RFC 4180.
- [x] AC4 (FR-069, FR-039): Given a customer or anonymous session, when requesting `/admin/sales.csv`, then no data is returned (redirect to `/admin/login` or 403).
- [x] AC5 (FR-069, FR-041): Given an Admin session, then the export works (owner decision); Owner too.
- [x] AC6 (FR-069, NFR-003): Given query params, then they are zod-validated; no export link works without a session.

## Tests
- AC1 → src/app/lib/csv.test.ts
- AC2 → src/app/lib/csv.test.ts
- AC3 → src/app/lib/csv.test.ts
- AC4 → src/app/routes/admin/sales-csv.test.ts
- AC5 → src/app/routes/admin/sales-csv.test.ts
- AC6 → src/app/routes/admin/sales-csv.test.ts

## Notes
- Cuttable (cut order #1) with S-178. API-only: no UI, so no a11y ACs. Depends on S-178.
- Built 2026-11-13. `lib/csv.ts`: the guard also covers a leading tab or carriage return (OWASP CSV injection list); numbers are written as numbers, so a negative amount is not prefixed. AC4: customers and anonymous visitors get the 302 to `/admin/login?next=…` (same guard as every admin page), never a CSV.
