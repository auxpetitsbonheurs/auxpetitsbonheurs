# E-11: Customer accounts

Status: planned · Milestone: MVP
PRD: FR-034, FR-035, FR-036, FR-037, FR-038 · Specs: docs/specs/features/customer-accounts.md
Release phase: 5 Notifications and accounts (part 2)

## Goal
Returning customers sign in, keep details and addresses, see My orders and reorder; guests are never forced to register.

## Success measure
J10: guest "Save my details" then confirm email, sign in, My orders shows prior orders with the same email, Reorder adds items at today's prices. Guest ordering still works with no account.

## Scope
- In: sign-up/in with password or one-time link, reset (FR-034, Must); profile and addresses (FR-035); My orders (FR-036); Reorder (FR-037); Save my details linking prior orders only after email confirmation (FR-038, README decision 1). Rate limits on signup and reset. A11y acceptance criteria on the forms.
- Out: admin accounts (E-01, E-02).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| (to be created by /create-stories E-11) | | draft | |

## Dependencies
- E-05, E-10 (sign-in and reset emails).

## Risks
- Account takeover via unconfirmed email linking; follow the confirmed-email rule.

## Cuttable (PRD section 11 cut order, after CSV export and Customers list)
- FR-037 Reorder: cut 3rd.
- FR-038 Save my details: cut 4th.
- FR-034..036 customer accounts as a whole (FR-035, FR-036 Should): cut 5th. FR-034 is Must per the PRD table; if accounts are cut, FR-034 needs a product-director decision.
