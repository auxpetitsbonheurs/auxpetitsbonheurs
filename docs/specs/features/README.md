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
6. **Product minimum quantity:** `product.min_quantity` added (nullable, NULL = no minimum, CHECK 1..50) in data-model and `src/app/db/tables/catalogue.ts`; values per product are an owner question below.
7. **One default address per customer:** partial unique index `customer_address_default_uq`.
8. **Manual orders:** `idempotencyKey` (reuses `orders.idempotency_key`), `locale`, notes, warnings flash; admin date horizon 365 days, past dates rejected; `AdminContact` (email optional) and `AdminLine` (free-text) schemas shared by create and edit.
9. **Admin order notes** (`saveNote`) are unversioned, last write wins, so autosave never conflicts with status changes.
10. **`advance`** takes no target; it is derived from status and fulfilment.
11. **Calendar day sheet** reuses `list` with `view=day` (no new loader param). Admin may remove single-day blocks only (`FORBIDDEN`, `range_block`).
12. **Basket limits** are shared constants, not loader fields.
13. **Email cap:** at 90/day only `thank_you` and `admin_alert_*` defer; permanent provider errors go `dead` at once.
14. New contract items: `dismissBanner`, `admin/reset`, `sendTestPush`, `admin/product-preview`, `SettingsInput`, `AvailabilityInput`, `EmailTemplate`, `too_far`, full `PRICE_CHANGED` totals. Full list: contracts.md changelog v0.2.

## Deviation from the brief (for the owner)
- **Notice days:** the brief says the default notice applies only when no item in the basket sets one. The pricing spec uses N = the largest of each item's notice, where an item without its own notice counts as the default (e.g. a basket with a 1-day item and an item with no notice needs 3 days, not 1). We kept this safer rule: it never offers a date that is too soon for an item. Tell us if you want the brief's literal rule instead.

## Owner questions (for Sabera)
Each runs on the stated assumption until answered.
1. **Minimum quantity:** which products need a minimum per order (e.g. dessert cups by 6)? *Assumption:* none set until you tell us; the field exists.
2. **Seasonal items:** is the seasonal window judged on the day the order is placed or the day it is collected/delivered (e.g. Christmas cake ordered 24 Dec for 27 Dec)? *Assumption:* day placed.
3. **Prep list:** should it include orders still waiting for approval or a quote reply? *Assumption:* no, approved orders onwards only (the calendar still shows them).
4. **Sales revenue:** should revenue include the delivery fee? *Assumption:* yes, shown with delivery and pickup totals separately.
5. **Total spent per customer:** completed orders only, or also approved ones not yet completed? *Assumption:* completed only.
6. **Cancelling a sent quote:** may an admin cancel an order while the quote is waiting for the customer? *Assumption:* no; the customer declines or it expires.
7. **Pickup fee on manual orders:** should choosing pickup force the delivery fee to Rs 0? *Assumption:* the admin's entered value is kept, with a warning.
8. **Manual orders, sold-out items:** may admins add a sold-out product to a phone order? *Assumption:* no.
9. **Manual orders, past dates:** may admins record an order after the fact (past date)? *Assumption:* no.
10. **Late quote acceptance:** if a day gets blocked after a quote was sent, may the customer still accept it for that day? *Assumption:* yes.
11. **Order edits:** should changing an order's date or total email the customer? *Assumption:* no automatic email; the admin uses WhatsApp.
12. **Going back from Approved:** should "back one step" from Approved (to waiting for approval) be possible? *Assumption:* no.
13. **Where quotes waiting for a reply appear:** in Upcoming with a "Waiting for customer" badge? *Assumption:* yes.
14. **Evening reminder with no orders:** skip the 18:00 push when tomorrow has none? *Assumption:* skipped.
15. **Week start:** Monday for the calendar and the "this week" sales range? *Assumption:* Monday.
16. **Unpaid list:** include approved orders not yet completed, so payments can be chased early? *Assumption:* yes.
17. **Owner changing their own role** while another Owner exists: allowed? *Assumption:* yes.
18. **Product limits:** are 10 option groups and 30 choices per product enough? *Assumption:* yes.
19. **Renamed product links:** when a product's web address changes, may old links show "not available"? *Assumption:* yes, no redirect.
20. **Save my details on the tracking page** as well as the confirmation page? *Assumption:* confirmation page only.
