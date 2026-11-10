<!-- Template: feature-spec | Filled by: /feature-spec (product-manager) | Output: docs/specs/features/admin-orders.md -->
# Feature Spec — Admin orders (Today, Orders, order detail and actions)

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 (stack) · Epic: E-admin-orders (to be created by /create-epics)
Sources: PRD v0.2 §5.7 and Appendix B, build-brief "Admin app", design-system "Domain components (admin)" and "Admin one-handed patterns", data-model `orders`, `order_item`, `order_event`, API contract "Admin app", prototype test session T5.

## Summary
Sabera and her helpers run the bakery day from a phone: Today shows what needs attention and what is due, Orders lists and searches everything, and the order detail carries every action (approve, decline, quote, advance, revert, pay, edit, cancel, WhatsApp). The status machine is enforced on the server, every change is logged with the acting admin, and concurrent changes are rejected instead of overwritten.

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-045 | Every change stored as an order event, shown as activity log | UX (Activity log), Data model, AC24-AC25 |
| FR-048 | Today counts and today/tomorrow orders with one-tap next status | UX (Today), API `admin/today`, AC1-AC5 |
| FR-049 | Orders tabs, search, filters | UX (Orders), API `admin/orders`, AC6-AC10 |
| FR-050 | Order detail, Maps, Call, WhatsApp, photos, private note, log | UX (Order detail), AC11-AC13 |
| FR-051 | Transitions exactly per Appendix B, server-enforced | Transition table, AC14-AC16 |
| FR-052 | Approve, Decline, Send quote, Next, Back, Paid, Edit, Cancel | API, AC17-AC27 |
| FR-053 | Edit any field of non-Completed order, recalculation/override, logged | Edit section, AC28-AC32 |
| FR-054 | Optimistic concurrency, "this order changed, reload" | Edge Cases, AC33-AC34 |
| FR-056 | Edits ignore availability, warn if blocked or too soon | Edit section, AC31 |
| FR-073 | WhatsApp template picker with resolved placeholders | UX (WhatsApp), AC35-AC36 |
| FR-070/071 (consumer) | Emails per Appendix B queued by these actions (content owned by notifications spec) | Transition table |

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Today | `/admin` | SSR; skeleton tiles after 300 ms | "No orders today." / "Nothing booked for tomorrow." tiles show 0 | Error state + Retry; per-row action error inline | Toast "Marked Ready" with Undo 6 s |
| Orders | `/admin/orders?tab=` | SSR list; skeleton rows | Per tab: "No orders to review. Enjoy the quiet." etc.; filtered: "No orders match. Clear filters." | Alert + Retry | n/a |
| Filter sheet | bottom sheet | n/a | n/a | n/a | Chips under search show active filters |
| Order detail | `/admin/orders/:id` | SSR | n/a | `NOT_FOUND` page; conflict Alert "This order changed. Reload" with Reload button | Toast per action; sticky bar updates |
| Send quote sheet | sheet | spinner | n/a | Field errors (amount > 0, expiry >= today) | "Quote sent to {name}" |
| More actions sheet | sheet | n/a | n/a | n/a | n/a |
| Dialogs (Decline, Cancel) | dialog | n/a | n/a | `INVALID_TRANSITION`: "This order can no longer be {action}. Reload." | Toast |
| WhatsApp picker | sheet | n/a | n/a | No usable phone: button disabled with hint | Opens `wa.me` link |
| Edit order | `/admin/orders/:id/edit` | SSR | n/a | Field summary Alert; `ORDER_CHANGED` | Back to detail, toast "Order updated" (+ warnings) |

### Flow
- **Today:** three Stat tiles (To review, Quotes to send, Unpaid) link to Orders tab/filter. Sections "Today" and "Tomorrow" list OrderSummary rows sorted by window start, then number. Each row: number, name, window, delivery/pickup icon + text, main items (first 2 + "+n"), Paid tag, one-tap next-status button (label from `nextStatus`; none for orders that need Approve/quote: row opens detail). Forward tap -> optimistic spinner -> toast with Undo (calls `revert`, 6 s, no email on undo).
- **Orders:** tabs To review (pending_approval, quote_needed; oldest first), Upcoming (quote_sent, approved, in_preparation, ready_for_pickup, out_for_delivery; by date/window asc), Completed (newest first), Closed (cancelled, declined, closed; newest first). Sticky search under tabs (name, phone digits, order number "APB-0042" or "42"). Filters: date or date range, delivery/pickup, paid/unpaid. Cursor pagination "Load more". Search spans the active tab only; empty result offers "Search all orders" (open question).
- **Detail:** header (number, Status badge, Paid tag, source, placed time); customer block (name, Call `tel:`, WhatsApp, Open in Maps for delivery, landmark); fulfilment (date, window, delivery/pickup); items with options, cake messages and prices; fee and total (with "Total set by hand" tag when overridden); customer note; custom-request fields and reference photos (signed URLs, tap to enlarge; quote and expiry); decline/cancel reason if any; private note (autosave, "Saved"); activity log newest last, "Approved by Sarah, 12 Nov 14:05". Sticky action bar: primary = next valid step; "More actions" icon -> sheet (Decline, Back one step, Mark paid/unpaid, Edit, Cancel, WhatsApp).
- **Edit:** same field set as Manual order (see admin-manual-orders.md) prefilled; shows live recalculated total; "Set total by hand" switch with amount; warnings Alert for blocked/too-soon date (does not block save).

