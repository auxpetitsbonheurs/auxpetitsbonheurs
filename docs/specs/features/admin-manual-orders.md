<!-- Template: feature-spec | Filled by: /feature-spec (product-manager) | Output: docs/specs/features/admin-manual-orders.md -->
# Feature Spec — Admin manual orders (phone, WhatsApp and walk-in orders)

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 (stack) · Epic: E-admin-orders (to be created by /create-epics)
Sources: PRD v0.2 FR-055..057 and Appendix B, build-brief "Add order (manual)" and Business rules, design-system "Manual order", data-model `orders`, `order_item`, `customer`, API contract `admin/order-new`, `admin/order-edit`. Edit screen shares this form (see admin-orders.md).

## Summary
Sabera or a helper enters an order that arrived by phone, WhatsApp or in person. They pick products and options or type a free-text item with a price, find the customer by phone or email so no duplicate is created, set date, window, delivery or pickup, adjust the delivery fee, mark paid, and save. The order is created directly as Approved with source manual, so it appears in the calendar and prep list at once.

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-055 | Products/options or free-text item; name, phone, optional email, date, window, fulfilment, editable fee, paid; saves Approved, source manual | UX, API `create`, AC1-AC8 |
| FR-056 | Ignores availability rules but warns if blocked or too soon; past dates allowed (owner Q9); sold-out products allowed with a warning (Q8); pickup forces fee Rs 0 (Q7) | UX warnings, API `days`, AC9-AC11, AC23-AC26 |
| FR-057 | Finds existing customer by phone or email; email only if entered | UX lookup, Data model, AC12-AC16 |
| FR-045 | Creation logged in the activity log | Data model, AC17 |
| FR-051 | "(new manual order) -> Approved" per Appendix B | AC1, AC18 |
| FR-053/056 (shared form) | Edit reuses form and recalculation | Summary; edit ACs in admin-orders.md |

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Add order | `/admin/orders/new` (from Orders header "+ Add order" and Today) | SSR; picker data in loader | Empty basket: "Add a product or a custom item to start." Total Rs 0, Save disabled | Field summary Alert at top, focus moved; `DATE_UNAVAILABLE` never raised (warnings only); `PRODUCT_UNAVAILABLE` for hidden product (sold-out products are allowed with a warning) | Redirect to order detail, toast "Order APB-0043 saved" |
| Product picker sheet | sheet | Search is client-side over loader catalogue | "No products match." | n/a | Line added |
| Option picker sheet | sheet | n/a | n/a | Required group missing / text too long inline | Line added with price |
| Free-text item sheet | sheet | n/a | n/a | name 1-120, price Rs 0..1,000,000, quantity 1..50 | Line added |
| Customer lookup | inline on form | Spinner in field | no match: nothing shown | lookup failure: "Could not search, you can still continue." | "Existing customer: Anna Rault, 4 orders. Use details?" |

### Flow
1. Items: search product -> option sheet (same required/limits rules as the website) or "Custom item" (name, price, quantity). Lines show quantity stepper, price, remove. Max 20 lines.
2. Customer: enter phone (tel keyboard, +230 hint) and/or email; on blur the lookup runs. If a customer matches, a card offers "Use this customer" (fills name; phone/email stay as typed). Name required, phone required, email optional.
3. When: date (admin date picker: any day selectable including past days; blocked/closed/too-soon days marked with a hint), window (delivery or pickup windows from settings), delivery or pickup. Delivery requires address (+ optional landmark); pickup hides address.
4. Fee: defaults to settings delivery fee for delivery; editable Rs field (0..1,000,000) for delivery only. Choosing pickup forces the fee to Rs 0 and disables the field (owner Q7); switching back to delivery restores the settings fee.
5. Paid switch (default off); customer note optional; private admin note optional; confirmation language selector (defaults to the matched customer's language, else the admin's).
6. Warning Alert (non-blocking) above the sticky bar when the chosen date is blocked ("This day is blocked") or earlier than the notice days for any item ("Needs 3 days' notice, earliest is Fri 13 Dec"); closed weekday also warned as "blocked". A past date shows "This date is in the past; the order will be recorded as a past sale" and skips the notice, closed-day and blocked-day checks. A sold-out product line shows "Sold out: customers cannot order this, you are adding it anyway". Save stays enabled.
7. Sticky bar: total (items + fee) left, "Save order" right. On success the order is Approved, appears in Calendar and Prep list, and Order confirmed email is queued only when an email is present.

### Copy
Strings EN/FR (admin locale). Warnings and lookup texts via i18n; free-text item names are stored once as entered (used for both name_en and name_fr). Copywriter to finalise.

