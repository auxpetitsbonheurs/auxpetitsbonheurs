# E-15: Workshop events and registration

Status: in progress (S-300..S-308 in review) · Milestone: post-MVP (Owner request 2026-11-14) · Added 2026-11-14
PRD: FR-087 to FR-094 (section 5.11) · Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md · Contract: contracts.md "Workshops (E-15)"
Builds on: E-13 S-249 (the Workshops page, its intro content and lead decision 2 "booking deferred", now decided), E-05 Juice payment (S-277..S-282), E-06 order management, E-10 outbox and alerts, E-11 accounts (prefill).

## Goal
The client runs occasional workshops (e.g. Valentine's: 10 cakes, 10 couples) end to end from the admin app: create and publish an event, take registrations online without ever overselling, accept or refuse them, get paid by Juice like orders, and close or cancel the event with refunds handled.

## Owner and client decisions (2026-11-14)
See the spec "Decisions". In short: one registration = cakes shared by up to 2 people; places = cakes; per-event cake options; approve then pay with the 12 h reminder and 24 h release; registrations are orders (ADR-0005); allergies are an explicit choice (None / Yes, please describe), shown to admins, never in admin alerts, cleared on anonymise; /workshops stays a browsing page.

## Scope
- In: events (admin), the list on /workshops, the event page and form, the never-oversell procedure, accept/refuse/pay/release, admin registrations and printable list, Workshop badge in Orders and Today, cancel and complete, emails EN/FR, admin alerts, privacy.
- Out: online card payment, waiting lists, automatic emails when an event's date changes (the admin uses WhatsApp; recorded for E-10), invoices (another job), recurring events.

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-300 | Workshop events data and the never-oversell registration | review | 5 |
| S-301 | Admin Workshops: create, edit, publish and unpublish an event | review | 5 |
| S-302 | /workshops lists the upcoming events | review | 3 |
| S-303 | Workshop page with the registration form | review | 5 |
| S-304 | Accept or refuse a registration; pay by Juice; reminder and release | review | 3 |
| S-305 | Event registrations, printable list and the Workshop badge | review | 3 |
| S-306 | Cancel an event (tell everyone, refunds) and mark it completed | review | 3 |
| S-307 | Workshop emails EN/FR and admin alerts | review | 3 |
| S-308 | Allergies privacy, accessibility and the registration journey | review | 3 |
| S-316 | Tell registrants when a workshop's date, time or place changes (tidy job) | review | 2 |

Total: 35 pts. Files: `production/stories/E-15/`. Story numbers S-300 to S-315 are reserved for this epic (S-309 to S-315 spare; S-283 and S-284 went to E-13 while this epic was built); next free number after the block: S-316.

Build order: S-300 → S-301 → S-302 → S-303 → S-304 → S-307 → S-305 → S-306 → S-308.

## Permissions
Owner and Admin: all of Workshops (like Promotions). Customers: register; their own registration on tracking and My orders.

## Risks
- Overselling under concurrency: one CALL under the event row lock, tested with parallel registrations.
- Health data (allergies) leaking into alerts or logs: kept out of alert payloads and templates by test; cleared on anonymise.
- Browsing page speed: /workshops gains no JavaScript (deferred hydration kept), images lazy with sizes.
- Overlap with the approvepay job (website orders to approve then pay): this epic uses its states and services (`approve-then-pay.server`); Accept is the shared `approve`.