### Transition table (enforced by `domain/orderStatus`; Appendix B is authoritative)
| Action | From | To | Customer email |
|---|---|---|---|
| approve | pending_approval | approved | Order confirmed |
| decline | pending_approval, quote_needed | declined | Order declined |
| sendQuote | quote_needed (re-quote allowed in quote_sent) | quote_sent | Your quote |
| advance | approved -> in_preparation; in_preparation -> ready_for_pickup (pickup) or out_for_delivery (delivery); ready/out -> completed | next | none / Ready or On the way / Thank you |
| revert | in_preparation -> approved; ready/out -> in_preparation; completed -> ready/out (by fulfilment) | previous | none |
| cancel | pending_approval, quote_needed, approved, in_preparation, ready, out (not completed) | cancelled | Cancellation confirmed |
| setPaid | any status | flag only | none |
Customer-driven transitions (quote accept/decline/expire, customer cancel) are in the tracking spec. `allowed` in the loader is computed from this table; the UI shows only allowed actions, and the server re-checks.

### Copy
Strings via i18n EN/FR; the decline reason and quote note are free text sent in the order's language email. Confirm Dialogs: Decline ("Decline this order? The customer will get an email. Optional reason"), Cancel (reason optional, "The customer will be emailed"). Copywriter to finalise.

## API Contract
Reference `contracts.md` -> `admin/today`, `admin/orders`, `admin/order`, `admin/order-edit`. Operation summary (all `admin`; every mutation carries `version` and returns `{ ok: true, order: { status, version } }`):
| Operation | Module / intent | Input | Output | Errors |
|---|---|---|---|---|
| Today | `admin/today` loader; `advance` | `{ orderId, version }` | counts, today[], tomorrow[] (OrderSummary + `nextStatus` + `version`) | `ORDER_CHANGED`, `INVALID_TRANSITION` |
| List | `admin/orders` loader | `tab,q,date,fulfilment,paid,cursor,limit` | `{ data, nextCursor }` | `VALIDATION_FAILED` |
| Detail | `admin/order` loader | id | order, customer, mapsUrl, telUrl, whatsapp.templates, events, `allowed` | `NOT_FOUND` |
| Approve / Decline / Send quote | `approve`, `decline {reason?}`, `sendQuote {amountRs,note?,expiresOn}` | + `version` | as above | `INVALID_TRANSITION`, `ORDER_CHANGED`, `VALIDATION_FAILED` |
| Advance / Revert / Cancel | `advance`, `revert`, `cancel {reason?}` | + `version` | as above | same |
| Paid | `setPaid {paid}` | + `version` | as above (sets `paid_at`, `paid_by`) | `ORDER_CHANGED` |
| Note | `saveNote {adminNote <= 2000}` | - | `{ ok }` | `VALIDATION_FAILED` |
| WhatsApp | `whatsappLink {template}` | - | `{ ok, url }`, no state change | `NOT_FOUND` |
| Edit | `admin/order-edit` `save` | per contract | `{ ok, warnings }` | `ORDER_CHANGED`, `INVALID_TRANSITION` (completed), `VALIDATION_FAILED` |
Rules: handler order is parse -> authenticate -> authorise -> work. Status change, item rewrite, outbox email and order_event share one transaction.

## Data Model Changes
No schema change required beyond `data-model.md`. Event types used: approved, declined, cancelled, quote_sent, status_advanced, status_reverted, marked_paid, marked_unpaid, edited (details: field diff before/after, old/new total, override flag), note changes are not logged. Idempotency: a repeated identical `advance` with a stale `version` fails with `ORDER_CHANGED`, never double-advances.

