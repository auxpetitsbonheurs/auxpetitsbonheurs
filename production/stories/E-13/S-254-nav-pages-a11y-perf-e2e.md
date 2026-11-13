# S-254: Navigation and pages accessibility, performance and journey sweep
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/design/design-system.md#accessibility-rules · NFRs in docs/product/prd.md section 6
Estimate: 3 pts
Owner: test-engineer, accessibility-specialist, remix-specialist

## Story
As a customer on any device, I want the navigation and the new pages to be fast, readable and usable by everyone, so that I am never stuck or frustrated; and as the client I want the edit-and-see journey proven.

## Acceptance Criteria
- [x] AC1 (NFR-002): Given the 7 pages plus the open phone menu in EN and FR, then axe finds no serious or critical violation at 375 px and 1280 px, in light and dark themes, and contrast pairs meet AA per docs/design/tokens.json.
- [x] AC2 (NFR-002, NFR-006): Given each page at 320 px, 375 px and 200% zoom, then there is no horizontal scroll, no clipped action, and every target is >= 44 px (8 px apart in bars and rows).
- [ ] AC3 (NFR-001): Given each new route on throttled 4G mid-range phone, then Lighthouse performance >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, route JS <= 170 kB gz (checked by `check-js-budget`), accessibility >= 95, SEO >= 95.
- [x] AC4 (FR-076): Given a customer on a 375 px phone, then from any page each of the 7 pages is reachable in at most 2 taps (menu button, link), and the e2e test walks all 7 in EN and FR.
- [ ] AC5 (FR-078): Given the Owner on a phone, when she edits the Our story text and adds one photo and saves, then the page shows both within 60 s, and the flow is timed in a test session under 3 minutes (production/test-sessions/E-13-edit-our-story.md).
- [ ] AC6 (FR-076, FR-078): Given any new page answers an error, then the header, menu and footer still render so the visitor can navigate away.
- [ ] AC7 (FR-076): Given the Escape key, focus return and focus trap of the phone menu on iOS Safari and Android Chrome, then they behave as in AC3/AC4 of S-243 in a recorded real-phone check.
- [x] AC8 (NFR-007): Given a pseudo-locale (+40%) and the FR locale, then no label or button truncates or overlaps on the nav, menu or pages.

## Tests
- AC1 → src/tests/e2e/nav-pages-sweep.spec.ts (7 pages × EN/FR × 320/375/1280, light and dark; open phone menu EN/FR light and dark), plus site-navigation, brand-pages, content-pages, browse-home specs
- AC2 → src/tests/e2e/nav-pages-sweep.spec.ts (no sideways scroll, nothing clipped, 44 px, also at 200% zoom)
- AC3 → src/tests/e2e/perf-budgets.spec.ts
- AC4 → src/tests/e2e/nav-pages-sweep.spec.ts (Menu then link, all 7 pages, EN and FR, phone widths)
- AC5 → src/tests/e2e/admin-pages.spec.ts plus the manual session file
- AC6 → src/tests/e2e/content-pages.spec.ts
- AC7 → manual real-phone session (production/test-sessions/E-13-phone-menu.md)
- AC8 → src/tests/e2e/nav-pages-sweep.spec.ts (labels +40% in the open phone menu and the 1280 px bar), site-navigation.spec.ts (FR)

## Notes
- Last story of the epic; ux-lead signs off the header and menu on a real phone width before the epic is called done (owner preference).
- Depends on: S-242 to S-253.

## Sweep results (Sprint 4 job 3, 2026-11-13)

Measured locally: built Worker (`vite preview`, e2e env) in an isolated network namespace with
its own Postgres, a realistic menu (8 products with the Owner's photos as 1600 px WebP, as staging
stores them, and 12 gallery photos), behind a brotli proxy standing in for Cloudflare's edge
compression. Lighthouse 12 mobile, simulated slow 4G, 4× CPU.

### Easy wins shipped
| Change | Effect (measured) |
|---|---|
| `public/_headers`: hashed `/assets/*` immutable for a year; brand files, favicons and sample images a day + stale-while-revalidate | Each later page view: 45 → 3 revalidation round trips on /menu, 46 → 6 on /gallery (every 304 was a round trip on 4G) |
| Customer pages ship only customer i18n (no `admin`/`email` namespaces in the root loader data) | HTML (brotli) /menu 24.6 → 12.5 kB, /gallery 22.9 → 10.9 kB, / 22.0 → 12.0 kB |
| Basket code prefetch (ADR-0004) waits for the browser to be idle | ~15 basket chunks no longer modulepreloaded in the first HTML, so they stop competing with the first paint |
| Gallery: page text and photos in one statement on a cold isolate | 2 → 1 database round trips (Server-Timing) |
| First card photo on /menu and /gallery `fetchpriority=high`; Home hero preloaded high, below-fold Home photos `fetchpriority=low` + lazy | LCP image requested first |

Route JS (gz, `check-js-budget`, limit 170): home 161.6, menu 159.5, gallery 159.7, our-story 159.6, contact 160.3, product 163.8, basket 167.3, admin-product 169.4.

### Lighthouse (single runs; the host was shared and loaded, load average 17-19 on 4 cores, so TBT and render times swing by ±0.5 s between identical runs)
| Page | Before perf / LCP / CLS | After perf / LCP / CLS |
|---|---|---|
| / | 95 / 2.37 s / 0.005 (old text-only home) | 94 / 2.78 s / 0.010 (new home with hero photo) |
| /menu | 95 / 2.39 s / 0.002 | 89 / 3.10 s / 0.001 |
| /gallery | 93 / 2.67 s / 0 | 87 / 2.91 s / 0 |
| /our-story | 96 / 2.28 s / 0.004 | 93 / 2.11 s / 0.004 |
| /workshops | 92 / 2.66 s / 0.037 | 95 / 2.40 s / 0.038 |
| /contact | 91 / 2.73 s / 0.003 | 93 / 2.53 s / 0 |
| /custom-cake | 92 / 2.67 s / 0.016 | 86 / 2.27 s / 0.016 |
Accessibility 99-100 everywhere. SEO reads 69 locally only because non-production answers `X-Robots-Tag: noindex` (by design); the SEO audits otherwise pass.

### AC3 not met yet (open)
- Image weight is what keeps LCP above 2.5 s on photo pages: every card and gallery tile downloads the full 1600 px WebP (75-230 kB each; /menu ~1 MB, /gallery ~2 MB, Home ~1.7 MB). The architecture plans "pre-sized WebP with srcset"; it is not built. Proposed story: store a 480 px and 960 px variant at upload (the browser already resizes before upload) and serve `srcset`/`sizes`, or switch on Supabase image transformations (paid plan). Expected: /menu and /gallery to ~250-350 kB on a phone.
- Re-measure on staging with real Hyperdrive latency once the variants exist.
- AC6: the error states render inside the site frame (header, menu, footer) per unit tests of each page's error boundary; no e2e forces a database failure.
- AC5 and AC7 need real phones: session plans in production/test-sessions/E-13-edit-our-story.md and E-13-phone-menu.md (not run).
