# Feature Spec — Checkout and tracking

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 · Epic: TBD (`/create-epics`)
Related: [pricing-availability-promotions](pricing-availability-promotions.md) (all price/date rules), [catalogue-browsing](catalogue-browsing.md) (Add to basket)

## Summary
A P1 customer reviews the basket, picks delivery or pickup, a date and a time window, enters details, accepts the policies and sends one order on a single page. The order is created as Pending approval with a sequential number and a private tracking link; the customer lands on a confirmation page and can later follow the order, or cancel it while it is still Pending approval or Quote needed. No account or online payment is needed (admins mark paid manually; Juice or cash).

Out of scope: custom request form and quote creation/expiry (FR-028..033; this spec only renders the quote block and links to its actions), accounts, Reorder, My orders, admin screens, email template content (FR-070/071), the 24 h pending push (FR-075), admin editing of orders.

## Requirements trace
| PRD ID | Requirement | Covered by |
|---|---|---|
| FR-018 | One-page basket + checkout, basket icon | Screens, AC1-AC4 |
| FR-019 | Pickup address / delivery address + fee | Checkout sections, AC5-AC7 |
| FR-020 | Time windows from Settings, per fulfilment | AC8 |
| FR-021 | Details, E.164 phone, prefill | Phone rules, AC9-AC11 |
| FR-022 | Policy acceptance, summary with payment info | AC12-AC13 |
| FR-023 | Idempotent submit | AC14-AC15 |
| FR-024 | Pending approval, APB-nnnn, random token | AC16-AC17 |
| FR-025 | Confirmation screen | AC18 |
| FR-026 | Tracking page, wrong token not found | AC19-AC22 |
| FR-027 | Customer cancel rules | AC23-AC27 |
| FR-011, 012, 013, 014, 015 | Applied at submit (rules in pricing spec) | Submit pipeline, AC28-AC31 |
| FR-074 (part) | Order saved even if email fails | AC32 |
| NFR-003, 013 | Rate limits, token security, gap-free numbers | Security, AC33-AC35 |

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Basket + checkout | `/basket`, `/fr/basket` | SSR (no client fetch); price skeleton after 300 ms on option change | "Your basket is empty." + "See the menu" | Top Alert listing problems as links to fields, focus moved to it; per-line unavailable Alert; price-changed Alert (old -> new) | Redirect to confirmation |
| Confirmation | `/order/:token/confirmed` | SSR | n/a | Wrong token: not-found state | Number (large, copyable), info Alert "Not confirmed until we approve it", tracking link with Copy and Share, "Save my details" card for guests |
| Tracking | `/t/:token` | SSR | n/a | Not-found state "We can't find this order" + WhatsApp (same page for wrong and unknown token) | Progress, summary, messages, actions |
| Cancel dialog | on tracking | submitting | n/a | Inline error in dialog | Page re-renders as Cancelled |

### Flow (one page, numbered `h2` sections, design-system "Checkout")
1. **Basket**: each line shows photo 56 px, name, chosen options, message on cake, compact Stepper (1-50), line Price (struck original when promoted), Remove (44 px). Subtotal. Max 10 lines.
2. **Delivery or pickup**: required radio cards, no default (avoids a surprise fee). Pickup shows the public address and map link (Settings). Delivery shows address (textarea, min 5 chars), landmark (optional) and "Delivery fee Rs {fee}"; saved addresses as radios for signed-in customers.
3. **Date**: date picker with `days: DayStatus[90]`, "Earliest date" header, reasons on tap (copy in pricing spec). When the basket has seasonal items, only dates inside every seasonal item's window are offered; others show "Not available: {item} is only available {start} to {end}" (owner Q2). Selection survives an invalid state; changing fulfilment does not reset the date.
4. **Time window**: radio rows from `windows.delivery` or `windows.pickup` by fulfilment (Settings, FR-020); shown after step 2.
5. **Your details**: name, phone (`tel`), email, optional note. Prefilled when signed in.
6. **Summary**: items, delivery fee line or "Pickup: free", total, payment info (Juice number from Settings, or cash on delivery/pickup), policy checkbox (label opens policies in a sheet, includes the 48 h cancellation text from `/faq#cancellation`).
Sticky bar: total + "Place order". Hides with the keyboard. From the tap until the confirmation page has loaded (including the redirect), the button shows a spinner and "Sending your order…", is `aria-busy` and `aria-disabled` (not `disabled`, so focus stays on it) and ignores further taps (amended 2026-11-11, staging latency report).

