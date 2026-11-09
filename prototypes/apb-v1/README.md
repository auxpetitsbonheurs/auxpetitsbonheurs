# Aux petits bonheurs - working prototype v1

Type: working-prototype

Question: can the client (and Sabera/Sarah) click through ordering, quotes and day-to-day order management and tell us what feels right, before the real build?

## Run

    cd prototypes/apb-v1
    npm install && npm run dev      # http://localhost:5173
    npm test                        # domain rule tests (Vitest)
    npm run build                   # typecheck + production build

## Journeys

1. Customer order: Home, Menu (type + allergen filters), Product, Basket & checkout, Confirmation, Tracking (`/order/<token>`).
2. Custom cake request (`/custom`), admin sends quote, customer accepts/declines on tracking page.
3. Admin (`/admin`): Today, Orders (tabs, search, filters, detail with all actions), Calendar with block/unblock and printable prep list.
4. Admin content: manual order, Menu + product editor, Promotions.
5. Roles: Owner sees Team and Availability & Settings; Admin is blocked even by URL.

## What is faked

- Login: the toolbar role switcher (Customer / Admin Sarah / Owner Sabera).
- Backend: browser localStorage; the "server" rules live in `src/mocks/orderActions.ts`.
- Emails and push alerts: the toolbar Outbox (push also shows as a toast for the signed-in admin).
- Time: "Clock +1 day" in the toolbar moves the app's date (quote expiry, promotions).
- Images: generated SVG illustrations. Placeholders for Juice number, address, fee.
- Not built: customer accounts, Gallery management, Sales summary, admin photo upload, drag-reorder (arrows instead), week/day calendar lists, per-order email retries.

## Demo script

1. Open `/` on a phone width. Point at the banner, offer card, seasonal item. Switch EN/FR.
2. Menu: filter "Eggless"; open Chocolate cake (sale price). Pick size + flavour, type a message, add to basket.
3. Add Dessert Cups (min 6). Open the basket: delivery, tap a greyed date, pick one, window, details, tick policies, Send.
4. Confirmation shows APB-0013; open the tracking link. Cancel is visible.
5. Toolbar: switch to Admin Sarah. Today shows counts; open the new order, Approve. Open Outbox to show the emails and push alerts.
6. Back on the tracking link (switch to Customer): Cancel is gone.
7. Custom cake: submit a request with a photo. As Admin, open it (Quote needed), Send quote. As customer, the tracking link shows Accept/Decline.
8. Toolbar "Clock +1 day" x3 on the seeded APB-0012 (quote sent): it closes itself; its tracking link cannot be accepted.
9. Calendar: tap a day, Block it (warning if orders), open Prep list, Print.
10. Menu: New product with + Size, + Flavour, + Add-ons, + Message. Promotions list shows live and scheduled.
11. Owner Sabera: More shows Team and Settings. Switch to Sarah and open `/admin/team`: blocked.

Seeded tracking links: `/order/pending-demo-7k2m9xq4` (pending), `/order/quote-demo-4h8d1qw2` (quote needed), `/order/quotesent-demo-3n6b5wy1` (quote to accept), `/order/approved-demo-9c2v7zk3`.

## Version log

- v1: first build of all five journeys.
