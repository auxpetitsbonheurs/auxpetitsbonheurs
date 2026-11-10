# Sprint 01

Dates: 2026-11-11 → 2026-11-24 (2 weeks) · Capacity: no velocity yet; agent-driven build, owner reviews. Guess: ~75 pts available.
Milestone: MVP (E-01 walking skeleton) · Goal: on staging, a guest places an order (APB-0001 + tracking link, double tap = one order), the Owner signs in on a phone and approves it, and the tracking page shows Approved.

## Committed
| Story | Title | Estimate | Owner | Status |
|---|---|---|---|---|
| S-001 | CI pipeline with lint, types, tests, build and JS budget | 3 | devops-lead, test-engineer | ready |
| S-002 | Staging and production deploy pipeline | 3 | hosting-platform-specialist, devops-lead | ready |
| S-003 | Typed environment and per-request database connection | 3 | remix-specialist, postgres-specialist | ready |
| S-004 | Initial migration 0000 with slug history, plus launch seed | 5 | postgres-specialist, data-engineer | ready |
| S-005 | End-to-end and accessibility test harness | 3 | test-engineer | ready |
| S-006 | EN/FR text system, Mauritius time and Rs formatting | 5 | i18n-specialist, remix-specialist | ready |
| S-007 | Accessible page shell and design tokens | 3 | tailwind-shadcn-specialist, accessibility-specialist | ready |
| S-008 | Language switch and remembered language | 3 | i18n-specialist, remix-specialist | ready |
| S-009 | Admin sign-in with email and password | 5 | auth-specialist, remix-specialist, ui-engineer | ready |
| S-010 | Seed the first Owner account | 2 | auth-specialist, postgres-specialist | ready |
| S-011 | Open the sample cake and add it to the basket | 5 | remix-specialist, ui-engineer, tailwind-shadcn-specialist | ready |
| S-012 | Review the basket and choose delivery or pickup | 3 | ui-engineer, tailwind-shadcn-specialist, accessibility-specialist | ready |
| S-013 | Place an order as a guest | 5 | remix-specialist, api-engineer, postgres-specialist, ui-engineer | ready |
| S-014 | Double tap creates one order, numbers never skip | 3 | api-engineer, postgres-specialist, test-engineer | ready |
| S-015 | Order confirmation page | 2 | ui-engineer, remix-specialist | ready |
| S-016 | Follow an order on the tracking page | 3 | remix-specialist, ui-engineer, api-engineer | ready |
| S-017 | See new orders and approve one from the phone | 5 | remix-specialist, api-engineer, ui-engineer, postgres-specialist | ready |
| S-018 | Order activity log and the end-to-end skeleton journey | 3 | api-engineer, ui-engineer, test-engineer | ready |
Total: 64 pts of ~75 (≈80%; slack kept for bugs and surprises)

## Stretch
| Story | Title | Estimate |
|---|---|---|
| S-019 | Measure Worker CPU time on staging (risk T3) | 3 |
| S-020 | Weekly backup skeleton, keep-alive and health check | 5 |

## Build order
S-001 → S-003 → S-004/S-010 → S-005 → S-006 → S-007 → S-008 → S-011 → S-012 → S-013 → S-014 → S-015 → S-016 → S-009 → S-017 → S-018 → S-002 (pipeline config in code; first real deploy needs the Owner's keys) → S-019 → S-020.

## Decisions (producer, 2026-11-10)
- 2-week sprint; no velocity yet, so capacity is a guess (~1 pt per 2–3 h equivalent) and is re-based at sprint review.
- S-019 (CPU on staging) and S-020 (backup/keep-alive) are stretch: both need a live staging deploy, which waits on account keys from the Owner. Their code and docs can still be prepared.
- Everything that runs locally (CI, migration SQL, slice, tests) is built against a local Postgres / mocks; no shared database is migrated by agents.

## Risks / dependencies
- T3 Worker 10 ms CPU limit — mitigation: S-019 measures as soon as staging is up; Owner decides on Workers Paid if it fails.
- Staging deploy blocked on keys (Cloudflare API token, Supabase URL/keys, DB URL) — mitigation: list exactly which keys go where when we reach S-002.
- Staging is not public-ready before E-05 (no Turnstile / order rate limit yet).

## Daily log
- 2026-11-10: sprint planned.

## Review (filled at sprint end)
- Completed: — · Carried over: —
- Velocity: —
