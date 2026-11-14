# Performance on a real mid-range phone (S-226) — method, ready to run

Not run yet: it needs a real mid-range Android phone and the real menu (S-221). Prepared by the
launchprep job on 2026-11-14 so the run takes about an hour.

## Phone and network

- A mid-range Android phone (for example a Samsung Galaxy A15 or A25, or a Redmi Note 13): Chrome
  up to date, battery above 50%, no power-saving mode, other apps closed.
- Mobile data on 4G (not Wi-Fi), outdoors or by a window, in Beau Bassin or Rose Hill.

## AC1: load time, median of 5 (home and menu)

1. On a laptop: Chrome → `chrome://inspect` → connect the phone by USB (Developer options → USB debugging).
2. For each of `/`, `/menu`: on the phone open a new incognito tab, type the live address, wait until
   it has fully shown. In DevTools (inspecting the phone) → Performance → Reload: note LCP and the
   "Load" time. Close the tab. Repeat 5 times.
3. The median of the 5 must be under 3 s (AC1). Write the 5 numbers and the median below.

## AC2: Lighthouse (lab) per page

Laptop, Chrome → DevTools → Lighthouse → Mobile, Performance → for home, menu, a product, basket
(with 3 items), checkout and a tracking page. Budgets: performance ≥ 90, LCP ≤ 2.5 s, CLS ≤ 0.1.
Known lab artifact on `/basket` (a reported footer shift, CLS 0.567, not visible):
`production/audits/perf-checkout-2026.md`. Use the real-device numbers from step AC1/INP for that page.

## INP of the checkout date tap (S-087 AC9, S-098 AC9)

On the phone with DevTools attached: Performance → Record → on `/basket` choose Pickup, tap an
available day → Stop. The longest "Interaction" (pointer down to next paint) must be ≤ 200 ms.
Do it 5 times; write the median. (Machine figures: 24-120 ms without CPU slowdown, median 280 ms with
a 4x slowdown on a loaded build machine.)

## AC3, AC4: JavaScript and images

`npm run check:js-budget` after `npm run build` (≤ 170 kB gzipped per route; 2026-11-13: home
145.5, product 146.3, basket 152.4). Images: DevTools → Network → Img on each page: none over 300 kB,
below-the-fold images `loading="lazy"` with width and height.

## AC5: Worker CPU

GitHub → Actions → cpu-measure → Run workflow: `warm`, `50`, lines `10` (staging). Latest:
`production/audits/perf-checkout-2026.md` (10-line basket, 0 requests stopped).

## Results

| Page | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median | Budget |
|---|---|---|---|---|---|---|---|
| `/` load (s) | | | | | | | < 3 |
| `/menu` load (s) | | | | | | | < 3 |
| `/basket` date tap INP (ms) | | | | | | | ≤ 200 |

Phone model and Android version: ____  Network: ____  Date: ____  By: ____
