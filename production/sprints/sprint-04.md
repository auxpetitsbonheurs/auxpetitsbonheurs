# Sprint 04: Ordering essentials

Planned 2026-11-13. The Owner chose "Ordering essentials" as the next step.

**Goal:** a customer can choose a cake's size, box or options with a live price, pick a valid date and time window, and order. The home page matches the Owner's reference. The E-13 pages pass the final speed and accessibility sweep.

**Way of working (Owner rule):** three parallel jobs, each committing on its own branch with no pushes. The lead integrates them, runs the gates once and pushes once.

| Job | Stories | Pts |
|---|---|---|
| 1 Options and pricing | S-081 pricing domain (server authority), S-066 product options + live price + add to basket, S-067 message-on-cake limit, S-092 order price snapshot | 14 |
| 2 Dates and windows | S-083 notice/closed/blocked days, S-084 seasonal window on delivery date, S-087 date picker with reasons, S-088 time windows | 15 |
| 3 Home, product page, sweep | S-063 home page (reference image), S-061 footer from Settings, S-065 product page content, S-254 E-13 accessibility/performance sweep | 11 |

**Committed:** 40 pts.
**Next candidates:** S-082 promotions, S-062 promo banner, S-085, S-086, S-089 to S-091, S-093 to S-098.

## Daily log
- 2026-11-13: planned; jobs 1 to 3 started in parallel.
- 2026-11-13 (job 1): S-081, S-066, S-067, S-092 in review, plus S-065 AC4 (sold out + WhatsApp) and S-084 AC7 (season-ended line left out). Migration 0010 (`order_line_price`; `place_order` prices options and stores the snapshot, keeps 0009's date rules and refusal codes); contracts v0.37. S-066 AC4 (promotion on the page) waits for S-082. Fixed on the finishing pass: the product form was missing without JavaScript (streamed Suspense segment); now inline in the server HTML. JS: basket-en 169.96/170 kB (pricing loads after hydration), product-en 164.5 (ordering area lazy), admin-product 169.7. Affected e2e specs green (305 passed, 5 skipped).
