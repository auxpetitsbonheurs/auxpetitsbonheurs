# Feature specs — index

Updated: 2026-11-10 · Contract of record: `docs/architecture/api/contracts.md` v0.2 · Data: `docs/architecture/data-model.md`.
All open contract changes in these specs were applied or answered on 2026-11-10 (each item is marked in its spec).

| Spec | PRD areas | Primary FRs | Status |
|---|---|---|---|
| [catalogue-browsing](catalogue-browsing.md) | Customer site: home, menu, product, gallery, info pages | FR-001..010 | draft |
| [pricing-availability-promotions](pricing-availability-promotions.md) | Pricing, notice/availability, promotions (domain rules) | FR-006, 008, 011..017, 056 | draft |
| [checkout-and-tracking](checkout-and-tracking.md) | Basket, checkout, confirmation, tracking, customer cancel | FR-011, 018..027 | draft |
| [custom-requests-quotes](custom-requests-quotes.md) | Custom cake form, photos, quotes, accept/decline, expiry | FR-028..033 | draft |
| [customer-accounts](customer-accounts.md) | Sign-up/in, profile, addresses, My orders, Reorder, Save my details | FR-034..039 | draft |
| [admin-access-team](admin-access-team.md) | Admin login/reset, roles, invites, team, profile, PWA | FR-039..047 | draft |
| [admin-orders](admin-orders.md) | Today, Orders tabs, order detail, actions, edit, log | FR-048..054, 056 | draft |
| [admin-manual-orders](admin-manual-orders.md) | Add order (phone/WhatsApp/walk-in), customer matching | FR-055..057 | draft |
| [admin-calendar-prep](admin-calendar-prep.md) | Calendar, day blocking, prep list | FR-058..060 | draft |
| [admin-menu-content](admin-menu-content.md) | Menu, product editor, promotions, gallery, availability, settings | FR-061..067, 073 | draft |
| [admin-sales-customers](admin-sales-customers.md) | Customers, sales summary, CSV | FR-065, 068, 069 | draft |
| [notifications](notifications.md) | Customer emails, admin push/email alerts, WhatsApp templates, outbox | FR-070..075 | draft |

## Decisions made during consolidation (technical-director, 2026-11-10)
1. **Save my details / sign-up (security):** these create an unconfirmed account only; earlier guest orders are linked in `auth/confirm` (`type=signup`) after the email is confirmed. Before that, no history is linked or shown. Stops a guest order placed under someone else's email from revealing that person's orders. `requireCustomer` requires a confirmed email; magic link never creates accounts.
2. **Team route:** `/admin/team` (contract), reached from the More menu; the prototype's `/admin/more/team` is dropped.
3. **Customer opening `/admin/*`:** redirect to `/admin/login`, no admin data (replaces architecture's 404). The brief only requires that customers cannot open admin pages; the login page is public, so a 404 hid nothing.
4. **Photos:** client target ≤ 300 kB (brief), server hard cap 1 MB per object. PRD NFR-001, R9, architecture and `project.yaml` (`image_max_kb: 300`) aligned. ADR-0001 still mentions 250 kB; it is left unedited (ADRs are immutable) and this note governs.
5. **Status groups:** *active* (all but declined/cancelled/closed) for calendar, Today and customer order counts; *confirmed* (approved..completed) for prep list, evening reminder count and unpaid list. The 18:00 push count therefore equals the prep list it opens.
6. **Product minimum quantity:** `product.min_quantity` added (nullable, NULL = no minimum, CHECK 1..50) in data-model and `src/app/db/tables/catalogue.ts`; no product has a minimum at launch (owner Q1).
7. **One default address per customer:** partial unique index `customer_address_default_uq`.
8. **Manual orders:** `idempotencyKey` (reuses `orders.idempotency_key`), `locale`, notes, warnings flash; admin date horizon 365 days, past dates allowed with a warning (owner Q9, 2026-11-10); `AdminContact` (email optional) and `AdminLine` (free-text) schemas shared by create and edit.
9. **Admin order notes** (`saveNote`) are unversioned, last write wins, so autosave never conflicts with status changes.
10. **`advance`** takes no target; it is derived from status and fulfilment.
11. **Calendar day sheet** reuses `list` with `view=day` (no new loader param). Admin may remove single-day blocks only (`FORBIDDEN`, `range_block`).
12. **Basket limits** are shared constants, not loader fields.
13. **Email cap:** at 90/day only `thank_you` and `admin_alert_*` defer; permanent provider errors go `dead` at once.
14. New contract items: `dismissBanner`, `admin/reset`, `sendTestPush`, `admin/product-preview`, `SettingsInput`, `AvailabilityInput`, `EmailTemplate`, `too_far`, full `PRICE_CHANGED` totals. Full list: contracts.md changelog v0.2.

## Deviation from the brief (owner-approved 2026-11-10)
- **Notice days:** the brief says the default notice applies only when no item in the basket sets one. The pricing spec uses N = the largest of each item's notice, where an item without its own notice counts as the default (e.g. a basket with a 1-day item and an item with no notice needs 3 days, not 1). This safer rule never offers a date that is too soon for an item. **Owner-approved (Q21).**

## Owner decisions (2026-11-10)
Sabera answered all 21 questions. **CHANGED** = differs from our assumption; specs, PRD, data model and contract were updated.
1. **Minimum quantity:** none at launch; the field stays, the Owner can set it later.
2. **Seasonal items (CHANGED):** the window is judged on the pickup/delivery date. The date picker offers only in-window dates for seasonal items; basket and checkout validate the chosen date.
3. **Prep list:** approved orders onward only.
4. **Sales revenue:** includes delivery fees; delivery and pickup totals shown separately.
5. **Total spent per customer:** completed orders only.
6. **Cancelling a sent quote (CHANGED):** admin may cancel; the quote is withdrawn and tracking shows cancelled; same customer cancellation email as other admin cancels.
7. **Pickup fee on manual orders (CHANGED):** forced to Rs 0.
8. **Manual orders, sold-out items (CHANGED):** admins may add them, with a warning; customers stay blocked.
9. **Manual orders, past dates (CHANGED):** allowed to record orders after the fact; skip notice, closed-day and blocked-day checks, with a warning; still count in sales.
10. **Late quote acceptance:** allowed after the day is blocked.
11. **Order edits (CHANGED):** changing date or total sends an automatic "Your order was updated" email (EN/FR, order language) with the new date and/or total; new `order_updated` key in notifications.
12. **Going back from Approved:** not possible.
13. **Quotes waiting for a reply:** in Upcoming with a "Waiting for customer" badge.
14. **Evening reminder with no orders:** 18:00 push skipped.
15. **Week start:** Monday.
16. **Unpaid list:** includes approved orders not yet completed.
17. **Owner changing their own role:** allowed while another Owner exists.
18. **Product limits:** 10 option groups and 30 choices are enough.
19. **Renamed product links (CHANGED):** the old URL redirects (301) to the new one; slug history kept in `product_slug_history`.
20. **Save my details:** confirmation page only.
21. **Notice rule:** safer rule kept (see deviation above); owner-approved.