## Permissions matrix
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| View Today, Orders, order detail | no | no | yes | yes |
| Approve, decline, quote, advance, revert, paid, edit, cancel, note, WhatsApp | no | no | yes | yes |
| Edit WhatsApp templates (Settings) | no | no | no | yes |
| See private admin note | no | no | yes | yes |

## Analytics Events
No client analytics. Server log lines (no PII): `order_action {action, from, to, source}`, `order_conflict`, `order_invalid_transition`. Business metrics derive from `order_event`.

## Edge Cases
- **Concurrency (FR-054):** stale `version` on any mutation (including Today one-tap and Undo) -> `409 ORDER_CHANGED`, Alert "This order changed. Reload", no partial change; Today refreshes the row.
- Double tap on a forward button: second request carries old version and is rejected; UI disables button while pending.
- Undo after another admin advanced the order: `ORDER_CHANGED`, toast "Could not undo, the order changed."
- Edit when a Completed order: refused (`INVALID_TRANSITION`); Back one step first, then edit.
- Cancel of a paid order: allowed; paid flag stays, log notes it; refund is off-system (no online payment).
- Quote expiry date today or earlier than today: refused. Re-quote overwrites and logs old values (FR-033).
- Email failure: action still succeeds, `email_failed` event shown in log, outbox retries (FR-074).
- Search: phone digits normalised (230 prefix ignored); numbers with or without "APB-"; empty query shows tab default; max `limit` 100.
- Delivery order without usable address on legacy data: Maps button hidden. Phone missing: Call/WhatsApp disabled.
- Order moves between Today/Orders tabs after action; list reloads the affected row.
- Timezone: "today/tomorrow" evaluated in Mauritius time (UTC+4) on the server clock.
- Customer cancelled while admin is editing: admin save returns `ORDER_CHANGED`.
- Photos unavailable (signed URL expired after 10 min): reload prompt; images never public.
- Unpaid count excludes cancelled/declined/closed; includes Completed orders not marked paid.

## Acceptance Criteria
- AC1: Given seeded orders, when opening Today, then To review = count(pending_approval + quote_needed), Quotes to send = count(quote_needed), Unpaid = count(paid=false, status in approved..completed).
- AC2: Given orders today in windows 12-17 and 9-12, then they list 9-12 first; tomorrow's orders appear under Tomorrow.
- AC3: Given an approved order today, when tapping the next-status button, then status becomes in_preparation, an event stores the admin, and a toast with Undo shows; no email is queued.
- AC4: Given the toast, when tapping Undo within 6 s, then status returns to approved with a status_reverted event and no email.
- AC5: Given a pending_approval order on Today, then no one-tap next-status button shows and the row opens detail.
- AC6: Given 4 orders in different statuses, then each appears only in its tab per the table above.
- AC7: Given a customer phone typed with spaces or +230, when searching, then the matching orders show.
- AC8: Given a search "42" or "APB-0042", then order 42 shows.
- AC9: Given filter delivery + unpaid + a date, then only orders matching all three show; Clear filters restores the tab.
- AC10: Given 31 orders in a tab, then 30 show and Load more fetches the rest by cursor.
- AC11: Given a delivery order, then "Open in Maps" links to a maps search for the address and Call is a `tel:` link.
- AC12: Given a custom request with 3 photos, then 3 photos display via signed URLs and a 11-minute-old URL is not reusable.
- AC13: Given a private note edit, when idle 1 s, then "Saved" shows and the customer tracking page never shows it.
- AC14: Given a Completed order, when POSTing cancel, then `INVALID_TRANSITION`.
- AC15: Given a pending_approval order, when POSTing advance, then `INVALID_TRANSITION`.
- AC16: Given each row of the transition table, then the server accepts it and rejects every pair not listed (table-driven unit test).
- AC17: Given pending_approval, when Approve, then status approved, event "approved" with admin id, and an Order confirmed email queued in the order's locale.
- AC18: Given pending_approval, when Decline with reason, then declined, reason stored, Order declined email contains the reason.
- AC19: Given quote_needed, when Send quote Rs 8,500 with note and expiry in 5 days, then quote_sent and Your quote email queued; expiry in the past -> `VALIDATION_FAILED`.
- AC20: Given quote_sent, when re-quote, then quote overwritten and old values appear in the event.
- AC21: Given a pickup order in_preparation, when Next status, then ready_for_pickup and Ready email; a delivery order gives out_for_delivery and On the way email.
- AC22: Given ready_for_pickup, when Next status, then completed and Thank you email.
- AC23: Given completed, when Back one step, then ready/out per fulfilment, no email.
- AC24: Given any action, then exactly one order_event with actor admin id, from/to status and timestamp is stored in the same transaction (rolled back together on failure).
- AC25: Given the log, then it renders "Approved by Sarah, 12 Nov 14:05" and still shows the name after Sarah is deactivated.
- AC26: Given any status, when Mark paid, then paid=true, paid_at and paid_by set, event marked_paid, no status change; Mark unpaid reverses with event.
- AC27: Given an approved order, when Cancel with reason, then cancelled and Cancellation confirmed email queued.
- AC28: Given an edit of item quantity 1 -> 2, then items_total and total recalculate on the server and the event stores before/after.
- AC29: Given "Set total by hand" Rs 5,000, then total_rs = 5,000, total_overridden = true and the detail shows the tag; later item edits keep the override until switched off.
- AC30: Given an edit changing fulfilment delivery -> pickup, then fee becomes 0 and address is cleared; pickup -> delivery requires an address.
- AC31: Given an edit to a blocked date, then save succeeds with warning `blocked`; too-soon date gives `too_soon`.
- AC32: Given a Completed order, when opening edit, then the screen is unavailable and the server refuses `save`.
- AC33: Given two admins viewing version 3, when admin A approves and admin B then declines with version 3, then B gets `ORDER_CHANGED` and sees "This order changed. Reload"; the order is approved.
- AC34: Given two simultaneous approve requests with the same version, then exactly one succeeds and exactly one email is queued.
- AC35: Given the template Payment reminder in an FR order, then the message is French with {name}, {order_number}, {total}, {juice_number} resolved from the order and settings, and is editable before opening WhatsApp.
- AC36: Given WhatsApp, then the URL uses the customer's E.164 number and the URL-encoded message; no order_event is written.
- AC37: Given an Admin or Owner, then the same actions are available (roles do not differ on orders).
- AC38: Given 375 px, then the sticky action bar plus bottom bar total <= 128 px and every tap target >= 44 px.

