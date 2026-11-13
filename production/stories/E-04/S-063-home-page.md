# S-063: Home page
Status: review
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#screens--states
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As a first-time customer on my phone, I want a Home page with the hero, current offers, seasonal and featured cakes and clear buttons, so that I understand the bakery and can start ordering in one tap.

## Acceptance Criteria
- [x] AC1 (FR-004): Given seeded content, when `/` loads, then it shows hero photo and tagline, live promotion cards, seasonal specials, featured products (chosen in Settings, max 6), How it works (3 steps), a gallery preview of 6 photos, and buttons "Order now" (`/menu`) and "Custom cake" (`/custom-cake`).
- [x] AC2 (FR-004, FR-016): Given a live promotion with placement both, when Home loads, then its card shows (and the banner, S-062); when `ends_at` has passed, then the card no longer shows.
- [x] AC3 (FR-004): Given no live promotion, no seasonal product in window, or no featured product, when Home loads, then those sections are absent (no empty headings or blank areas).
- [x] AC4 (FR-004, FR-006): Given a seasonal product whose window contains today in Mauritius time (23:59 vs 00:00 edge), when Home loads, then it appears in the seasonal row only while `todayMU` is within the window.
- [x] AC5 (FR-004, NFR-007): Given locale fr and an FR tagline that is empty, when Home loads, then the EN text shows; a present FR text shows in FR.
- [ ] AC6 (FR-004, NFR-001): Given Home on a throttled mid-range 4G profile, when loaded, then LCP <= 2.5 s, CLS <= 0.1, the hero image has `fetchpriority=high` and explicit width/height, other images are lazy, and the route JS <= 170 kB gz.
- [x] AC7 (FR-004): Given the home loader fails, when `/` is requested, then an error state with a WhatsApp button shows instead of a blank page.
- [x] AC8 (NFR-002, NFR-006): Given Home at 320 px and 375 px, at 200% zoom and keyboard-only, when every button and card is used, then all are reachable in visual order, tap targets >= 44 px, images have alt text, headings are ordered, contrast is AA per `docs/design/tokens.json`, and nothing scrolls sideways.

## Tests
- AC1 → src/app/routes/home.test.tsx, src/tests/e2e/browse-home.spec.ts
- AC2 → src/app/routes/home.test.tsx (loader, fixed clock at ends_at)
- AC3 → src/app/routes/home.test.tsx
- AC4 → src/app/routes/home.test.tsx (fixed clock, 23:59 vs 00:00 Mauritius)
- AC5 → src/app/routes/home.test.tsx
- AC6 → src/app/routes/home.test.tsx + src/tests/e2e/browse-home.spec.ts (priority, sizes, lazy); Lighthouse run in the S-254 sweep; JS budget by `check-js-budget` (perf-budgets.spec.ts is S-072)
- AC7 → src/app/routes/home.test.tsx
- AC8 → src/tests/e2e/browse-home.spec.ts (axe light and dark, 320/375/1280, keyboard, 200% zoom)

## Notes
- PromoCard shape defined in contracts.md (`site/home`). Contract OK.
- Depends on E-01 (layout, i18n) and E-03 (content data).
- "How it works" copy keys to be delivered by copywriter; seed placeholder EN/FR copy in the story, replace in E-12 polish.

## Build notes (Sprint 4, 2026-11-13)
- Layout follows the Owner's burgundy reference (docs/design/explorations/2026-11-12-burgundy-reference.jpg): hero (Settings tagline as the h1, else "Artisan cakes for your finest moments" / "Pâtisserie artisanale pour vos plus beaux moments"; intro; "Discover our collection" → /menu; photo at the side from md, on top on phones), the three promises row (Quality ingredients / Made-to-order creations / Pickup & delivery; FR "Collection & livraison" as in the reference), live promotion cards, "Our collection" with gold rules and one card per product type that has products customers can see today (Cakes, Cupcakes, Cookies & desserts; link to /menu#type-…), seasonal specials, featured (Settings, max 6), How it works (3 steps), the burgundy "A made-to-order cake?" band with a cream outline pill "Ask for a quote" → /custom-cake, and a 6-photo gallery preview.
- AC1 wording: "Order now" and "Custom cake" are the reference's "Discover our collection" (/menu) and "Ask for a quote" (/custom-cake).
- Hero photo: Settings hero (S-058/S-059), else the first featured product's photo, else the first cake photo; with none, the cream logo badge on the burgundy band (no broken image). Settings stores no size for the hero, so a 4:3 box is reserved.
- Copy is seeded EN/FR in i18n (`home.*`); copywriter polish in E-12.
- Contract: `site/home` adds `categories` (see contracts.md changelog v0.35).
