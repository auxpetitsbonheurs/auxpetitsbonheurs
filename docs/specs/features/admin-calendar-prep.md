<!-- Template: feature-spec | Filled by: product-manager | Output: docs/specs/features/admin-calendar-prep.md -->
# Feature Spec: Admin calendar, day blocking and prep list

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 · Epic: E-TBD (admin operations; assigned by /create-epics)

## Summary
Sarah (Admin) and Sabera (Owner) see every active order on a month, week and day calendar, colour-coded delivery vs pickup, close single days from the calendar, and open a printable/shareable prep list for the kitchen. There is no daily cap (PRD 5.2), so the calendar is a planning view, not a capacity tool. Blocking a day stops new customer orders immediately and never touches existing ones.

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-058 | Month counts per day, week and day lists, delivery/pickup colours, blocked greyed, declined/cancelled/closed excluded | UX Calendar, API `admin/calendar`, AC1-AC6 |
| FR-059 | Admin blocks/unblocks a single day; warning lists existing orders; applies at once to customers | UX Day sheet, API `blockDay`/`unblockDay`, AC7-AC12 |
| FR-060 | Prep list per day grouped product then size/flavour, quantities, cake messages, share and print | UX Prep list, API `admin/prep`, AC13-AC18 |
| FR-014, FR-013 | Customer date picker consumes blocks (reason category only, never private reason) | Edge cases, AC11 |
| FR-072 | Evening reminder push deep-links to `/admin/calendar/<date>/prep` | UX Prep list entry points |
| FR-041, FR-066 | Roles; Owner manages ranges in Availability (spec: admin-menu-content) | Permissions |
| NFR-002, NFR-006, NFR-007, NFR-008 | A11y, 375 px first, EN/FR, Mauritius dates | Non-functional |

## UX
Design components: Calendar, Prep list, Order row, Sheet, Dialog (design-system.md "Domain components (admin)").

### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Calendar month (default) | `/admin/calendar?month=YYYY-MM` | Grid skeleton, 44 px cells | Month with no orders: grid shows no counts; helper line "No orders this month." | Alert "Could not load the calendar." + Retry | n/a |
| Calendar week | `?view=week&date=` | 7 Order-row skeletons | Per day "Nothing planned." | as above | n/a |
| Calendar day list | `?view=day&date=` | Row skeletons | "No orders on this day." + "Block this day" | as above | n/a |
| Day sheet (bottom sheet from a month cell) | same route, sheet state | Counts from loader, no extra fetch | Same as day list | Inline Alert, sheet stays open | Toast "Day blocked" / "Day reopened" with Undo (6 s, calls the opposite action) |
| Block confirm dialog | sheet | Button spinner | n/a | Alert in dialog | Closes; cell becomes blocked |
| Prep list | `/admin/calendar/:date/prep` | List skeleton | "No orders to prepare on this day." + back to Calendar | Alert + Retry | Toast "Copied" after Share fallback |

### Behaviour
- **Month cell:** date, total count (phones); on `md`+ two icon+number pairs (delivery truck, pickup bag). Colour is never the only cue (icon + word in accessible name: "12 Dec: 2 delivery, 3 pickup, blocked"). Today ringed. Blocked day: muted fill + lock icon. A day with orders and blocked shows both.
- **Counts include** every order whose status is not declined, cancelled or closed (so Pending approval and Quote needed count, shown on week/day lists with their status badge). Quote needed requests count on their requested date.
- **Week/day lists** use Order rows sorted by time window start, then order number. Tapping a row opens `/admin/orders/:id`.
- **Block a day:** Day sheet "Block this day" with optional private reason (<= 200 chars). If the day already has active orders, the confirm dialog first lists them (number, name, window) with the text "These orders stay as they are. Contact the customers if needed." Confirm blocks; the day sheet then shows the same list again as a reminder. No orders: block directly, no dialog.
- **Unblock:** "Reopen this day". Only a single-day block (`starts_on = ends_on`) can be removed by an Admin. A day inside an Owner range shows "Blocked by the Owner (range). Change it in Availability." for Owner; Admin sees "Blocked for the whole period" with no action. The reason is visible to admins, never to customers.
- **Closed weekday (Sunday) is not a block.** It renders muted with the label "Closed day"; Block/Unblock is hidden there (set in Availability, Owner).
- **Prep list:** header date (long, locale), summary "N orders, M items". Groups by product (localised name, order of the menu), then variant line = size/flavour option labels joined (" · "), quantity "x2" and, for cakes, each message as a quoted line. Identical product+variant+message-set merge into one line with the summed quantity; different messages stay under the same line as separate quoted lines. Free-text manual items group under "Other" with their text. Orders are not shown here (no customer PII on the prep list). Order contributing statuses: approved, in_preparation, ready_for_pickup, out_for_delivery, completed.
- **Share:** Web Share API with `shareText` (plain text, same grouping); fallback copy-to-clipboard. **Print:** `window.print()` with print stylesheet (black on white, no chrome, A4, avoids breaking inside a group).
- **Entry points:** Day sheet "Prep list", Today "Tomorrow" section, the 18:00 push.