### Tracking page content
- Header: number, status badge (customer wording), paid status. Summary: items with options, date, window, delivery/pickup (address, landmark), delivery fee, total, payment info.
- **Progress** (`<ol>`, `aria-current="step"`): delivery path Pending approval -> Approved -> In preparation -> Out for delivery -> Completed; pickup path replaces Out for delivery with Ready for pickup; quote path Quote needed -> Quote sent -> Approved -> ... `declined`, `cancelled`, `closed` replace the bar with an Alert (with decline reason when set). An order an admin cancelled while a quote was awaiting the customer shows as cancelled with no Accept/Decline (owner Q6). `progress` comes from the loader.
- Bakery messages: decline reason, quote note. Quote block: amount, note, expiry date, Accept (primary) / Decline (secondary); expired: Alert, buttons removed (`quote.canRespond`). Accept/decline behaviour is specified with FR-030..033 (custom requests spec).
- **Cancel** (destructive outline) only when `canCancel`; otherwise text: "To change or cancel, message us on WhatsApp. Free cancellation until 48 hours before your order date." plus the WhatsApp button (`whatsappUrl` prefilled with the order number). Customers cannot edit orders.
- Language switch present; `noindex`; `Referrer-Policy: no-referrer`.

### Copy
New i18n keys (EN/FR via `copywriter`): section titles, error messages per `ErrorCode` (what happened + what to do + no blame, e.g. "We need 3 days' notice for this cake. The earliest date is Fri 13 Dec."), price-changed ("The price changed from Rs {old} to Rs {new}"), button "Place order at Rs {total}", confirmation notice, tracking statuses in customer wording, cancel dialog, WhatsApp prefill.

## API Contract
Existing route contracts in `docs/architecture/api/contracts.md`: **`site/basket`** (`updateLine`, `removeLine`, **`placeOrder`**), **`site/product`** (`addToBasket`), **`site/order-confirmed`**, **`site/tracking`** (`cancel`; `acceptQuote` / `declineQuote` rendered only), `root.tsx` (`basketCount`). Shared schemas: `BasketLine`, `Contact`, `DeliveryDetail`, `Phone`, `Fulfilment`, `WindowId`, `MuDate`. Errors: `VALIDATION_FAILED`, `BOT_CHECK_FAILED`, `RATE_LIMITED`, `PRODUCT_UNAVAILABLE`, `DATE_UNAVAILABLE`, `PRICE_CHANGED`, `BASKET_FULL`, `NOT_FOUND`, `CANCEL_NOT_ALLOWED`, `ORDER_CHANGED`.

### Basket storage
HttpOnly cookie `apb_basket` (architecture.md): lines hold ids, choices, quantity, message only, never prices; < 4 kB; max 10 lines. Adding an identical configuration (same product, options, message) increases the existing line quantity (cap 50); otherwise a new line. Invalid or tampered cookie content: invalid lines are dropped, the rest kept; unparseable cookie = empty basket.

