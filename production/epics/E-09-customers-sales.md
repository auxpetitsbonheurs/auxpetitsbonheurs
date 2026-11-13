# E-09: Customers and sales summary

Status: in progress · Milestone: MVP
PRD: FR-065, FR-068, FR-069 · Specs: docs/specs/features/admin-sales-customers.md
Release phase: 4 Order management (part 4)

## Goal
The Owner and admins see who orders and how the bakery is doing.

## Success measure
Sales totals match the underlying orders for every range; each customer's total spent equals their Completed orders.

## Scope
- In: Sales summary (FR-068, Must); Customers list, notes, totals (FR-065, Should); CSV export matching the screen (FR-069, Should). A11y acceptance criteria on tables.
- Out: customer account features (E-11).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-171 | Sales summary with periods, revenue, orders and average | done | 5 |
| S-172 | Sales breakdowns: delivery vs pickup, top 5, by source | done | 3 |
| S-173 | Unpaid orders list on the sales summary | done | 3 |
| S-174 | Customers list with order count and total spent (cuttable #2) | ready | 3 |
| S-175 | Search customers by name, phone or email (cuttable #2) | ready | 2 |
| S-176 | Customer detail with all their orders (cuttable #2) | ready | 3 |
| S-177 | Private note on a customer (cuttable #2) | ready | 2 |
| S-178 | Export the sales summary as CSV (cuttable #1) | done | 3 |
| S-179 | CSV safety, Excel encoding and access control (cuttable #1) | done | 2 |

Total: 26 pts. Files: `production/stories/E-09/`.

## Dependencies
- E-06, E-07.

## Risks
- Revenue definition: Completed orders, delivery fees included (owner decision 4).

## Cuttable (PRD section 11 cut order)
- FR-069 CSV export: cut 1st.
- FR-065 Customers list: cut 2nd.
- FR-068 Sales summary stays (Must).
