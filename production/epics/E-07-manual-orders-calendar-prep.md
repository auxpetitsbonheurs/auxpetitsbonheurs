# E-07: Manual orders, calendar and prep list

Status: in progress · Milestone: MVP
PRD: FR-055, FR-056, FR-057, FR-058, FR-059, FR-060 · Specs: docs/specs/features/admin-manual-orders.md, admin-calendar-prep.md
Release phase: 4 Order management (part 2)

## Goal
The bakery records phone, WhatsApp and walk-in orders, sees the month at a glance, blocks days, and prints a prep list.

## Success measure
J6: a manual order for an existing customer shows Approved in the calendar and the prep list. Blocking a day disables it for customers immediately (J8). Two identical cakes show as one prep line with quantity 2.

## Scope
- In: Add order (FR-055), warnings and relaxed rules (FR-056), customer matching by phone/email (FR-057), calendar month/week/day (FR-058), single-day and range blocking with warning listing affected orders (FR-059), prep list grouped, shareable, printable (FR-060). A11y acceptance criteria apply, including a non-colour cue for delivery/pickup in the calendar.
- Out: Availability screen (E-03).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-131 | Add a manual order from menu products | ready | 5 |
| S-132 | Manual order free-text items, delivery fee and paid | ready | 3 |
| S-133 | Manual order finds the existing customer | ready | 3 |
| S-134 | Manual order warnings and relaxed availability rules | ready | 3 |
| S-135 | Manual order confirmation email only when appropriate | ready | 2 |
| S-136 | Calendar month view with order counts | done | 5 |
| S-137 | Calendar week and day lists | done | 3 |
| S-138 | Block and reopen a single day | done | 5 |
| S-139 | Prep list grouped by product and variant | done | 5 |
| S-140 | Share and print the prep list | done | 3 |

Total: 37 pts. Files: `production/stories/E-07/`.

## Dependencies
- E-03, E-05, E-06.

## Risks
- Status groups (active vs confirmed) must follow README decision 5.
