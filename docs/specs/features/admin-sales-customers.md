<!-- Template: feature-spec | Filled by: product-manager | Output: docs/specs/features/admin-sales-customers.md -->
# Feature Spec: Admin customers and sales summary

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 · Epic: E-TBD (admin reporting; assigned by /create-epics)

## Summary
Sabera and Sarah find a customer, see their orders and totals and keep a private note; and read a simple sales summary (week, month, last month, custom range) with revenue, order count, average, delivery vs pickup, top 5 products, revenue by source and the unpaid list, exportable as CSV. Admins see both by owner decision (2026-11-10: "Should Admins see the Sales summary? yes").

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-065 | Searchable customer list with order count, total spent, customer's orders, private note | UX Customers, API `admin/customers`, `admin/customer`, AC1-AC8 |
| FR-068 | Sales summary: periods, revenue from Completed, count, average, delivery vs pickup, top 5, by source, unpaid list; Admins and Owner | UX Sales, API `admin/sales`, AC9-AC19 |
| FR-069 | CSV export equal to screen | API `admin/sales-csv`, AC20-AC23 |
| FR-041, FR-039 | Role enforcement; customer sessions barred | Permissions, AC24 |
| FR-012, FR-057, FR-021 | Order totals are snapshots; customer matched by phone/email; E.164 phone | Definitions, Edge cases |
| NFR-004, NFR-008, NFR-007 | Privacy; Rs and MU dates; EN/FR | Non-functional |

## Definitions (single source for numbers)
- **Revenue** = sum of `orders.total_rs` (items plus delivery fee, as stored, FR-012) for orders with status `completed` whose `fulfil_on` falls in the range inclusive (MU dates). Not payment-based: paid flag does not change revenue.
- **Order count** = completed orders in range. **Average** = revenue / order count, rounded to whole Rs (half up); 0 orders gives Rs 0, not an error.
- **Delivery vs pickup** = completed order counts per fulfilment (and their revenue).
- **Top 5 products** = by units sold desc, ties by revenue desc then name; units = sum of `order_item.quantity`, revenue = sum of `line_total_rs` (excludes delivery fee) over completed orders in range, grouped by product (free-text manual items grouped as "Other items", not eligible for top 5 unless named identically; assumption: excluded).
- **Revenue by source** = revenue split by `website`, `custom_request`, `manual`.
- **Unpaid list** = orders with `paid = false` and status approved, in_preparation, ready_for_pickup, out_for_delivery or completed, whose `fulfil_on` is in range; each with number, customer name, status, date, total. Total unpaid amount shown. (Includes not-yet-completed approved orders so overdue payments are visible.)
- **Customer order count** = orders not declined/cancelled/closed; **Total spent** = sum of `total_rs` of that customer's completed orders. Both labelled so in the UI.

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Customers list | `/admin/customers` | Row skeletons | No customers: "Customers appear after the first order." Search miss: "No match for 'x'." + Clear | Alert + Retry | n/a |
| Customer detail | `/admin/customers/:id` | Skeleton | No orders: "No orders yet." | Alert + Retry; 404 "Customer not found" | Note "Saved" status |
| Sales summary | `/admin/sales` | Tile skeletons | Zero orders in range: tiles show Rs 0 / 0, lists say "No completed orders in this period." | Alert + Retry; invalid range inline | n/a |
| CSV export | button on Sales | Button spinner | Exports header row + totals only | Toast "Export failed, try again" | Browser download |

### Customers
- Reached from More. Search field sticky (name, phone, email; phone search normalises digits so "5712 3456" matches +23057123456, FR-021). Row: name, phone, order count, total spent (Rs), last order date. Sort by last order (default) or name or total spent. Cursor pagination, 30 per page.
- Detail: name, phone (Call, WhatsApp buttons), email, language, account yes/no, order count, total spent, **private note** (textarea <= 2000, explicit Save with "Saved" status; never shown to the customer or in emails), orders list (Order rows newest first, link to order; includes cancelled and declined with status badge but not in totals). No edit/delete of the customer in v1 (erasure is an Owner action in a separate spec).
- Dates and currency "Rs 1,250".

### Sales summary
- Period tabs: This week (Mon-Sun, assumption), This month, Last month, Custom (two date pickers, from <= to, max 366 days). Default This month. Selected range written in the header ("1-30 Nov 2026"). Range in URL (`?range=`), shareable inside the admin.
- Stat tiles: Revenue, Orders, Average order. Then Delivery vs Pickup (count and revenue, each with icon and word), Top 5 products list, Revenue by source list, Unpaid list with total and rows linking to the order. "Export CSV" secondary button.
- Footnote under tiles: "Revenue counts Completed orders by order date."
- Visible to Admin and Owner; nav item under More.

