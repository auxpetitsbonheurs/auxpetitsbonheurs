# E-06: Order management

Status: planned · Milestone: MVP
PRD: FR-048, FR-049, FR-050, FR-051, FR-052, FR-053, FR-054 (NFR-013) · Specs: docs/specs/features/admin-orders.md
Release phase: 4 Order management (part 1)

## Goal
Admins run the day from a phone: Today, Orders with tabs and search, order detail, every action, edits, and a full activity log.

## Success measure
J4: Owner goes from alert to Approve to Completed and paid, each step logged. Two admins on the same order get "this order changed, reload". Today counts equal the underlying data.

## Scope
- In: Today (FR-048), Orders tabs/search/filters (FR-049), order detail with Maps, Call, WhatsApp buttons (FR-050), server-enforced transitions per Appendix B (FR-051), all actions (FR-052), edit with recalculation and "order updated" email trigger (FR-053), optimistic concurrency (FR-054), activity log display (data in E-01). Primary actions in the bottom half of a 375x667 viewport, targets >= 44 px. A11y acceptance criteria apply.
- Out: manual orders and calendar (E-07); the emails themselves (E-10).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| (to be created by /create-stories E-06) | | draft | |

## Dependencies
- E-01, E-02, E-05 (orders to manage).

## Risks
- Transition table drift between code, PRD and tests; derive tests from Appendix B.
