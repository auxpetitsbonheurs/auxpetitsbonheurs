# E-06: Order management

Status: done · Milestone: MVP
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
| S-111 | Orders list with tabs, counts and Load more | done | 3 |
| S-112 | Search and filter orders | done | 3 |
| S-113 | Order detail with Maps, Call and WhatsApp | done | 3 |
| S-114 | Private note autosave and reference photos on the order | done | 2 |
| S-115 | Status transitions enforced on the server per Appendix B | done | 3 |
| S-116 | Approve or decline an order | done | 3 |
| S-117 | Move an order forward or back one step | done | 3 |
| S-118 | Send a quote for a custom request (admin side) | done | 3 |
| S-119 | Mark paid or unpaid and cancel an order | done | 3 |
| S-120 | Today screen with counts and today/tomorrow orders | done | 3 |
| S-121 | One-tap next status on Today with Undo | done | 3 |
| S-122 | Edit an order with recalculated total or manual override | done | 5 |
| S-123 | Edit warnings and the "Your order was updated" email trigger | done | 3 |
| S-124 | Two admins on one order get "this order changed, reload" | done | 3 |
| S-125 | Activity log on the order | done | 2 |
| S-126 | One-handed admin layout and accessibility pass | done | 2 |
| S-127 | Download an invoice PDF for any order, matching the client's template | done | 5 |

Total: 47 pts. Files: `production/stories/E-06/`.

## Dependencies
- E-01, E-02, E-05 (orders to manage).

## Risks
- Transition table drift between code, PRD and tests; derive tests from Appendix B.