### `placeOrder` pipeline (server, order is normative)
1. zod parse -> `VALIDATION_FAILED` (`fields` keyed by form field; phone normalised by `domain/phone`).
2. Idempotency: if an order with `idempotencyKey` exists and the posted `contact.email` (trimmed, lower-cased) is that order's email, return its redirect (no new order, no email). Only the key and email are read for this lookup, so a replay with an emptied basket (cookie cleared after success) or a changed payload still returns the original; the redirect uses the order's language (S-014). Another or missing email: `VALIDATION_FAILED` with the neutral "Please check your details and place your order again.", a fresh key in the re-rendered form, no order data (threat-model G-21).
3. Rate limit `RL-order` (5 / 10 min / IP) -> `RATE_LIMITED`; Turnstile -> `BOT_CHECK_FAILED` (Turnstile outage: allow, stricter limit, logged).
4. Load products/promotions/settings; `productProblem` per line (hidden, sold out, or outside the window by today's date) -> `PRODUCT_UNAVAILABLE` (lists `lineId`s).
5. `assertOrderable(date, ctx, noticeDaysFor(lines), seasonal windows of the lines)` (date must also lie inside every seasonal item's window, else reason `out_of_season`, owner Q2); windowId must exist in the list for the chosen fulfilment -> `DATE_UNAVAILABLE` (`fields.date` + reason) or `VALIDATION_FAILED` (`fields.windowId`).
6. `priceBasket` + `reconcileTotal(displayedTotalRs)` -> `PRICE_CHANGED` with repriced `lines`, `totalRs`. The fee is part of the compared total.
7. One `db.transaction`: resolve customer (signed-in customer → own row; else exact lower-cased email match; else insert a new row; **never match by phone alone and never update `email` or `auth_user_id` on an existing row**, contracts "Customer matching", threat-model G-02; contact fields snapshot on the order), allocate number from `counter`, insert `orders` (`pending_approval`, `source website`, `locale` = page locale, `policies_accepted_at`, `tracking_token` 32 random bytes base64url, `idempotency_key`), `order_item` rows (prices copied, `promotion_id` recorded), `order_event` `created` (actor customer), `email_outbox` `order_received` (dedupe `order:<id>:received`) and admin alert rows. A unique violation on `idempotency_key` (race) rolls back and returns the winner's redirect (same email rule as step 2). Two first orders with the same new email insert the customer with `ON CONFLICT DO NOTHING` and re-read it, so they never fail on `customer_email_key` (S-014).
8. After commit (`ctx.waitUntil`): send email, admin push and email. Failure never fails the order (FR-074, outbox retry).
9. Redirect `/order/:token/confirmed` (or `/fr/...`), basket cookie cleared.

### Phone normalisation (`domain/phone.ts`)
Strip spaces, `-`, `.`, `()`; leading `00` becomes `+`. Starts with `+`: keep if 8-15 digits. Starts with `230` (no plus) and 10-11 digits: prefix `+`. Otherwise 7 or 8 digits: prefix `+230`. Anything else: `VALIDATION_FAILED` `fields.contact.phone`. Examples: `5712 3456` -> `+23057123456`; `+230 5712 3456` -> `+23057123456`; `00 33 6 12 34 56 78` -> `+33612345678`; `12345` -> invalid.

### Tracking actions
`cancel { version }`: order must be `pending_approval` or `quote_needed` (else `CANCEL_NOT_ALLOWED`, checked before version), then version (`ORDER_CHANGED`: page reloads with a "This order was updated, please check and try again" Alert). Success: status `cancelled`, event `cancelled` (actor customer), outbox `cancellation_confirmed`, admin push + email "customer cancelled" (FR-072), `version + 1`. Loader: token must match `^[A-Za-z0-9_-]{43}$` else 404 before touching the DB; wrong and unknown tokens return the identical response (status, body, timing class).

### Open contract changes (applied 2026-11-10)
1. `placeOrder` `PRICE_CHANGED` body: add `totalRs: Money` and `deliveryFeeRs: Money` next to `lines` (needed for "Place order at Rs X"). — **Resolved in contracts.md (2026-11-10).**
2. `site/tracking` loader: add `payment: { juiceNumber: string | null }` (summary shows payment information) and `declineReason` is already present; no other change. `whatsappUrl` must be built by `domain/whatsapp.ts` with the order number prefilled. — **Resolved in contracts.md (2026-11-10).**
3. `site/basket` loader: add `limits: { maxLines: 10, maxQuantity: 50 }` (optional; or keep as constants shared via `contracts/shared.ts`). — **Rejected as a loader field (2026-11-10):** limits are shared constants in `contracts/shared.ts` (`BASKET_MAX_LINES`, `LINE_MAX_QUANTITY`).
4. `site/basket` `updateLine`: quantity validated against the product minimum if `product.min_quantity` is adopted (pricing spec, open change 2). — **Resolved in contracts.md (2026-11-10).** `product.min_quantity` adopted as nullable (NULL = no minimum).
5. `DayStatus.reason` `too_far` (pricing spec, open change 1). — **Resolved in contracts.md (2026-11-10).**

## Data Model Changes
None. Uses `orders`, `order_item`, `order_event`, `customer`, `counter`, `email_outbox`, `settings` as defined in `data-model.md` (unique `number`, `tracking_token`, `idempotency_key`; version column).

## Permissions matrix
| Action | Anonymous | Customer (signed in) | Admin / Owner |
|---|---|---|---|
| Edit basket, place order | yes | yes (prefilled) | yes (as a customer; use Manual order for phone orders) |
| View confirmation / tracking | token holder | token holder | token holder; admins use admin order detail |
| Cancel from tracking | token holder, status-gated | same | n/a (admin cancel is in admin spec) |
| Read another customer's order | never (token only) | never | admin screens only |

## Analytics Events
Cookieless, no PII (NFR-011), `track()` seam as in the catalogue spec.
| Event | Trigger | Properties |
|---|---|---|
| `checkout_viewed` | `/basket` rendered with >= 1 line | line_count |
| `order_placed` | action success (server-side count) | fulfilment, line_count, total_rs_band, locale, has_promotion |
| `order_refused` | action error | code |
| `order_cancelled_by_customer` | cancel success | status_before |
| `tracking_viewed` | valid token render | status |

## Edge Cases
- **Double tap / refresh after submit / back button:** same `idempotencyKey` in the form -> one order; the replay redirects to the same confirmation when its email matches the order's (G-21); a page with the key reused by someone else gets a neutral refusal and a fresh key.
- Different payload re-using a key: original order is returned (key wins); the form renders a new key after a validation or price error only if the order was not created.
- **Date goes stale** (page open across midnight Mauritius, or an admin blocks the day): `DATE_UNAVAILABLE`, picker re-rendered with the new statuses, other fields kept.
- **Price changed** (promotion ended, product price edited, delivery fee edited): refused, nothing created; Alert shows old -> new; button reads "Place order at Rs {new}"; the next submit sends the new `displayedTotalRs`. The form carries one displayed total per fulfilment (`displayedTotalRs.delivery` / `.pickup`) so this also holds without JavaScript (contracts.md v0.7).
- **Line became unavailable** (sold out, hidden, left season): refused with `PRODUCT_UNAVAILABLE`; the line shows an Alert and Remove; Place order stays blocked until removed.
- Changing basket in another tab: server cookie wins at submit; the page the customer sees may be stale and gets `PRICE_CHANGED` or `PRODUCT_UNAVAILABLE`.
- Empty basket on submit: `VALIDATION_FAILED`. 11th line: `BASKET_FULL`. Quantity 0 or 51: rejected.
- Delivery chosen then switched to pickup: fee removed, address ignored (not stored for pickup), window reset if the id is not in the pickup list.
- Settings change windows between render and submit: unknown `windowId` -> `VALIDATION_FAILED` with the refreshed list.
- Email down: order exists, confirmation page works, outbox retries.
- Language switch on `/basket` is a GET: typed fields are lost (known limitation, basket kept in cookie). Signed-in prefill softens this.
- Customer cancels while admin approves at the same moment: first committed write wins; the other gets `CANCEL_NOT_ALLOWED` (approved) or `INVALID_TRANSITION` (admin side).
- Second cancel POST on an already cancelled order: `CANCEL_NOT_ALLOWED`; the page shows the cancelled state.
- Guest uses an email that belongs to an account: order attaches to that customer by email match; no account data is revealed.
- Token appears in URL only; never logged or sent to Sentry unredacted (path `/t/:token` and `/order/:token/*` redacted).

## Acceptance Criteria
- AC1: Given 2 lines, when `/basket` loads, then both appear with options, message, line prices and subtotal.
- AC2: Given a line, when quantity is changed or Remove is pressed, then the page shows updated totals and the top bar count updates.
- AC3: Given an empty basket, then the empty state with "See the menu" shows and no form.
- AC4: Given 11 distinct lines, then the 11th Add returns `BASKET_FULL`.
- AC5: Given delivery, then the fee from Settings is added and the address is required (min 5 characters).
- AC6: Given pickup, then the address and map link show and the fee is Rs 0.
- AC7: Given a delivery order, then the stored order has the address, landmark and `delivery_fee_rs` equal to the Settings fee at placement.
- AC8: Given Settings windows edited, then the next checkout shows the new delivery and pickup lists separately.
- AC9: Given phone `5712 3456`, then the stored phone is `+23057123456`.
- AC10: Given phone `12345`, then `VALIDATION_FAILED` with `fields.contact.phone` and no order.
- AC11: Given a signed-in customer, then name, phone, email and saved addresses are prefilled.
- AC12: Given the policy box unticked, when Place order is pressed, then `VALIDATION_FAILED` on `acceptPolicies` and focus goes to the error summary.
- AC13: Given the summary, then items, fee line, total and Juice number/cash information are shown.
- AC14: Given two submits with the same key within one second, then exactly one order exists and both responses redirect to its confirmation.
- AC15: Given a refresh of the confirmation URL, then the same order shows; no new order is created.
- AC16: Given two successful orders in sequence, then numbers are consecutive (`APB-0007`, `APB-0008`) and a rolled-back attempt consumes no number.
- AC17: Given an order, then `tracking_token` is 43 base64url characters and cannot be derived from the number.
- AC18: Given an order was sent, then the confirmation shows the number, the "not confirmed until approved" notice and the tracking link.
- AC19: Given a valid token and no session, then `/t/:token` loads with items, date, window, fulfilment, total, paid status, progress and WhatsApp button.
- AC20: Given a wrong token and an unknown valid-format token, then both return the same 404 not-found page.
- AC21: Given a status of declined, cancelled or closed, then an Alert replaces the progress bar.
- AC22: Given a quote_sent order with an unexpired quote, then amount, note, expiry, Accept and Decline show; an expired quote shows no buttons.
- AC23: Given Pending approval, then the Cancel button shows and cancelling sets Cancelled, writes a customer event and queues the cancellation email.
- AC24: Given Quote needed, then Cancel works the same way.
- AC25: Given Approved or later, then no Cancel button shows, the WhatsApp guidance and 48 h policy text show, and a forged `cancel` returns `CANCEL_NOT_ALLOWED`.
- AC26: Given a stale `version` on a still-pending order, when Cancel is posted, then `ORDER_CHANGED` and the page reloads.
- AC27: Given a cancelled order, when Cancel is posted again, then `CANCEL_NOT_ALLOWED`.
- AC28: Given a tampered `displayedTotalRs` or forged price field, then the stored total equals the server calculation or the request is refused with `PRICE_CHANGED`.
- AC28b (Q2): Given a basket with an item seasonal until 25 Dec, then the picker offers no date after 25 Dec, and a posted date of 27 Dec returns `DATE_UNAVAILABLE` (`out_of_season`) with no order; placing the order on 24 Dec for 24 Dec succeeds.
- AC29: Given a date blocked after the form opened, when sent, then `DATE_UNAVAILABLE` with the reason category (no private reason) and no order.
- AC30: Given a promotion ended after the form opened, when sent, then `PRICE_CHANGED` with the new total and the button reads "Place order at Rs {new}".
- AC31: Given a sold-out line, then `PRODUCT_UNAVAILABLE` lists its `lineId` and no order is created.
- AC32: Given the email provider is down, then the order is saved, shown on confirmation, admins are alerted and the outbox row stays pending for retry.
- AC33: Given 6 submits from one IP in 10 minutes, then the 6th returns `RATE_LIMITED` with `Retry-After`.
- AC34: Given a failed Turnstile, then `BOT_CHECK_FAILED` and no order.
- AC35: Given 20 concurrent placements, then numbers are unique and gap-free.
- AC36: Given a placed order, when the product price later changes, then the order's items and total are unchanged.
- AC37: Given an order placed from `/fr/basket`, then `orders.locale = fr` and the confirmation/tracking pages default to FR.

Playwright (critical journeys, PRD J1-J3, J12): phone-viewport guest delivery order EN; pickup order FR with no fee; cancel pending then no cancel after approval; wrong token; double-click Send.

## Non-functional
- Performance: `/basket` SSR, works without JS; JS adds live price and date picker, lazy-loaded; route <= 170 kB gz; INP <= 200 ms on option/date change; CLS <= 0.1 (reserved sticky-bar and skeleton sizes). `placeOrder` p95 <= 800 ms.
- Accessibility: WCAG 2.2 AA; checkout fully keyboard operable including the date picker (arrows/PageUp/PageDown, unavailable days focusable and announced); every field has a visible label and `autocomplete`; error summary takes focus; Dialog traps focus; status/progress not colour-only; 320 px and 200% zoom without clipped actions; tap targets 44 px.
- Security: server-side validation of everything (zod); price, availability and product status re-checked; Turnstile + `RL-order` on placeOrder; `RL-track` (60 / 10 min / IP) on tracking; tracking token 256-bit, wrong/unknown indistinguishable; `no-store`, `noindex`, `no-referrer` on token pages; no PII in logs; order write, event and outbox in one transaction; `security-lead` review (money, personal data).
- Privacy: collects name, phone, email, address, note; visible to admins only; emails carry only necessary data; retention per `data-model.md` (TO CONFIRM, NFR-004); a short privacy note linked from the policy sheet; functional cookie `apb_basket` only.

## Rollout / flags
Flag: none · Rollout: staging first, then production fast-forward · Rollback: redeploy previous build; orders created remain valid (no schema change).

## Open Questions
- Delivery/pickup default selection: decided none (explicit choice). Confirm with UX at design review.
- Keep typed checkout fields when switching language? Decided no (known limitation); revisit if testing shows it matters. Owner: ux-lead.
- Should a customer's cancel of a pending order notify the customer by email as well as admins? Decided yes (`cancellation_confirmed`, build brief status table).
