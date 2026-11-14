# Checkout performance on staging (S-085 AC9, S-087 AC9, S-098 AC9, S-097) — 2026-11-13

Staging build of 2026-11-13 15:13 (commit 3693222; later commits had not deployed, see
`pipeline-2026.md`). Basket: 3 distinct lines (Black Forest, Chocolate chip cookies, Red Velvet,
Rs 5,020), held in the basket cookie only (no order created by these page loads).

## Core Web Vitals on `/basket` (S-085 AC9, S-087 AC9, S-098 AC9)

Real Google Chrome driven by Playwright, Pixel 7 screen (412 x 915, DPR 2.625, touch), slow 4G
(150 ms RTT, 1.6 Mbps down) and 4x CPU slowdown via DevTools, basket cookie in the browser's own
cookie jar. INP = the longest event of the tap on the first available day in the date picker
(after choosing Pickup). Script: the launchprep job's `launchprep-vitals.mjs` (scratchpad).
The build machine was heavily loaded (load average 25-35 on 4 cores), which inflates the
CPU-throttled timings.

| Run | Page | LCP | CLS | INP (date tap) |
|---|---|---|---|---|
| 1 | /basket | 2,156 ms | 0.002 | 512 ms |
| 2 | /basket | 1,904 ms | 0.003 | 280 ms |
| 3 | /basket | 1,988 ms | 0.002 | 88 ms |
| 4 | /basket (earlier run) | 1,992 ms | 0.073 | 272 ms |
| 1 | /fr/basket | 2,332 ms | 0.076 | 176 ms |
| 2 | /fr/basket | 2,600 ms | 0.000 | 296 ms |
| 3 | /fr/basket | 1,956 ms | 0.005 | 280 ms |
| no CPU slowdown, 3 runs | /basket | 1,500-1,936 ms | 0.002-0.073 | 24, 72, 120 ms |

| Metric | Budget | Result | Verdict |
|---|---|---|---|
| LCP | ≤ 2.5 s | median 1.99 s (EN), 2.33 s (FR); one FR run 2.60 s | **Pass** (median), thin margin like home |
| CLS | ≤ 0.1 | max 0.076 (a `section.mt-10` moving once in 3 of 10 runs) | **Pass** |
| INP (date change) | ≤ 200 ms | median 280 ms with 4x slowdown on a loaded machine; 24-120 ms without slowdown | **Not proven**: re-measure on a real mid-range phone (S-226 method). The interaction itself is light (≤ 120 ms unthrottled) |

S-085 AC9 other parts (server-rendered, route JS ≤ 170 kB) were already met: `/basket` route
JS 152.4 kB gz on 2026-11-13.

### Lighthouse caveat (logged so nobody chases it)

Lighthouse 12 (simulated slow 4G, 4x CPU) on `/basket` reports **CLS 0.567** on some runs, from the
footer. Two causes were checked:

1. With the cookie passed as an extra header (`--extra-headers`), the client-side basket finds no
   cookie and replaces the 3 lines with "Your basket is empty": the filmstrip shows it. A test
   artifact, not a site bug.
2. With the cookie in Chrome's jar (Lighthouse attached to a prepared Chrome), the filmstrip shows
   no visible movement in the viewport, yet the footer shift is still reported. The real-browser
   measurement above (layout-shift entries with their sources) never shows the footer moving.

Lighthouse LCP on `/basket` (3.2-4.0 s) is not used for the same reason: its LCP element was the
header logo after the basket area disappeared. Lighthouse accessibility on `/basket`: 100.

## Worker CPU with a 10-line basket (S-097 AC1, AC4, AC6)

GitHub Actions run [43499983884](https://github.com/auxpetitsbonheurs/auxpetitsbonheurs/actions/runs/43499983884)
(`cpu-measure`, warm, 50 rounds, `lines: 10`, order date 2026-11-20). Each round added 10
distinct lines from the staging menu (not measured), then opened `/basket`, placed the order and
opened its tracking page. Staging only, test data only (orders named "CPU test — ignore",
example.com addresses). `wrangler tail` captured 35-39 samples per hot path (it drops some).

| Route | Samples | p50 | p95 | p99 | Max | Stopped by Cloudflare |
|---|---|---|---|---|---|---|
| `POST /basket` (placeOrder, 10 lines) | 39 | 4 ms | 11 ms | 11 ms | 11 ms | 0 |
| `GET /basket` (price calculation, 10 lines) | 38 | 22 ms | 34 ms | 40 ms | 40 ms | 0 |
| `GET /t/[token]` (tracking) | 35 | 11 ms | 21 ms | 31 ms | 31 ms | 0 |
| `POST /menu/<slug>` (add to basket, not a hot path) | 367 | 4 ms | 7 ms | 12-14 ms | 26 ms | 0 |

Compared with the one-item runs (2026-11-11/12: GET /basket p50 26-38, p99 73-137 ms; POST /basket
p50 9-24, p99 30-37 ms), a 10-line basket costs no more. The 10 ms figure is still exceeded at the
median on `GET /basket`, and no request was stopped: the Owner's "accept and monitor" decision
(2026-11-11) stands; risk T3 unchanged. AC2 (placeOrder wall time p95 ≤ 800 ms over 50 runs) is not
measured by this workflow; S-226 AC7 covers it.

Promotions: staging had no live promotion during the run (creating one needs an admin), so the
"with promotions" part of AC1 ran with options only; promotion pricing cost is covered by the
benchmark (S-097 AC3: `priceBasket` 10 lines with two overlapping promotions < 1 ms).
