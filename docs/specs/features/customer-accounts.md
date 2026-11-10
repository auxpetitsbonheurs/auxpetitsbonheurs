<!-- Template: feature-spec | Filled by: /feature-spec (product-manager, ux-lead, lead-backend, lead-frontend) | Output: docs/specs/features/customer-accounts.md -->
# Feature Spec — Customer accounts

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 (Supabase Auth, cookies via `@supabase/ssr`) · Epic: TBD (assigned by `/create-epics`; Phase 3 customer site, journey J10)
Sources: `docs/product/prd.md` §5.5 + FR-021, FR-001; `docs/architecture/api/contracts.md` ("Customer accounts", webhook `/hooks/supabase/send-email`); `docs/architecture/data-model.md` (`customer`, `customer_address`, `orders`).

## Summary
Accounts are optional. A customer can sign up or sign in with email and password or a one-time email link, reset a forgotten password, keep a profile and saved addresses, see My orders, reorder at today's prices, and, right after a guest order, tap "Save my details" to create an account that picks up every earlier order made with the same email. Nobody needs an account to order (FR-034); accounts only make repeat orders faster.

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-034 | Sign up/in with password or one-time link; reset; account optional | UX (auth screens), API (`sign-in`, `sign-up`, `reset`, `auth/confirm`), AC1-AC10 |
| FR-035 | Profile, saved addresses, email language | UX (profile, addresses), API (`profile`, `addresses`), AC11-AC15 |
| FR-036 | My orders: current and past with status | UX (orders), API (`account/orders` loader), AC16-AC18 |
| FR-037 | Reorder at today's prices, skip unavailable with note | API (`reorder`), AC19-AC22 |
| FR-038 | "Save my details" after guest order links past orders by email | UX (confirmation), API (`save-details`), AC23-AC27 |
| FR-039 | Customer account cannot open admin pages or data | Permissions, AC28 |
| FR-021 (link) | Signed-in customers get details and saved addresses prefilled at checkout | UX (checkout prefill), AC14 |
| FR-001 (link) | Email language stored; account email language follows the profile | Profile, AC15 |
| FR-070 (link) | Sign-in link and password reset emails EN/FR | See `notifications.md` (auth emails via webhook) |

## UX
### Screens & states
| Screen | Route (EN; `/fr/...` mirrors) | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Sign in | `/account/sign-in?next=` | Server-rendered; button loading | n/a | Field errors; "Email or password is wrong" (generic); `RATE_LIMITED` "Too many tries, wait {n} min" | Redirect to `next` (default `/account`) |
| Magic link tab | same page | Button loading | n/a | Validation only | "If this email can sign in, a link is on its way" (always, no enumeration), resend after 60 s |
| Sign up | `/account/sign-up` | same | n/a | Field errors (password min 10, phone, email) | "Check your email to confirm" (also shown for an email already in use, with a sign-in email instead) |
| Forgot / set password | `/account/reset` | same | n/a | Link expired: "This link has expired, request a new one" | "Password updated" then `/account` |
| Link landing | `/auth/confirm?token_hash&type&next` | Brief "Signing you in" | n/a | Invalid/expired: page with "Request a new link" | Redirect to `next` |
| Profile | `/account` | Skeleton | n/a | Field errors; save failed with retry | Toast "Saved"; language switch applies at once |
| Addresses | `/account/addresses` | Skeleton | "No saved addresses yet" + Add address | Field errors | List with default marker; add/edit/delete via drawer |
| My orders | `/account/orders` | Skeleton cards | "You have no orders yet" + Order now | Retry | Sections Current and Past: number, date, window, total, status chip, Track and Reorder |
| Save my details | `/account/save-details?t=` | Server-rendered | n/a | Weak password; `EMAIL_IN_USE` offers sign-in | Redirect to `/account/orders` after link confirmed (see rules) |
| Sign out | POST `/account/sign-out` | n/a | n/a | n/a | Redirect `/` |

