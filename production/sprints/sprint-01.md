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
- 2026-11-10: sprint planned. All 20 E-01 stories built test-first and code-reviewed (status review). Blocked on Owner keys: S-002 AC2/AC7 (first staging deploy + smoke), S-019 AC2/AC3 (CPU measurement), first real backup run. Keys: docs/runbooks/deploy-keys.md.

## Review (filled 2026-11-11, closed early: all work built)
- Completed: 64 committed pts + 2 stretch stories (S-019 3 pts, S-020 5 pts) built test-first and code-reviewed by agents in ~2 days (2026-11-10 → 2026-11-11). Staging is live and deploys from GitHub Actions (S-002 proven green).
- Status: all 20 E-01 stories stay `review` (S-019 `in-progress`: CPU measured, the follow-ups are tracked in tech-debt.md) until the Owner's phone test of the skeleton journey on staging; nothing is carried over as build work. The Owner's phone test is the sprint 01 exit and runs alongside sprint 02.
- Velocity: ~66 pts in ~2 agent-days. This is agent throughput, not founder hours, so it is not a pts-per-hour figure; the real limits are Owner review time and Owner-held keys. Sprint 02 plans on agent throughput and batches the Owner's checks.
- Follow-ups from the sprint:
  - Hyperdrive reverted: parameterised queries stalled through it; staging deploys without the binding by default (ADR-0003 amendment).
  - Worker CPU over the 10 ms free-plan limit on some requests: Owner accepted and monitors (risk T3, 2026-11-11); alert and re-measure before launch are in tech-debt.md.
  - Perf and UX fixes after the first staging use: Smart Placement, one-query catalogue reads, cached Settings, Server-Timing, one round trip per query, pending states on Add to basket / Place order, instant language switch.
  - Client-side basket (ADR-0004) in progress outside the sprint; it touches `basket.server.ts`, so sprint 02 menu stories that change product status (S-043) rebase on it.
  - Owner design change: Honey & cream identity (D4) applied across site and admin.
  - Owner menu source started (docs/content/menu-source/): cookies with box sizes, six cake flavours with Size 6/7/8 inch; prices pending. Loaded by S-241 in sprint 02.
- Notes → retrospective: estimates held (no story blew up); the blockers were all external (keys, Supabase pooler behaviour), so sprint 02 lists the keys it needs up front.