## API Contract
Reference `contracts.md` -> `admin/order-new` (loader, `findCustomer`, `create`). Auth `admin` (Admin and Owner).
| Operation | Intent | Input | Output | Errors |
|---|---|---|---|---|
| Loader | `admin/order-new` | - | picker data (catalogue with options, windows, `days: DayStatus[]`, settings delivery fee) | 401/403 |
| Find customer | `findCustomer` | `{ phone?, email? }` at least one | `{ ok, customer: { id, name, phone, email, locale, orderCount } \| null }` | `VALIDATION_FAILED` |
| Create | `create` | `{ lines: (BasketLine \| { freeText: { name <= 120, priceRs, quantity } })[1..20], contact { name, phone, email? }, date, windowId, fulfilment detail, deliveryFeeRs, paid, customerNote?, adminNote? }` | redirect to `/admin/orders/:id` | `VALIDATION_FAILED`, `PRODUCT_UNAVAILABLE` |
Server behaviour: pricing from `domain/pricing.ts` (client totals never trusted; live promotions applied as on the website); free-text lines priced as entered; `total = items + deliveryFeeRs` (for pickup the server forces `deliveryFeeRs = 0` whatever is posted); past dates accepted (warning `past_date`, no notice/closed/blocked checks); sold-out products accepted (warning `sold_out`); status approved, source manual; order number from counter in the same transaction; `policies_accepted_at` null; tracking token generated (customers with email get the tracking link in the confirmation).

## Data Model Changes
No schema change (`orders.idempotency_key` is reused for the form key). Rows written in one transaction: `orders` (source manual, status approved, snapshot contact, `time_window` snapshot, `paid`, `paid_at`/`paid_by` when paid on creation, `locale`), `order_item` (product lines with `product_id`; free-text lines with `product_id` NULL, `name_en = name_fr = entered name`, promotion fields null, options `[]`), `customer` (new or reused), `order_event` type `created` with actor admin and details `{source: manual}` (plus `marked_paid` when paid), `email_outbox` row only when email present.
Customer matching (FR-057): normalise phone to E.164 (+230 default) and lowercase email; match by email first, then phone. If email and phone match different customers, use the email match and show a notice. If the match has no email and one was entered, the email is stored on the order snapshot only and the customer row is **not** changed (security, 2026-11-10, threat-model G-02: otherwise a caller who gives someone's phone and their own email could later confirm that email and read the other person's orders). Contact fields on the order are snapshots and never overwrite an existing customer's name. New customers are created without an auth account.

## Permissions matrix
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| Open Add order, lookup customer, create manual order | no | no | yes | yes |
| Order past blocked/too-soon/past dates, add sold-out products (warning only) | no | no | yes | yes |

## Analytics Events
No client analytics. Server log lines (no PII): `manual_order_created {items, fulfilment, paid, customerMatched, emailEntered, warnings[]}`, `customer_lookup {matched}`.

## Edge Cases
- Existing customer by phone with different name typed: order keeps typed name snapshot; customer record unchanged; notice shown.
- Phone in many formats ("5712 3456", "+230 5712 3456", "230-5712-3456") normalise to the same E.164, so one customer.
- Same phone as an existing customer who has an account: reused; no email unless entered.
- No email: no confirmation email, no push to the customer; admin can send WhatsApp; the order has a tracking link shown on the detail.
- Double submit (double tap): `create` accepts an `idempotencyKey` so only one order exists (see Open contract changes).
- Product hidden or out of season after the picker loaded: `PRODUCT_UNAVAILABLE` lists lines; admin can replace with a free-text item. Sold-out products are allowed with a warning (owner Q8); customers remain blocked.
- Free-text price Rs 0 allowed (gift); total Rs 0 allowed.
- Past dates (owner Q9): allowed so orders can be recorded after the fact; warning only, notice/closed/blocked checks skipped; the order still counts in sales. No customer email is queued for a past-dated order (assumption: a "confirmed" email for a past date is misleading). A date still must be a valid calendar date within the admin horizon forward (365 days).
- Date blocked and too soon at once: both warnings shown, save allowed; a blocked day does not stop creation, and existing orders on it are unaffected.
- Delivery fee edited to 0 for delivery: allowed; pickup with a non-zero fee posted: server forces it to 0 (owner Q7).
- Very long note/name: limits 1000 / 80 characters with inline counters.
- Offline or failed request: values retained in the form; error Alert with Retry; no duplicate on retry (idempotency).
- Concurrency: two admins creating at once get consecutive numbers (counter lock), no gaps on rollback.
- Currency display "Rs 1,250"; dates Mauritius time.

