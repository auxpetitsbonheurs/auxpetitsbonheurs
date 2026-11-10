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
| (to be created by /create-stories E-01) | | draft | |

## Dependencies
- Docs: ADR-0001, architecture.md, data-model.md, contracts.md v0.4.
- External accounts and domain/staging hostnames under the bakery email.

## Risks
- T3: Worker 10 ms CPU limit on the free plan; check early, decision belongs to the Owner.
- Scope creep in the slice; keep it minimal and let later epics widen it.
