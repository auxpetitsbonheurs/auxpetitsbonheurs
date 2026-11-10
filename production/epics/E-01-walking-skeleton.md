# E-01: Walking skeleton

Status: planned · Milestone: MVP
PRD: FR-001, FR-023, FR-024, FR-040, FR-045 (NFR-001, 002, 005, 007, 008, 009, 012, 013 foundations) · Specs: docs/specs/features/checkout-and-tracking.md, notifications.md (outbox), admin-access-team.md (sign-in), admin-orders.md (approve)
Release phase: 1 Foundations (part 1)

## Goal
A customer places a basic order on staging and an admin approves it, end to end, on a deployed pipeline. Everything the later epics build on exists: deploy, database, auth, i18n, time and money formats.

## Success measure
On staging: a guest sends an order (gets APB-0001 and a tracking token, double submit creates one order), the Owner signs in on a phone and approves it, the order event log shows both steps, and the customer sees Approved on the tracking link. Worker CPU measured on staging (see below).

## Scope
- In:
  - Accounts under the bakery email, staging and live environments, auto-deploy on merge, README started (NFR-012).
  - Drizzle schema and migration 0000 for the 24 tables per data-model.md, including `product_slug_history`, added to the Drizzle schema before the first `drizzle-kit generate` (design gate concern).
  - Auth shell: admin email + password sign-in, 30-day session, Owner seed (FR-040); roles are fully enforced in E-02.
  - EN/FR text system with EN fallback, Mauritius time and Rs formatting (FR-001, NFR-007, NFR-008). Language switch, stored on the order.
  - Vertical slice: a minimal menu item, minimal one-page checkout, idempotent submit (FR-023), sequential number and long random token (FR-024), order event written (FR-045), admin Approve action on a minimal order screen, minimal tracking page.
  - Worker CPU check (risk T3): measure CPU time on staging for the slice's hot paths (checkout submit, price calculation, tracking page); record the numbers against the 10 ms free-plan limit. If it fails, the Owner decides on Workers Paid ($5/month), which would break NFR-009.
  - Accessibility acceptance criteria on the first UI stories: full keyboard use, 200% zoom, contrast per tokens.json, usable at 320 and 375 px, tap targets >= 44 px, labels on every field. Known prototype defects (stepper labels, aria-label copies) must not carry over.
  - Backup job skeleton and keep-alive check if a free service pauses (NFR-005); full restore test is in E-12.
- Out: full pricing/availability rules (E-05), full order management (E-06), emails beyond a stub in the outbox (E-10), invitations and role screens (E-02).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| [S-001](../stories/E-01/S-001-ci-pipeline.md) | CI pipeline with lint, types, tests, build and JS budget | ready | 3 |
| [S-002](../stories/E-01/S-002-deploy-pipeline.md) | Staging and production deploy pipeline | ready | 3 |
| [S-003](../stories/E-01/S-003-typed-env-and-database-connection.md) | Typed environment and per-request database connection | ready | 3 |
| [S-004](../stories/E-01/S-004-initial-migration-and-seed.md) | Initial migration 0000 with slug history, plus launch seed | ready | 5 |
| [S-005](../stories/E-01/S-005-test-and-a11y-harness.md) | End-to-end and accessibility test harness | ready | 3 |
| [S-006](../stories/E-01/S-006-text-system-time-and-rupees.md) | EN/FR text system, Mauritius time and Rs formatting | ready | 5 |
| [S-007](../stories/E-01/S-007-accessible-page-shell.md) | Accessible page shell and design tokens | ready | 3 |
| [S-008](../stories/E-01/S-008-language-switch.md) | Language switch and remembered language | ready | 3 |
| [S-009](../stories/E-01/S-009-admin-sign-in.md) | Admin sign-in with email and password | ready | 5 |
| [S-010](../stories/E-01/S-010-owner-seed.md) | Seed the first Owner account | ready | 2 |
| [S-011](../stories/E-01/S-011-product-page-add-to-basket.md) | Open the sample cake and add it to the basket | ready | 5 |
| [S-012](../stories/E-01/S-012-basket-delivery-pickup.md) | Review the basket and choose delivery or pickup | ready | 3 |
| [S-013](../stories/E-01/S-013-place-order.md) | Place an order as a guest | ready | 5 |
| [S-014](../stories/E-01/S-014-idempotent-submit-gap-free-numbers.md) | Double tap creates one order, numbers never skip | ready | 3 |
| [S-015](../stories/E-01/S-015-order-confirmation.md) | Order confirmation page | ready | 2 |
| [S-016](../stories/E-01/S-016-order-tracking.md) | Follow an order on the tracking page | ready | 3 |
| [S-017](../stories/E-01/S-017-admin-orders-approve.md) | See new orders and approve one from the phone | ready | 5 |
| [S-018](../stories/E-01/S-018-order-activity-log.md) | Order activity log and the end-to-end skeleton journey | ready | 3 |
| [S-019](../stories/E-01/S-019-worker-cpu-measurement.md) | Measure Worker CPU time on staging (risk T3) | ready | 3 |
| [S-020](../stories/E-01/S-020-backup-keepalive-health.md) | Weekly backup skeleton, keep-alive and health check | ready | 5 |

Total: 72 points (S-001..S-020). Dependencies are listed in each story's Notes and all sit inside E-01 (sprint 1).

## Dependencies
- Docs: ADR-0001, architecture.md, data-model.md, contracts.md v0.4.
- External accounts and domain/staging hostnames under the bakery email.

## Risks
- T3: Worker 10 ms CPU limit on the free plan; check early, decision belongs to the Owner.
- Scope creep in the slice; keep it minimal and let later epics widen it.
