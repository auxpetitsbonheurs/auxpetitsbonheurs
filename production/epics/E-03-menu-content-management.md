# E-03: Menu and content management

Status: planned · Milestone: MVP
PRD: FR-061, FR-062, FR-063, FR-064, FR-066, FR-067 · Specs: docs/specs/features/admin-menu-content.md, pricing-availability-promotions.md (promotion lifecycle)
Release phase: 2 Menu and content management

## Goal
The bakery manages products, promotions, gallery, availability rules and all site settings from a phone, with no developer.

## Success measure
Phase 2 exit: an admin creates a cake with sizes, flavours, add-ons and a message field from a phone in under 5 minutes. Sample data loaded: 8 products over 4 types, 12 gallery photos, 1 live and 1 scheduled promotion.

## Scope
- In: menu list, reorder, duplicate, hide, sold out (FR-061); product editor with EN/FR text, 1-5 photos shrunk before upload (FR-029 limits shared with E-08), option groups, seasonal dates, preview as customer (FR-062); renaming a product writes `product_slug_history` rows; promotions CRUD and automatic scheduling (FR-063); gallery upload and tagging (FR-064); Availability, Owner only (FR-066); Settings, Owner only, including FAQ and policies with cancellation and storage text (FR-067). A11y acceptance criteria on the product editor and drag-reorder (keyboard alternative).
- Out: customer-facing display and price rules (E-04, E-05).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| (to be created by /create-stories E-03) | | draft | |

## Dependencies
- E-01, E-02 (roles for Owner-only screens).

## Risks
- Phone-first editor complexity (option groups); time-box against the 5-minute criterion.
- Free storage limit: 1 GB photos, 300 kB target (NFR-009).