## Acceptance Criteria
- AC1: Given a valid form with one product and one free-text item, when Save, then an order exists with status approved, source manual, correct number and total = items + fee, and it shows in the calendar count for that date.
- AC2: Given a cake with required size missing, when Save, then `VALIDATION_FAILED` on that line and no order is created.
- AC3: Given a free-text item "Gift box" Rs 400 x 2, then the order item has product_id NULL, name stored, line total Rs 800.
- AC4: Given pickup, then the address field is hidden, the default fee is Rs 0 and no address is required; given delivery, then an address of at least 5 characters is required.
- AC5: Given delivery with the settings fee Rs 200 edited to Rs 150, when saved, then delivery_fee_rs = 150 and total includes 150.
- AC6: Given paid = yes, when saved, then paid, paid_at and paid_by (current admin) are set and the log shows "Marked paid".
- AC7: Given the client posts a tampered total, then the server total is used.
- AC8: Given a manual order, then it appears in that day's Prep list grouped with identical items from other orders.
- AC9: Given a blocked date, when selected, then the warning shows and Save still succeeds.
- AC10: Given a date earlier than the product's notice days, then the "too soon" warning shows and Save succeeds.
- AC11: Given yesterday's date (owner Q9), when Save, then the order is saved, a "past date" warning shows, notice/closed/blocked warnings are not raised, and the order counts in sales.
- AC12: Given an existing customer's phone typed as "+230 5712 3456" when stored as 57123456, then lookup finds them and no new customer row is created on save.
- AC13: Given an existing customer's email in different case, then the same customer is reused.
- AC14: Given no match, when saved, then one new customer row is created with the entered details.
- AC15: Given an email entered, when saved, then an Order confirmed email is queued in the selected language with the tracking link; given no email, then no email_outbox row exists.
- AC16: Given a matched customer without email and an entered email, then the order's `contact_email` is the entered email, the confirmation is sent to it, and `customer.email` and `customer.auth_user_id` are unchanged.
- AC17: Given creation, then one order_event "created" with the admin as actor exists, written in the same transaction as the order.
- AC18: Given any manual order, then the first status is approved and no pending_approval event occurs.
- AC19: Given a double-tapped Save with the same idempotency key, then exactly one order exists and both requests redirect to it.
- AC20: Given a hidden product in the payload, then `PRODUCT_UNAVAILABLE` lists the line and nothing is saved.
- AC21: Given an Admin (non-Owner) session, then Add order works; given a customer session, then access is refused.
- AC22: Given 375 px, then fields use correct keyboards (tel, email, numeric), the sticky bar total updates live and hides while the keyboard is open.
- AC23 (Q7): Given pickup with a posted fee of Rs 150, when saved, then delivery_fee_rs = 0 and total = items.
- AC24 (Q8): Given a sold-out product in the payload, when saved by an admin, then the order is saved with a sold-out warning; given a customer basket with the same product, then `PRODUCT_UNAVAILABLE`.
- AC25 (Q9): Given a past date, when saved, then no `DATE_UNAVAILABLE`, a past-date warning is returned, and sales for that date include the order.
- AC26 (Q9): Given a past-dated order with an email, then no customer email is queued.

## Non-functional
- Performance: route within project.yaml budgets (JS <= 170 kB gz); the catalogue is in the loader (no client waterfall); `create` p95 <= 700 ms; customer lookup p95 <= 300 ms.
- Accessibility: WCAG 2.2 AA; warnings use text and icon, not colour alone, announced via `role=alert`/status; date picker keyboard-operable; sheets focus-trapped; labels and hints on all fields.
- Security: `requireAdmin` first; zod validation on every field; Origin check; server-side pricing; lookup returns only the minimal customer fields and only to admins; lookup is not rate-limited beyond auth but returns max one match.
- Privacy: collects name, phone, optional email, address; email used only for the confirmation; no PII in logs.

## Rollout / flags
- Flag: none · Rollout: with admin app · Rollback: redeploy; created orders remain valid.

## Open contract changes (applied 2026-11-10)
1. `create` needs `idempotencyKey` (uuid rendered into the form) per contract convention for retry-prone mutations. — **Resolved in contracts.md (2026-11-10).**
2. `create` needs `locale` (en|fr), `customerNote?`, `adminNote?`. — **Resolved in contracts.md (2026-11-10).**
3. `create` should return a flash `warnings: ("blocked"|"too_soon")[]` and the loader `days` must cover all dates from today (not only 90) with reasons for admin variant. — **Resolved in contracts.md (2026-11-10).** Modified: admin `days` covers a 365-day horizon (not unbounded); past dates are accepted with a `past_date` warning (owner Q9, 2026-11-10).
4. `findCustomer` output should include `locale` and `orderCount`; define the "email vs phone conflict" result `{ customer, conflict: true }`. — **Resolved in contracts.md (2026-11-10).**
5. Free-text lines in `create` match the edit contract shape; `Contact.email` is optional for admin only (separate `AdminContact` schema). — **Resolved in contracts.md (2026-11-10).**

## Open Questions
- Pickup fee, sold-out products and past dates: **Resolved (owner, 2026-11-10, Q7-Q9):** fee forced to Rs 0 for pickup; sold-out allowed with warning; past dates allowed with warning.
- Should a manual order also let the admin set the total by hand? Spec: no (use a free-text line or edit afterwards) — owner product-director.