### Copy
Strings in EN+FR via i18n keys `admin.calendar.*` and `admin.prep.*` (copywriter owns FR; admin UI follows the admin's locale, FR-046). Dialog text above is the EN source.

## API Contract
Existing contracts (`docs/architecture/api/contracts.md`, "Admin app"): `admin/calendar` (loader; `blockDay`, `unblockDay`) and `admin/prep` (loader). Auth `admin` for all. This spec uses them as written, with the changes under Open contract changes.

| Operation | Name | Input | Output | Errors | Auth |
|---|---|---|---|---|---|
| Load calendar | `admin/calendar` loader | `month`, `view`, `date` | `days[]`, `list[]` (OrderSummary) | 401 redirect, 400 bad month | admin |
| Block day | `blockDay` | `{ date: MuDate, reason? <= 200 }` | `{ ok, existingOrders: OrderSummary[] }` | `VALIDATION_FAILED`, `FORBIDDEN` (customer session) | admin |
| Unblock day | `unblockDay` | `{ date }` | `{ ok }` | `NOT_FOUND` (not blocked), `FORBIDDEN` (date inside an Owner range, Admin caller) | admin |
| Load prep | `admin/prep` loader | `:date` | `{ date, groups[], shareText }` | 400 bad date | admin |

Blocking an already blocked date is idempotent (`ok`, no duplicate row). Past dates can be viewed but not blocked (`VALIDATION_FAILED`, field `date`).

### Open contract changes (applied 2026-11-10)
1. `admin/calendar` `days[]` add `closedDay: boolean`, `blockKind: "single" | "range" | null`, `blockReason: string | null` (admin only) so the UI decides which action to offer without a second call. — **Resolved in contracts.md (2026-11-10).**
2. `blockDay` / the day sheet need the existing orders before confirming: add loader param `?date=` returning `dayOrders` (or reuse `list` with `view=day`); `blockDay` still returns `existingOrders` as the authoritative list. — **Resolved differently (2026-11-10):** no new `?date` param; the day sheet uses `list` with `view=day`, `blockDay` still returns `existingOrders`.
3. `admin/prep` group `variants[]` add `orderCount` and `statusesIncluded` documentation: contributing statuses are approved..completed (see Open Questions 1). `shareText` is built server-side in the admin's locale. — **Resolved in contracts.md (2026-11-10).** Contributing statuses = *confirmed* group (approved..completed); pending inclusion is an owner question (README).
4. `unblockDay` error: add `FORBIDDEN` reason `range_block` (Admin on a range). — **Resolved in contracts.md (2026-11-10).**

## Data Model Changes
None. Uses `blocked_date` (single day = `starts_on = ends_on`), `orders` (index `fulfil_on` partial WHERE status NOT IN declined, cancelled, closed), `order_item.options` (variant labels), `order_item.cake_message`. Block creation writes `created_by`. Counts are computed per request (< 1k orders/month).

## Permissions matrix
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| View calendar, day lists, prep list | no | no | yes | yes |
| Block / reopen a single day | no | no | yes | yes |
| Remove a day that is part of a range block | no | no | no | yes (Availability) |
| See block reason | no | no | yes | yes |
All checks run on the server; a customer session on `/admin/calendar` is redirected to `/admin/login` (FR-039).

## Analytics Events
No third-party analytics in admin (NFR-004, NFR-011). Structured server logs only, no PII:
| Event | Trigger | Properties |
|---|---|---|
| `calendar_day_blocked` | blockDay success | date, hadOrders (n), actorRole |
| `calendar_day_unblocked` | unblockDay success | date, actorRole |
| `prep_list_shared` / `prep_list_printed` | client beacon-free log on action | date, method |

## Edge Cases
- Day with 0 orders vs a day with only cancelled orders: both show no count.
- Orders arrive while the calendar is open: no live refresh; header "Refresh" action; counts may lag (acceptable).
- Block while a customer is mid-checkout: submit is refused with `DATE_UNAVAILABLE` (FR-015); order already placed earlier stays.
- Two admins block the same day: second call idempotent, both see the same state.
- Admin unblocks a day an Owner later blocked as range: Admin gets `FORBIDDEN`.
- Month navigation across year, 5-6 week months; weeks start Monday (assumption, Mauritius convention).
- Mauritius timezone: "today" and all dates are UTC+4 calendar dates; an order at 23:30 MU is still that day.
- Prep list long cake message (<= 200 chars) wraps, never truncates; emoji kept; message on non-cake items shown if present.
- Order edited after printing: the printed sheet is a snapshot; list shows "Generated <time>".
- A cancelled order (after being approved) vanishes from calendar and prep on next load.
- 100+ orders a day: lists paginate by day; prep list is not paginated (single document).
- Unblocking a past or today date: allowed for today, not for past.

## Acceptance Criteria
- AC1 (FR-058): Given 2 pickup and 1 delivery approved orders on 12 Dec, when the month view loads, then the 12 Dec cell shows 3 and the accessible name states 2 pickup and 1 delivery.
- AC2 (FR-058): Given a cancelled order on 12 Dec, when the month view loads, then it is not counted and not listed in week/day views; same for declined and closed.
- AC3 (FR-058): Given a blocked day, when the month loads, then the cell is muted with a lock icon and still shows its orders count.
- AC4 (FR-058): Given week view, when loaded, then each day lists its orders sorted by window start then number, with fulfilment icon and status badge.
- AC5 (FR-058): Given a Sunday set as closed weekday, when the month loads, then it is labelled "Closed day" and offers no block action.
- AC6 (FR-058): Given 375 px width and FR locale, when the month loads, then there is no horizontal scroll and cell labels are not truncated.
- AC7 (FR-059): Given a day with no orders, when the Admin taps Block, then the day is blocked without a dialog and the customer date picker disables it on the next request.
- AC8 (FR-059): Given a day with 2 active orders, when the Admin taps Block, then a dialog lists both orders and, on confirm, the day is blocked and both orders keep their status.
- AC9 (FR-059): Given a blocked single day, when the Admin taps Reopen, then it is removed and the customer date picker allows it again.
- AC10 (FR-059, FR-041): Given a day inside an Owner range block, when an Admin calls `unblockDay`, then the server returns `FORBIDDEN` and the block remains.
- AC11 (FR-014): Given a block with private reason "Family event", when a customer taps that day, then only the category "closed/blocked" shows and the reason is not in the response.
- AC12 (FR-059): Given a past date, when `blockDay` is called, then `VALIDATION_FAILED` on `date`.
- AC13 (FR-060): Given 2 identical cakes (same product, size, flavour, no message), when the prep list loads, then one line shows quantity 2.
- AC14 (FR-060): Given two cakes same variant with messages "Happy Bday Ana" and "Joyeux anniversaire", then one line x2 shows both messages as quoted lines.
- AC15 (FR-060): Given an order in pending_approval, when the prep list loads, then it is not included.
- AC16 (FR-060): Given the prep list, when Share is tapped, then the Web Share sheet opens with `shareText`; on browsers without it the text is copied and a confirmation shows.
- AC17 (FR-060): Given the prep list, when printed, then output is black on white with no navigation chrome and groups are not split across pages.
- AC18 (FR-060, FR-041): Given no orders, then the empty state shows; given a customer session or anonymous, then access is refused; the prep list never shows customer names or phones.

## Non-functional
- Performance: `/admin/calendar` and prep within initial JS <= 170 kB gzip; month loader p95 <= 300 ms; no client waterfalls (one loader).
- Accessibility: WCAG 2.2 AA; month grid is a table/grid with keyboard arrows (day by day, PageUp/Down by month); targets >= 44 px; fulfilment and blocked state never colour-only; sheet and dialog trap and restore focus; print output meets contrast.
- Security: server-side role check on every loader/action; zod-validated date params; no private reason in any public loader.
- Privacy: calendar lists contact names (admin-only); prep list carries no personal data; shared text contains no PII.

## Rollout / flags
- Flag: none · Rollout: part of admin launch · Rollback: redeploy previous build (no schema change).

## Open Questions
1. Prep list contributing statuses: spec assumes approved onwards (excludes pending_approval, quote_needed, quote_sent) while calendar counts include pending ones per FR-058. Confirm with Sabera that the kitchen wants unconfirmed orders excluded — owner product-director.
2. Week start day (Monday assumed) — owner Sabera.
3. Resolved 2026-11-10: Today's "Tomorrow" list and the calendar show *active* orders (incl. pending); the 18:00 push count equals the prep list (*confirmed* orders), so the number matches the list it opens.
