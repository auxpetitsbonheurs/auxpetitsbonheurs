# UX Flow — Customer account (save details, sign in, My orders, Reorder)

PRD: FR-021, 034..039 · Journey: J10 (also J12) · Spec: `customer-accounts` · Persona: P1 returning customer · Critical journey: no · Updated: 2026-11-10

## Goal
Optional convenience: faster repeat orders. Success = confirmed account, past orders listed, Reorder fills the basket at today's prices. No one ever needs an account to order.

## Entry points
- "Save my details" on `/order/:token/confirmed` (FR-038; confirmation page only, Q20) leading to `/account/save-details?t=<token>`.
- Top-bar account icon: Sign in (`/account/sign-in?next=`), Sign up (`/account/sign-up`), Reset (`/account/reset`).
- Emails: confirmation link and magic link both land at `/auth/confirm`.

## Happy path
```mermaid
flowchart TD
  A[Confirmation page] --> B[Save my details: confirm, no password]
  B --> C[Check your email]
  C --> D[/auth/confirm type=signup]
  D --> E[Account active + past orders with same email linked]
  E --> P[Choose a password /account/reset?mode=new]
  P --> F[/account/orders]
  F --> G[Reorder]
  G --> H[/basket with note about skipped items]
  I[Later visit] --> J{Sign in}
  J -->|password| F
  J -->|magic link| K[Email link] --> D2[/auth/confirm magiclink] --> F
  J -->|forgot| L[/account/reset] --> M[Email] --> N[Set new password] --> F
```
| # | Screen | Action | System response |
|---|---|---|---|
| 1 | Save details | Email/name shown read-only; tap "Save my details" (no password here) | Unconfirmed account created; "Check your email" (no history shown yet, security decision) |
| 2 | Email | Tap confirm link | `/auth/confirm` verifies, signs in, links earlier orders with that email, opens "Choose a password" |
| 2b | Choose a password | Enter password (min 10), or "Skip, I'll use email links" | Password saved; redirect `/account/orders`. The password is set only after the email is confirmed, so nobody can pre-set it (threat-model G-01). Sign-up follows the same steps 2–2b |
| 3 | `/account/orders` | View Current / Past with status and tracking link | OrderSummary list |
| 4 | same | Reorder | Items added at current prices; redirect `/basket`; skipped items listed with reason |
| 5 | `/account`, `/account/addresses` | Edit profile, language, add/delete addresses, one default | Checkout prefills contact and addresses |
| 6 | Sign out | POST | Redirect `/` |

## Alternative and error paths
| Trigger | What the user sees | Recovery |
|---|---|---|
| Weak/short password | Inline "At least 10 characters" | Fix |
| Email already has account | Generic "Check your email" (no enumeration); email offers sign in | Sign in |
| Confirmation link expired/used | "This link no longer works" + resend | Request a new one from sign-in |
| Wrong email or password | "Email or password is incorrect" (generic) | Retry, magic link, reset |
| Magic link for unknown email | Same "Check your email" (never creates accounts) | None |
| Unconfirmed account signs in | "Please confirm your email first" + resend | Resend |
| Rate limit / bot check | "Too many tries, wait a minute" | Wait |
| Signed out opening `/account/*` | Redirect to sign-in with `next` | Return after sign-in |
| Customer opens `/admin` | Redirected to `/admin/login`; session untouched | Admin must use admin credentials |
| Reorder item sold out/hidden/out of season/option removed/free text/basket full | Basket banner: "Not added: Name (reason)", others added | Pick replacements |
| Empty My orders | "No orders yet" + See the menu | Menu |
| Another customer's order id | `NOT_FOUND` | None |
| Network error | Retry message, form kept | Retry |

## States per screen
Loading: skeleton list; spinner on Reorder. Empty: no orders, no addresses ("Add your first address"). Permission: customer session required except sign-in/up/reset/confirm.

## EN/FR notes
Auth emails (confirm, magic link, reset) follow the saved locale; the sign-in page language follows the site switch. Profile has an email-language field.

## Accessibility notes
Password field with show/hide toggle (button, labelled), `autocomplete` attributes (`new-password`, `current-password`, `email`); "Check your email" is a status region and gets focus; Reorder result announced via basket notice live region.

## Analytics events
account_save_started, account_confirmed, sign_in_method (password|magic), reorder_used (counts).

## Open questions
- None; owner Q20 assumption (confirmation page only) stands.