## Non-functional
- Performance: Today and Orders within project.yaml budgets (LCP <= 2.5 s, INP <= 200 ms, JS <= 170 kB gz); loader p95 <= 400 ms at ~12k orders/year; action p95 <= 600 ms.
- Accessibility: WCAG 2.2 AA; status never by colour alone; toasts `role=status` with the Undo reachable by keyboard for the full 6 s (extend while focused); dialogs trap focus; sheets close on Esc.
- Security: authorise every loader/action; zod parse; Origin check; admin note and photos never exposed publicly; no sensitive data in push payloads (number and first name only).
- Privacy: customer name, phone, address visible to admins only; logs without PII.

## Rollout / flags
- Flag: none · Rollout: staging, then launch · Rollback: redeploy; events are append-only.

## Open contract changes (applied 2026-11-10)
1. `saveNote` should neither require nor bump `version` (otherwise autosave would conflict with real actions). — **Resolved in contracts.md (2026-11-10).**
2. `advance`: remove optional `to` or document it ignored; target is derived from status and fulfilment. — **Resolved in contracts.md (2026-11-10).**
3. `allowed.cancel` must follow this spec (pending_approval, quote_needed, approved..out; not quote_sent, not terminal); `allowed` should also expose `markPaid` and `note` flags. — **Resolved in contracts.md (2026-11-10).**
4. Add `nextStatusLabelKey` (or derive from `allowed.advance`) to Today rows; `OrderSummary` needs `version`. — **Resolved in contracts.md (2026-11-10).** `OrderSummary.version` added; Today rows carry `nextStatus` (label derived in the view, no label key).
5. `admin/orders` should return per-tab counts for the To review dot and tab badges. — **Resolved in contracts.md (2026-11-10).**
6. `admin/order-edit` `save` needs `overrideTotalRs: Rs | null` (null clears override) and a `warnings` echo on redirect; free-text lines also permitted (already listed). — **Resolved in contracts.md (2026-11-10).** Warnings return as a redirect flash.

## Open Questions
- Where does a quote_sent order appear in the tabs? Spec puts it in Upcoming with a "Waiting for customer" badge — owner Sabera.
- Can an admin cancel a quote_sent order? Appendix B omits it; spec says no (customer decline or expiry closes it) — owner product-director.
- Should an edit email the customer (date/total changes)? Spec: no automatic email, admin uses WhatsApp — owner Sabera.
- Back one step from Approved (to Pending approval/Quote sent) is not offered; confirm — owner Sabera.
- Should search reach across tabs? — owner ux-lead.
