# Epics index

Source: docs/product/prd.md (section 4 Scope, section 11 Release plan). Gate concerns: production/gates/design-2026-11-10.md.

| ID | Epic | Phase | FRs | Count |
|---|---|---|---|---|
| E-01 | Walking skeleton | 1 | 001, 023, 024, 040, 045 | 5 |
| E-02 | Admin access, roles and team | 1 | 039, 041-044, 046, 047 | 7 |
| E-03 | Menu and content management | 2 | 061-064, 066, 067 | 6 |
| E-04 | Customer site: browsing | 3 | 002-005, 007-010 | 8 |
| E-05 | Pricing, availability, checkout, tracking | 3 | 006, 011-022, 025-027 | 16 |
| E-06 | Order management | 4 | 048-054 | 7 |
| E-07 | Manual orders, calendar, prep list | 4 | 055-060 | 6 |
| E-08 | Custom requests and quotes | 4 | 028-033 | 6 |
| E-09 | Customers and sales summary | 4 | 065, 068, 069 | 3 |
| E-10 | Notifications | 5 | 070-075 | 6 |
| E-11 | Customer accounts | 5 | 034-038 | 5 |
| E-12 | Polish, test, launch, handover | 6-7 | none (NFR verification) | 0 |
| | | | Total | 75 |

## Traceability (FR to epic)

| FR | Epic | FR | Epic | FR | Epic |
|---|---|---|---|---|---|
| 001 | E-01 | 026 | E-05 | 051 | E-06 |
| 002 | E-04 | 027 | E-05 | 052 | E-06 |
| 003 | E-04 | 028 | E-08 | 053 | E-06 |
| 004 | E-04 | 029 | E-08 | 054 | E-06 |
| 005 | E-04 | 030 | E-08 | 055 | E-07 |
| 006 | E-05 | 031 | E-08 | 056 | E-07 |
| 007 | E-04 | 032 | E-08 | 057 | E-07 |
| 008 | E-04 | 033 | E-08 | 058 | E-07 |
| 009 | E-04 | 034 | E-11 | 059 | E-07 |
| 010 | E-04 | 035 | E-11 | 060 | E-07 |
| 011 | E-05 | 036 | E-11 | 061 | E-03 |
| 012 | E-05 | 037 | E-11 | 062 | E-03 |
| 013 | E-05 | 038 | E-11 | 063 | E-03 |
| 014 | E-05 | 039 | E-02 | 064 | E-03 |
| 015 | E-05 | 040 | E-01 | 065 | E-09 |
| 016 | E-05 | 041 | E-02 | 066 | E-03 |
| 017 | E-05 | 042 | E-02 | 067 | E-03 |
| 018 | E-05 | 043 | E-02 | 068 | E-09 |
| 019 | E-05 | 044 | E-02 | 069 | E-09 |
| 020 | E-05 | 045 | E-01 | 070 | E-10 |
| 021 | E-05 | 046 | E-02 | 071 | E-10 |
| 022 | E-05 | 047 | E-02 | 072 | E-10 |
| 023 | E-01 | 048 | E-06 | 073 | E-10 |
| 024 | E-01 | 049 | E-06 | 074 | E-10 |
| 025 | E-05 | 050 | E-06 | 075 | E-10 |

## Cuttable Should items

PRD cut order (section 11), first to last: FR-069 CSV export (E-09), FR-065 Customers list (E-09), FR-037 Reorder (E-11), FR-038 Save my details (E-11), customer accounts FR-034..036 (E-11; FR-034 is Must in the PRD table, so cutting it needs a product-director decision).

Other Should items not in the cut order: FR-009 (E-04), FR-033 (E-08), FR-075 (E-10). Not cuttable without a new decision.

## Gate concerns placement

| Concern | Epic |
|---|---|
| `product_slug_history` in Drizzle before first `drizzle-kit generate`; 301 redirect | E-01 (table), E-03 (writes), E-04 (redirect) |
| Worker CPU check on staging (T3) | E-01 (re-check in E-05) |
| A11y acceptance criteria on first UI stories (keyboard, 200% zoom, contrast, 320/375 px; no prototype defects) | E-01, E-02, E-04, E-05 and every UI epic |
| Recorded phone session before launch | E-12 |

## Unmapped
No FR is unmapped. NFRs are verified in E-12 and carried as acceptance criteria in the epics where they apply.
