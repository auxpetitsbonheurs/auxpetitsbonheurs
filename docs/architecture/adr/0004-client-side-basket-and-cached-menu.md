# ADR-0004: Client-side basket and cached menu

Status: accepted (refines the "Basket" decision in architecture.md; ADR-0001 unchanged)
Date: 2026-11-11 · Deciders: the Owner; technical-director, lead-frontend, lead-backend, security-lead

## Context
After ADR-0003 and the latency fixes, every basket change and every basket page still costs a
round trip from the phone to the Worker and on to Supabase (staging, Pixel 7: add POST about
1.5 s, `basket.data` about 1.9 s). Customers read that as a dead button. The basket holds no
prices and the catalogue is small (one bakery, tens of products) and public, so the phone can
do this work itself. The Owner's rule: stale items are rare; handle them calmly and never break
the flow.

## Decision
1. **Instant Add to basket.** With JavaScript, add, change quantity and remove run in the
   browser with **no network call** (`app/lib/basket-store.ts`). The browser writes the same
   `apb_basket` cookie as the server: URL-encoded JSON lines `{ lineId, productId, options,
   cakeMessage?, quantity }`, no prices, at most 10 lines, the whole cookie string at most 4000
   bytes (`BASKET_FULL`), 30-day `Max-Age`, `Path=/; SameSite=Lax; Secure`. Format, caps and
   encoding live once in `app/domain/basket-cookie.ts`; the browser line check is held to the
   server's zod `BasketLine` by a unit test. The header count follows the store through
   `useSyncExternalStore`. "Added to your basket" stays in its polite status region; a double
   tap within 800 ms adds once. The server actions (`addToBasket`, `updateLine`, `removeLine`)
   stay as the no-JavaScript fallback, and as the fallback when the script cannot write the
   cookie (cookies blocked, or an HttpOnly cookie set before this ADR: the layout converts it
   once through `POST /api/basket/reissue`).
2. **Menu cached in the phone.** New public resource route `GET /api/menu`: products that are
   not hidden (name, type, photos, option groups and choices, base price, `available` /
   `sold_out`, minimum quantity) and the checkout Settings a customer sees anyway (delivery fee,
   windows, pickup address and map link, Juice number, policies) plus the Mauritius date.
   Versioned by a strong ETag (SHA-256 of the content, not the read time); `If-None-Match`
   answers `304`; `Cache-Control: public, max-age=60, stale-while-revalidate=600`. The browser
   keeps it in localStorage `apb_menu` = `{ v, ts, data }`, every access in try/catch. The
   layout warms it after load (at most once a minute); the basket route's `clientLoader`
   renders from it at once and revalidates in the background (`cache: no-cache`, so the ETag
   decides). The basket loader embeds the same menu for server rendering and seeds the cache.
   Root and site layout loaders no longer revalidate on in-language navigations (count from
   the store, language-switch and hreflang links from the URL), so a cached basket opens with
   no request at all. `placeOrder` stays the source of truth (prices, Settings and
   availability re-read fresh; `PRICE_CHANGED` kept).
3. **Stale items, calmly.**
   - Price changed: the line shows the new price at once with one inline note "Price updated
     from Rs X to Rs Y" in a polite live region. No modal, no forced acknowledgement; totals
     are always current; checkout stays enabled.
   - Sold out, hidden or deleted: the line stays, dimmed, with "No longer available" and
     Remove; it is left out of the total and **out of the order** (`placeOrder` now drops
     such lines instead of refusing with `PRODUCT_UNAVAILABLE`). Only a basket with nothing
     orderable is refused (`VALIDATION_FAILED` `basket`) and the page shows the normal
     empty-basket message instead of the checkout.
   - `PRICE_CHANGED` at Place order (now rare): the refusal's server prices go into the menu
     copy, the lines get the same note, the summary says "Total updated from Rs X to Rs Y",
     the button reads "Place order at Rs Y", focus stays on it, and every typed field is kept.

## Options considered
- **Keep server round trips, optimise further.** Cannot beat one Worker-to-Supabase round trip
  per tap; rejected by the Owner.
- **localStorage basket, cookie only at checkout.** The server could no longer render the
  basket or the count without JavaScript; two sources of truth. Rejected.
- **Signed basket cookie (HMAC) written by the server only.** Keeps HttpOnly but needs a round
  trip per change, which is the problem. Rejected.

## Consequences
- **Trade-off: the basket cookie is no longer HttpOnly.** Accepted because it holds no prices
  and no personal data (product ids, option ids, quantities, an optional cake message the
  customer typed), the server treats it as untrusted input (zod on every line, invalid lines
  dropped, prices and availability always recomputed, threat-model D1/D3), and it is capped at
  10 lines and 4000 bytes. A script running in the page could read or change it, but such a
  script could already act as the customer; CSP with nonces remains the defence against that
  (threat-model D13).
- `/api/menu` exposes only data already shown on public pages; hidden products never leave the
  server (catalogue spec Security). It costs one query (Settings come from the isolate cache);
  browsers reuse it for 60 s.
- The idempotency key of a basket page rendered from the cache is made in the browser with
  `crypto.randomUUID()` (as unguessable as the server's); without it the route asks the server.
- JS budget: basket route 158.3 kB gz, product 152.8 kB (limit 170 kB).
- Rollback: revert the commit; cookies written by the browser remain valid for the server.

## Measurements (staging, Pixel 7 emulation, median of 5)
Recorded after deploy in the amendment below.
