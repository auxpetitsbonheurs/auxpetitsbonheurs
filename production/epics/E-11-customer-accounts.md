# E-11: Customer accounts

Status: in progress · Milestone: MVP
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
| S-206 | Sign up with email confirmation, then choose a password | review | 5 |
| S-207 | Sign in with my password and sign out safely | review | 5 |
| S-208 | Sign in with a one-time email link | review | 3 |
| S-209 | Reset a forgotten password | review | 3 |
| S-210 | Keep my profile and email language up to date | review | 3 |
| S-211 | Save, edit and delete my delivery addresses | ready | 3 |
| S-212 | Checkout prefills my details and offers my saved addresses | ready | 3 |
| S-213 | See my current and past orders with their status | in-progress | 3 |
| S-214 | Reorder a past order at today's prices (cut #3) | ready | 5 |
| S-215 | Offer "Save my details" after a guest order (cut #4) | review | 3 |
| S-216 | Earlier guest orders appear only after I confirm my email (cut #4) | review | 5 |
| S-217 | Count account usage without tracking anyone | in-progress | 2 |
| S-218 | Account screens pass an accessibility and language sweep | ready | 3 |
| S-219 | Journey J10 works end to end | ready | 3 |

Total: 49 pts. Story files: `production/stories/E-11/`. Cut order: S-214 (#3), S-215/S-216 (#4), S-206..S-213 (#5; FR-034 is Must so cutting S-206..S-209 needs a product-director decision). Dependencies on earlier epics (R9) not yet done.

## Dependencies
- E-05, E-10 (sign-in and reset emails).

- E-14 Bakery reviews (added 2026-11-12) builds on S-206, S-207 and S-210 (sign-in and the profile name); cutting accounts cuts reviews.

## Risks
- Account takeover via unconfirmed email linking; follow the confirmed-email rule.

## Cuttable (PRD section 11 cut order, after CSV export and Customers list)
- FR-037 Reorder: cut 3rd.
- FR-038 Save my details: cut 4th.
- FR-034..036 customer accounts as a whole (FR-035, FR-036 Should): cut 5th. FR-034 is Must per the PRD table; if accounts are cut, FR-034 needs a product-director decision.