### Copy
Keys `admin.customers.*`, `admin.sales.*`, EN/FR via copywriter. Source labels: Website / Custom request / Manual (Site web / Demande sur mesure / Manuelle).

## API Contract
Existing: `admin/customers` (loader `?q&cursor&limit`), `admin/customer` (loader, `saveNote`), `admin/sales` (loader `?range&from&to`), `admin/sales-csv` resource, in contracts.md "Admin app". All auth `admin`. Validation:
| Operation | Input | Output | Errors |
|---|---|---|---|
| Customers list | `q` <= 80, `limit` 1-100 | `{ data: {id,name,phone,email,orderCount,totalSpentRs}[], nextCursor }` | `VALIDATION_FAILED` |
| Customer detail | `:id` uuid | `{ customer, orders: OrderSummary[] }` | `NOT_FOUND` |
| `saveNote` | `{ adminNote <= 2000 }` | `{ ok }` | `VALIDATION_FAILED`, `NOT_FOUND` |
| Sales | `range` enum; custom needs `from`, `to` (MuDate, from <= to, <= 366 days) | as contract | `VALIDATION_FAILED` |
| CSV | same query | `text/csv; charset=utf-8` attachment `apb-sales-<from>_<to>.csv` | `VALIDATION_FAILED`, 401/403 |
CSV layout (UTF-8 with BOM for Excel, comma separator, `\r\n`, cell values starting with `= + - @` prefixed with `'` against formula injection): section rows `Summary` (revenue, orders, average, delivery_count, delivery_revenue, pickup_count, pickup_revenue), `Top products` (rank, product, units, revenue), `By source` (source, revenue), `Unpaid` (number, customer, status, date, total) and `Orders` (number, date, source, fulfilment, items_rs, delivery_fee_rs, total_rs, paid). Amounts as integers, dates `YYYY-MM-DD`.

### Open contract changes (applied 2026-11-10)
1. `admin/sales` response add `deliveryRevenueRs`, `pickupRevenueRs`, `unpaidTotalRs`, and `unpaid[]` entries add `status` and `fulfilOn`; `top5` ordered by units then revenue (contract does not state ordering). — **Resolved in contracts.md (2026-11-10).**
2. Document the definitions above (revenue incl. delivery fee, unpaid scope) in the contract; `bySource` must include all three sources, zero when none. — **Resolved in contracts.md (2026-11-10).**
3. `admin/sales-csv`: add the Orders section (one row per completed order in range) so totals can be reconciled; define filename and BOM. — **Resolved in contracts.md (2026-11-10).**
4. `admin/customers` add `lastOrderOn: MuDate | null`, `sort=last_order|name|spent`; `q` phone normalisation noted. `admin/customer` return `locale`, `hasAccount`, `adminNote`, WhatsApp/tel URLs. — **Resolved in contracts.md (2026-11-10).**
5. Sort-key cursor for `spent` sort requires aggregate query; acceptable at < 12k orders/year (no index change). — **Accepted, no contract change (2026-11-10).**

## Data Model Changes
None. Reads `orders` (status, fulfil_on, total_rs, fulfilment, source, paid), `order_item` (product_id, quantity, line_total_rs, snapshot name), `customer` (`admin_note`). Aggregations are computed on request through indexes `orders (status, fulfil_on)` and `order_item (product_id)`; no materialised tables. Customer totals are computed, never stored (cannot drift).

## Permissions matrix
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| View customers and detail | no | no | yes | yes |
| Edit private customer note | no | no | yes | yes |
| View sales summary | no | no | yes (owner decision) | yes |
| Export CSV | no | no | yes | yes |
Enforced on loaders, actions and the CSV resource.

## Analytics Events
No third-party analytics. Server logs, no PII: `sales_viewed` (range, actorRole), `sales_exported` (range, rows), `customer_note_saved` (customerId, actorRole), `customers_searched` (query length only, never the query).

## Edge Cases
- Range with no orders: zeros, empty lists, CSV valid.
- Custom range from > to, over 366 days, or in future only: validation error; future dates allowed (shows zeros).
- Order moved between statuses while viewing: figures refresh on reload only.
- Completed order later edited (FR-053 forbids edit of Completed), but paid toggled: revenue unchanged, unpaid list changes.
- Back one step from Completed removes the order from revenue.
- Order whose `fulfil_on` changes (before completion) moves ranges accordingly.
- Time zone: ranges are MU calendar dates; "This week" from Monday (assumption).
- Customer with several guest orders and different names: one customer by email/phone; name shown is the latest customer record name; order rows show their own snapshot names.
- Duplicate-looking customers (same person, different phone): not merged in v1.
- Customer anonymised/deleted under retention: shows "Deleted customer", no phone; excluded from search.
- Search with special characters/SQL wildcards: escaped, parameterised.
- Free-text manual items affect revenue but not top 5.
- Cancelled orders appear in customer detail list but never in counts, revenue or totals.
- Large export: <= 12k rows/year; streamed, not paginated.
- Concurrent note edits: last write wins (accepted); two admins see each other's note on reload.
- Unpaid list of 100+ rows: capped to 200 displayed with "Export CSV for all".

