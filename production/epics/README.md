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
| E-13 | Site navigation and brand pages (added 2026-11-12) | 3 | 076-081 | 6 |
| E-14 | Bakery reviews (added 2026-11-12, Should; after E-11) | 5 | 082-086 | 5 |
| E-15 | Workshop events and registration (added 2026-11-14) | post-MVP | 087-094 | 8 |
| | | | Total | 86 |

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

Added 2026-11-12 (PRD section 5.10, v0.4): FR-076 to FR-081 are in E-13 (S-242 to S-254); FR-082 to FR-086 are in E-14 (S-261 to S-269).
Added 2026-11-14 (PRD section 5.11, v0.5): FR-087 to FR-094 are in E-15 (S-300 to S-308).

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
| Navigation and new pages: a11y, 320/375 px, perf budgets, real-phone check of the menu (2026-11-12) | E-13 (S-254) |

## Unmapped
No FR is unmapped. NFRs are verified in E-12 and carried as acceptance criteria in the epics where they apply.

## Story numbering and open items (2026-11-10)
- Stories were written in parallel, so each epic got a pre-allocated block (E-01 S-001..020, E-02 021..040, E-03 041..060, E-04 061..080, E-05 081..110, E-06 111..130, E-07 131..150, E-08 151..170, E-09 171..185, E-10 186..205, E-11 206..220, E-12 221..240). Gaps are expected; new stories take the next free number after S-240.
- [x] RESOLVED 2026-11-11: S-034 (orders "to review" dot) — `admin/layout` loader adds `badges: { toReview }` (contracts.md v0.14, lead-backend + lead-frontend); story ready, in sprint 02.
- [x] ADDED 2026-11-11: S-241 "Load the Owner's real menu on staging" (E-03, 3 pts, ready, sprint 02) seeds the real menu from docs/content/menu-source/ (placeholder-priced cakes hidden at Rs 0). It covers the menu part of the E-03 sample data; gallery photos and promotions follow S-052..S-055 or E-12. Next free story number: S-242.
- [x] ADDED 2026-11-12: E-13 "Site navigation and brand pages" (13 stories, 45 pts; block S-242..S-260, used S-242..S-254, S-255..S-260 spare) from the Owner's 7-item navigation decisions, and E-14 "Bakery reviews" (9 stories, 31 pts; block S-261..S-275, used S-261..S-269, S-270..S-275 spare; depends on E-11 sign-in S-206, S-207, S-210). Next free story number: S-276 (now used, see below). E-13 overlaps E-04 S-064, S-069, S-070 and E-08 S-151 (see the epic's Overlaps section; notes added to those stories). E-13 is next after sprint 02 (see sprint-02.md).
- [x] ADDED 2026-11-13: S-276 "Responsive photo sizes" (E-04, 5 pts, in progress: built and on main; staging deploy, backfill and LCP check wait on GitHub Actions billing) from the S-063 AC6 / S-254 AC3 LCP finding: 480/960 px copies made at upload and by a staging-only backfill, served with `srcset`/`sizes` (migration 0011). Next free story number: S-277.
- S-204 (phone normalisation) may duplicate E-05 FR-021 work; drop if E-05 delivers it.
- Open product questions carried in story Notes: S-159 AC4 (decline after expiry before job runs), S-036 password change vs other sessions.
