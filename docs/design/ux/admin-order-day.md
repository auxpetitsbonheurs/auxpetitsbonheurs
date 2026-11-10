# UX Flow — Admin order day (core admin task)

PRD: FR-040, 045, 048..060, 072, 073, 075 · Journeys: J4, J6, J8, J11 · Specs: `admin-orders`, `admin-manual-orders`, `admin-calendar-prep`, `notifications` · Personas: P2 Owner (Sabera), P3 Admin · Device: phone, one-handed, installed PWA · Critical journey: yes · Updated: 2026-11-10

## Goal
Run the day from the phone: see what needs action, approve, move orders along, record payment, message customers. Success = no order waits unnoticed; each step logged and the right email sent.

## Entry points
- Push or email alert tap opens `/admin/orders/:id` (new order, request, quote answered, cancelled, 24 h pending, quote expired); 18:00 push opens `/admin/calendar/<tomorrow>/prep`.
- Home-screen icon opens `/admin` (Today). Bottom bar: Today, Orders, Calendar, Menu, More.

## Happy path
```mermaid
flowchart TD
  A[Alert tap or open app] --> B{Signed in?}
  B -->|no| C[/admin/login?next] --> D[Today /admin]
  B -->|yes| D
  D --> E[To review count]
  E --> F[/admin/orders/:id]
  F --> G{Decision}
  G -->|Approve| H[Approved: email confirmed]
  G -->|Decline + reason| I[Declined email]
  G -->|Quote needed| Q[Send quote: custom-request-quote flow]
  H --> J[Next status: In preparation]
  J --> K[Ready for pickup / Out for delivery]
  K --> L[Completed]
  H --> M[Mark paid]
  F --> W[WhatsApp: pick template, edit, open chat]
  D --> N[Calendar: block a day / day sheet]
  N --> P[Prep list: share or print]
```
| # | Screen | Action | System response |
|---|---|---|---|
| 1 | `/admin/login` | Email + password | Session 30 days; redirect to `next` or Today |
| 2 | Today | Read counts (to review, quotes to send, unpaid), today/tomorrow rows | One-tap next-status button per row (`advance`) |
| 3 | Orders (`/admin/orders`) | Tab To review / Upcoming / Completed / Closed; search name, phone, number; filters | Cursor list, 30/page |
| 4 | Order detail | Approve / Decline / Send quote; items, address, Maps, Call, WhatsApp, photos, private note, activity log | Only `allowed` actions shown; each logged; email queued |
| 5 | same | Advance: In preparation, Ready (pickup) or Out for delivery, Completed | Customer emailed for ready/on the way/thank you |
| 6 | same | Mark paid | Toggle; who/when recorded; any status |
| 7 | same | WhatsApp | Choose template (approved, ready, on the way, payment reminder, blank), editable, opens wa.me in order language |
| 8 | `/admin/orders/new` | Manual order | Customer matched by phone/email; saved Approved; warnings for blocked/too-soon dates |
| 9 | `/admin/orders/:id/edit` | Edit lines, date, window, fee, override total | Recalculated, logged, no customer email |
| 10 | `/admin/calendar` | Month/week/day; tap a day; Block day (reason) | Counts exclude cancelled/declined/closed; blocked greyed; customers see it disabled at once |
| 11 | `/admin/calendar/:date/prep` | Read grouped quantities and cake messages; Share / Print | Confirmed orders only; no customer PII |

## Alternative and error paths
| Trigger | What the user sees | Recovery |
|---|---|---|
| Wrong password / inactive admin | Generic "Email or password is incorrect" | Retry or `/admin/forgot` |
| Session expired (30 days) or deactivated | Redirect to login with `next`; deactivated is signed out at once | Sign in |
| Customer or non-admin session on `/admin/*` | Redirect to `/admin/login` | Sign in as admin |
| Admin opens Owner page (Availability, Settings, Team) | Items hidden in More; typed URL gives 403 "Owner only" | Ask Owner |
| Two admins act on same order | `ORDER_CHANGED`: "This order changed, reload" with Reload button | Reload, redo action |
| Invalid transition (e.g. cancel Completed) | `INVALID_TRANSITION` message; button not shown normally | None |
| Block a day with existing orders | Warning lists them; block still applies (orders unaffected) | Contact customers |
| Admin tries to remove a range block | `FORBIDDEN` "Only the Owner can remove date ranges" | Owner via Availability |
| Manual order, blocked/too-soon date | Warning banner, Save still possible | Save or change |
| Sold-out product on manual order | `PRODUCT_UNAVAILABLE` | Use free-text item or other product |
| Email failure | Order saved, retried; log shows "email queued/failed" | Automatic retry |
| Offline / slow network | Banner "You are offline"; actions disabled; list shows last loaded | Reconnect |
| Empty states | Today: "Nothing to do today"; Orders tab: "No orders here"; Prep: "No confirmed orders for this day" | Calendar link |
| Back one step | Confirm dialog "No email is sent" | Confirm/cancel |
| Cancel (Approved onward) | Confirm dialog with optional reason; customer emailed | Cancel dialog |

## States per screen
Loading: skeleton rows; optimistic status button with spinner then success tick. Permission: role-gated nav. Error toast has Retry; destructive actions always confirm.

## EN/FR notes
Admin UI language is per admin (profile). Customer-facing text (emails, WhatsApp templates, decline reason prompts) uses the order's language; show a badge "Customer language: FR" on order detail. Prep list `shareText` is in the admin's language.

## Accessibility notes
Bottom bar is `nav` with `aria-current`; targets >= 48 px; status changes announced ("Order APB-0042 now In preparation"); dialogs trap focus and return it; calendar days are buttons with count and state in the accessible name; print stylesheet for prep list.

## Analytics events
Not tracked for admin (no cookies); audit is the order activity log (FR-045).

## Open questions
- Evening reminder skipped when 0 orders, unpaid includes approved (assumptions Q14, Q16).