## Acceptance Criteria
- AC1 (FR-065): Given 3 customers, when the list loads, then all show name, phone, order count and total spent, default sorted by last order.
- AC2 (FR-065): Given a customer with 3 orders (2 completed Rs 1,000 and Rs 500, 1 cancelled), then order count is 2 and total spent Rs 1,500 (cancelled excluded from both).
- AC3 (FR-065): Given search "5712 3456", when submitted, then the customer stored as +23057123456 is found.
- AC4 (FR-065): Given search by partial name or email, then matching customers show; given no match, then the empty state with Clear shows.
- AC5 (FR-065): Given a customer, when opening detail, then all their orders (including cancelled with badge) are listed and each links to the order.
- AC6 (FR-065): Given a note typed and saved, when reopened by another admin, then the note shows; the note never appears on the customer's tracking page or emails.
- AC7 (FR-065): Given a note of 2001 characters, then `VALIDATION_FAILED`.
- AC8 (FR-065): Given 45 customers, when scrolling, then page 2 loads via cursor with no duplicates or gaps.
- AC9 (FR-068): Given completed orders totalling Rs 12,000 in 10 orders in November, when This month loads, then revenue Rs 12,000, orders 10, average Rs 1,200.
- AC10 (FR-068): Given 3 Approved, 1 Cancelled and 1 Declined orders in range, then none counts in revenue or order count.
- AC11 (FR-068): Given an average of Rs 1,166.67, then it shows Rs 1,167.
- AC12 (FR-068): Given 6 delivery and 4 pickup completed orders, then Delivery 6 and Pickup 4 with their revenues summing to total revenue.
- AC13 (FR-068): Given 7 products sold, then top 5 lists the five with most units, ties broken by revenue; fewer than 5 shows fewer rows.
- AC14 (FR-068): Given revenue by source, then website + custom_request + manual equals total revenue.
- AC15 (FR-068): Given an approved unpaid order Rs 3,000 and a completed unpaid order Rs 800 in range, then the unpaid list shows both with total Rs 3,800; marking one paid removes it after reload.
- AC16 (FR-068): Given Last month, then range is the previous calendar month in MU dates; Custom accepts any range <= 366 days.
- AC17 (FR-068, FR-041): Given an Admin session, when opening Sales, then it loads; given a customer or anonymous session, then redirected to `/admin/login`.
- AC18 (FR-068): Given a completed order on 30 Nov 23:30 MU, then it falls in November, not December.
- AC19 (FR-068): Given zero orders, then tiles show Rs 0 / 0 / Rs 0 without division errors.
- AC20 (FR-069): Given Export, then the CSV Summary totals equal the on-screen tiles for the same range.
- AC21 (FR-069): Given the Orders section, then its row count equals the order count and the sum of `total_rs` equals revenue.
- AC22 (FR-069): Given a customer name starting with "=", then the exported cell is prefixed so it is not evaluated as a formula.
- AC23 (FR-069): Given French locale names with accents, then they open correctly in Excel (UTF-8 BOM).
- AC24 (FR-039): Given a customer session, when calling `/admin/sales.csv`, then no data returned (redirect/403).

## Non-functional
- Performance: both routes within initial JS <= 170 kB gzip; sales loader p95 <= 500 ms at 12k orders; list p95 <= 300 ms; no client waterfalls; CSV streamed.
- Accessibility: WCAG 2.2 AA; tabs as `role=tablist` with keyboard; tiles have text labels; delivery/pickup and source never colour-only; lists as real lists/tables; 44 px targets; 375 px no horizontal scroll, 200% zoom.
- Security: server-side role check on every loader and the CSV resource; zod on query params; parameterised search; CSV formula-injection guard; no export link without session.
- Privacy: customer PII (name, phone, email) visible to admins only (NFR-004); CSV contains customer name only in Unpaid section (no phone/email) to limit leakage; private note admin-only, never logged; retention per data-model.md (anonymised customers excluded).

## Rollout / flags
- Flag: none · Rollout: with admin launch (Customers is Should, can ship after launch) · Rollback: redeploy; read-only except notes.

## Open Questions
1. Revenue includes the delivery fee (assumption) — confirm with Sabera whether she wants it split or excluded.
2. "Total spent" counts only Completed orders; confirm vs including Approved — owner product-director.
3. Week starts Monday — Sabera.
4. Unpaid list scope includes approved-but-not-completed orders (assumption).
5. Should the CSV omit customer names entirely for Admins? Assumption: names only in Unpaid.
