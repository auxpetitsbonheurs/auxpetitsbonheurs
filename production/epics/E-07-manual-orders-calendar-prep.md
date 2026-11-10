# E-07: Manual orders, calendar and prep list

Status: planned · Milestone: MVP
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
| (to be created by /create-stories E-07) | | draft | |

## Dependencies
- E-03, E-05, E-06.

## Risks
- Status groups (active vs confirmed) must follow README decision 5.