### Flow
- **Guest order → Save my details.** Confirmation page shows a card "Save your details for next time" (only if `offerSaveDetails`: no account on that email). Tap opens save-details with the tracking token; the customer picks a password (min 10); an account is created for the order's email; a confirmation email is sent; once confirmed, the customer row gets `auth_user_id` and My orders lists every order on that customer (same email). The order just placed is visible immediately.
- **Sign in to order.** Top bar shows an account icon (signed out: Sign in; signed in: Account). Checkout is never gated. Signed-in checkout prefills name, phone, email, and offers saved addresses (radio list) with a "Save this address" checkbox.
- **Reorder.** From a past order, Reorder rebuilds the basket from the order's items with the same options, at today's prices and promotions; items that are sold out, hidden, out of season, or whose option choice no longer exists are skipped and listed in a note on the basket ("Skipped: Vanilla cake (sold out)"). The customer then picks a new date at checkout.
- **Language.** Profile language sets `customer.locale` (used for account emails and as default order language when they check out on a page in that language; the order stores the page language, FR-001).

### Copy
All strings in EN and FR via i18n. Generic messages must not reveal whether an email has an account: sign-in failure, magic link sent, reset sent, sign-up with an existing email. Password rule hint: "At least 10 characters".

## API Contract
Contract of record: `docs/architecture/api/contracts.md` "Customer accounts". Operations by name:
| Operation | Module / intent | Input | Output | Errors | Auth |
|---|---|---|---|---|---|
| Sign in (password) | `account/sign-in` `password` | email, password, turnstileToken | redirect `next` | `VALIDATION_FAILED`, `RATE_LIMITED`, `BOT_CHECK_FAILED`; wrong creds = generic message (`UNAUTHENTICATED` on fetcher) | public |
| Magic link | `account/sign-in` `magicLink` | email, turnstileToken | `{ ok }` always | `RATE_LIMITED` | public |
| Sign up | `account/sign-up` `signUp` | name, email, phone, password ≥ 10, locale, turnstileToken | `{ ok }` | `VALIDATION_FAILED`, `RATE_LIMITED` (RL-signup); `EMAIL_IN_USE` shown as generic success | public |
| Request reset / set password | `account/reset` | email+TS / password | `{ ok }` / redirect `/account` | `RATE_LIMITED`, `VALIDATION_FAILED` | public / recovery session |
| Confirm link | `auth/confirm` | token_hash, type, next | cookies + redirect (`next` restricted to same-origin paths) | invalid → landing error | public |
| Profile | `account/profile` `updateProfile` | name, phone (normalised +230), locale | ok | `VALIDATION_FAILED` | customer |
| Addresses | `account/addresses` add/update/delete | label, address, landmark?, isDefault | ok | `VALIDATION_FAILED`, `NOT_FOUND` (other customer's id) | customer |
| My orders | `account/orders` loader | none | current, past, trackingUrls | n/a | customer |
| Reorder | `account/orders` `reorder` | orderId | redirect `/basket` + flash `skipped[]` | `NOT_FOUND` (not own order), `BASKET_FULL` | customer |
| Save details | `account/save-details` `saveDetails` | trackingToken, password ≥ 10, TS | redirect `/account/orders` | `EMAIL_IN_USE`, `NOT_FOUND`, `RATE_LIMITED`, `BOT_CHECK_FAILED` | token |
| Sign out | `account/sign-out` | none | redirect `/` | n/a | customer |
Sign-in and recovery emails are produced by the Supabase Send Email hook (`/hooks/supabase/send-email`), see `notifications.md`.

## Data Model Changes
No new tables. Uses `customer` (`auth_user_id`, `locale`, `email` partial unique, `phone`), `customer_address`, `orders.customer_id`. Rules:
- Sign-up matches an existing guest `customer` by lower-cased email; on email confirmation sets `auth_user_id` on that row (else creates the row). One auth user is either a customer or an admin, never both (checked at sign-up).
- Phone, address edits on the account change the `customer` row only. Existing orders keep their snapshot (FR-012 spirit; `contact_*` are snapshots).
- Deleting an address never affects past orders (address copied onto the order).
- Account deletion/erasure is an Owner-triggered anonymise action (data-model.md retention), not self-service in v1.

## Permissions matrix
| Action | Anonymous | Customer (own) | Admin | Owner |
|---|---|---|---|---|
| Sign up / sign in / request link or reset | ✓ (rate-limited, Turnstile) | n/a | n/a (admins use `/admin/login`) | n/a |
| View/edit own profile, addresses | ✗ | ✓ | ✗ (no customer session) | ✗ |
| View own orders, reorder | ✗ | ✓ own only | ✗ | ✗ |
| Open any `/admin/*` page or data | ✗ | ✗ (redirect to `/admin/login`, no data) | ✓ | ✓ |
| Use a tracking link of any order | ✓ (token) | ✓ | ✓ | ✓ |
An email that belongs to an active or inactive admin cannot create a customer account (`EMAIL_IN_USE`, shown generically).

## Analytics Events
Server-side counts only, no PII, no cookies (NFR-011).
| Event | Trigger | Properties |
|---|---|---|
| account_created | email confirmed | method: signup \| save_details, linkedOrders |
| sign_in | success | method: password \| magic_link |
| save_details_shown / save_details_completed | confirmation page / completed | none |
| reorder_started | reorder action | skippedCount |
| address_saved | add address | atCheckout: boolean |

## Edge Cases
- Sign up with an email that already has an account: no leak; the real owner gets a "sign-in" email instead of a confirmation.
- Sign up with an email that has guest orders: after confirmation those orders appear; before confirmation they do not (see rule below).
- Save my details when the tracking token is wrong/unknown: `NOT_FOUND`; when the order has no email (manual order): the card is not offered.
- Magic link opened on another device or after 1 hour: fails with "request a new link". Link used twice: second use fails.
- Reset link expired: clear message, one-tap request. Reset does not reveal whether the email exists.
- Rate limits: sign-in/link/reset 5 per 15 min per email+IP; sign-up 3 per hour per IP. Message is the same as for a wrong password with a wait time.
- `next` parameter containing an external URL or `//host` is ignored (open-redirect guard).
- Reorder: product deleted (product_id NULL), manual free-text lines (no product) are skipped with a note; promotion since ended gives the full price; basket over 10 lines stops at 10 and notes the rest as skipped (`BASKET_FULL`).
- Reorder when every line is skipped: basket stays as it was, flash says nothing could be added, WhatsApp link offered.
- Customer changes email: out of v1 (email is the identity). Phone change applies to future orders only.
- Customer with two guest customer rows (same phone, different email): not merged in v1.
- Concurrency: two sessions editing addresses: last write wins; default flag is unique per customer (setting a new default clears the old in one transaction).
- Session expiry: customer sessions refresh via Supabase; expired session on a customer page redirects to sign-in with `next`.
- Guest tracking pages keep working for signed-in users and vice versa.

## Acceptance Criteria
- AC1: Given a guest with an empty account state, when they place an order, then it succeeds without sign-in.
- AC2: Given a confirmed account, when signing in with the right password, then they land on `next` or `/account`.
- AC3: Given a wrong password or unknown email, then the same generic error appears and no account existence is revealed.
- AC4: Given any email, when requesting a magic link, then the response is the same success message; if the account exists a sign-in email arrives in the account language.
- AC5: Given a magic link, when opened within its validity, then the customer is signed in; given reuse or expiry, then it fails with a request-new-link page.
- AC6: Given a new email, when signing up with a 10+ character password, then a confirmation email arrives and the account is active only after confirming.
- AC7: Given a password of 9 characters, then `VALIDATION_FAILED` with a field message.
- AC8: Given an email already used, when signing up, then the page looks identical to success and no duplicate account exists.
- AC9: Given the reset flow, when a new password is set from a valid link, then the old password stops working and the customer lands on `/account`.
- AC10: Given 6 sign-in attempts in 15 minutes for one email and IP, then the 6th returns `RATE_LIMITED` with `Retry-After`.
- AC11: Given a signed-in customer, when saving a profile with phone "5712 3456", then it is stored as +23057123456.
- AC12: Given a saved address marked default, then checkout offers it preselected for delivery.
- AC13: Given deleting an address used on past orders, then those orders still show their address.
- AC14: Given a signed-in customer, then checkout prefills name, phone, email; guests see empty fields.
- AC15: Given language set to FR in the profile, then account emails arrive in French; an order placed from an EN page still stores locale en.
- AC16: Given a customer with 3 orders, then My orders lists all three with the current status, Current and Past separated (completed, declined, cancelled, closed are Past).
- AC17: Given another customer's order id, when calling `reorder`, then `NOT_FOUND`.
- AC18: Given no orders, then the empty state with an Order now button.
- AC19: Given a past order containing one sold-out item and two available items whose prices have changed, when Reorder is tapped, then the basket has the two items at today's prices and a note names the skipped item.
- AC20: Given an item that was on promotion at purchase and the promotion has ended, then the reorder price is the full price.
- AC21: Given a past order with a deleted option choice, then that line is skipped with a note.
- AC22: Given all items unavailable, then the basket is unchanged and the note says so.
- AC23: Given a guest order with email e, when Save my details is completed, then an account exists for e and, after email confirmation, all earlier orders with e appear in My orders.
- AC24: Given the order just placed, then it is visible in My orders right after saving, before other past orders are linked.
- AC25: Given `EMAIL_IN_USE`, then the page offers sign-in instead of creating anything.
- AC26: Given a manual order without email, then Save my details is not offered.
- AC27: Given a wrong tracking token, then `NOT_FOUND`.
- AC28: Given a customer session, when opening `/admin` or calling an admin action, then it is refused and returns no data (FR-039).

## Non-functional
- Performance: account routes server-rendered within project.yaml budgets; auth actions p95 ≤ 600 ms excluding email delivery.
- Accessibility: WCAG 2.2 AA; labelled fields, `autocomplete` (`email`, `current-password`, `new-password`, `tel`, `street-address`), password show/hide toggle with accessible name, errors via `aria-describedby`, no CAPTCHA puzzles (Turnstile invisible/managed).
- Security: Supabase Auth; Turnstile and rate limits on every auth action; password min 10; no account enumeration; cookies HttpOnly, Secure, SameSite=Lax; authorisation by `auth_user_id` on every account read; `next` same-origin only; order lookup for reorder checks ownership.
- Privacy: stores name, email, phone, addresses; the privacy note explains this; Owner-triggered erase within 30 days (data-model.md); no tracking cookies.

## Rollout / flags
Flag: none · Rollout: launch (accounts are Should, can be hidden by removing the top-bar link without a data change) · Rollback: redeploy; no destructive data changes.

## Open Questions
- Is a confirmation email required before a sign-up account becomes usable? Assumed yes (needed to link past orders safely) — owner product-director.
- Should a signed-in customer's orders placed as guest under a different email be linkable by phone? Assumed no in v1.
- Does the owner want "Save my details" also on the tracking page (not only the confirmation)? Assumed confirmation page only.

## Open contract changes (applied 2026-11-10)
1. `account/save-details`: linking all earlier orders (setting `auth_user_id` on the existing customer row) must happen only after the email is confirmed (`auth/confirm` type=signup), to stop someone placing a guest order with another person's email and then reading that person's history. Until then the order identified by the tracking token is shown. Contract currently says the redirect lists all linked orders immediately. — **Resolved in contracts.md (2026-11-10).** Security fix: `saveDetails` creates an unconfirmed user only; linking happens in `auth/confirm` type=signup.
2. `account/addresses`: give an explicit path `/account/addresses` (the row has none) and an `isDefault` uniqueness rule. — **Resolved in contracts.md (2026-11-10).**
3. `account/orders` `reorder`: define the flash shape `{ skipped: { name: Localized, reason: "sold_out" | "hidden" | "out_of_season" | "option_removed" | "free_text" | "basket_full" }[] }` and a basket loader field to show it. — **Resolved in contracts.md (2026-11-10).**
4. `account/sign-in` `magicLink`: call Supabase with `shouldCreateUser: false` so unknown emails do not create accounts. — **Resolved in contracts.md (2026-11-10).**
