# S-178: Export the sales summary as CSV
Status: done
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#api-contract
Estimate: 3 pts
Owner: remix-specialist, api-engineer, test-engineer

## Story
As the Owner, I want to download the sales summary as a CSV that matches the screen, so that I can keep records or give them to my accountant.

## Acceptance Criteria
- [x] AC1 (FR-069): Given Export CSV for a range, then the file `apb-sales-<from>_<to>.csv` downloads as `text/csv; charset=utf-8` with sections Summary, Top products, By source, Unpaid and Orders.
- [x] AC2 (FR-069): Given the same range, then Summary values (revenue, orders, average, delivery and pickup counts and revenue) equal the on-screen tiles.
- [x] AC3 (FR-069): Given the Orders section, then its row count equals the order count and the sum of `total_rs` equals revenue; amounts are integers and dates `YYYY-MM-DD`.
- [x] AC4 (FR-069): Given a range with no orders, then the CSV is valid with the header rows and zero totals.
- [x] AC5 (FR-069): Given the export fails, then the toast "Export failed, try again" shows and the button leaves its spinner state.
- [x] AC6 (FR-069, NFR-001): Given 12k orders in a year range, then the response streams and does not time out.
- [x] AC7 (FR-069): Given an invalid range (from > to, over 366 days), then `VALIDATION_FAILED` and no file.
- [x] AC8 (FR-069, NFR-004): Given privacy rules, then customer name appears only in the Unpaid section and no phone or email appears anywhere in the file.
- [x] AC9 (NFR-002, NFR-006): Given the Export button, then it is a button with a visible text label, a busy state announced to screen readers, 44 px, AA contrast per `docs/design/tokens.json`, reachable by keyboard at 320/375 px and 200% zoom.

## Tests
- AC1 → src/app/routes/admin/sales-csv.test.ts
- AC2 → src/app/routes/admin/sales-csv.test.ts
- AC3 → src/app/routes/admin/sales-csv.test.ts
- AC4 → src/app/routes/admin/sales-csv.test.ts
- AC5 → src/tests/e2e/admin-sales.spec.ts
- AC6 → src/app/routes/admin/sales-csv.test.ts (1,500 rows over several pages), src/tests/e2e/admin-sales.perf.spec.ts (12,000)
- AC7 → src/app/routes/admin/sales-csv.test.ts
- AC8 → src/app/routes/admin/sales-csv.test.ts
- AC9 → src/tests/e2e/admin-sales.spec.ts

## Notes
- Cuttable (cut order #1): FR-069 CSV export is the first item cut. Depends on S-171..S-173.
- Spec open question 5 (names only in Unpaid) taken as the assumption.
- Built 2026-11-13. Route module `routes/admin/sales-csv.tsx` at `/admin/sales.csv` (outside the admin frame, admin middleware for `no-store`). Streamed: a `ReadableStream` pulls keyset pages of 1,000 rows. Section names, column names and enum values are English codes (the accountant's file), the product names follow the admin's language. Unpaid ends with a `total` row.
- Export button: a GET form (works without JavaScript); with JavaScript it fetches the file, shows "Preparing the CSV…" with `aria-busy`, saves it under the server's file name and toasts "CSV downloaded.", or "Export failed, try again" on any failure.
