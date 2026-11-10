# S-063: Home page
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#screens--states
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As a first-time customer on my phone, I want a Home page with the hero, current offers, seasonal and featured cakes and clear buttons, so that I understand the bakery and can start ordering in one tap.

## Acceptance Criteria
- [ ] AC1 (FR-004): Given seeded content, when `/` loads, then it shows hero photo and tagline, live promotion cards, seasonal specials, featured products (chosen in Settings, max 6), How it works (3 steps), a gallery preview of 6 photos, and buttons "Order now" (`/menu`) and "Custom cake" (`/custom-cake`).
- [ ] AC2 (FR-004, FR-016): Given a live promotion with placement both, when Home loads, then its card shows (and the banner, S-062); when `ends_at` has passed, then the card no longer shows.
- [ ] AC3 (FR-004): Given no live promotion, no seasonal product in window, or no featured product, when Home loads, then those sections are absent (no empty headings or blank areas).
- [ ] AC4 (FR-004, FR-006): Given a seasonal product whose window contains today in Mauritius time (23:59 vs 00:00 edge), when Home loads, then it appears in the seasonal row only while `todayMU` is within the window.
- [ ] AC5 (FR-004, NFR-007): Given locale fr and an FR tagline that is empty, when Home loads, then the EN text shows; a present FR text shows in FR.
- [ ] AC6 (FR-004, NFR-001): Given Home on a throttled mid-range 4G profile, when loaded, then LCP <= 2.5 s, CLS <= 0.1, the hero image has `fetchpriority=high` and explicit width/height, other images are lazy, and the route JS <= 170 kB gz.
- [ ] AC7 (FR-004): Given the home loader fails, when `/` is requested, then an error state with a WhatsApp button shows instead of a blank page.
- [ ] AC8 (NFR-002, NFR-006): Given Home at 320 px and 375 px, at 200% zoom and keyboard-only, when every button and card is used, then all are reachable in visual order, tap targets >= 44 px, images have alt text, headings are ordered, contrast is AA per `docs/design/tokens.json`, and nothing scrolls sideways.

## Tests
- AC1 → src/app/routes/site/home.test.tsx
- AC2 → src/app/routes/site/home.test.tsx
- AC3 → src/app/routes/site/home.test.tsx
- AC4 → src/app/routes/site/home.test.tsx (fixed clock)
- AC5 → src/app/routes/site/home.test.tsx
- AC6 → src/tests/e2e/perf-budgets.spec.ts (see S-072)
- AC7 → src/app/routes/site/home.test.tsx
- AC8 → src/tests/e2e/browse-home.spec.ts (axe, viewports, keyboard, zoom)

## Notes
- PromoCard shape defined in contracts.md (`site/home`). Contract OK.
- Depends on E-01 (layout, i18n) and E-03 (content data).
- "How it works" copy keys to be delivered by copywriter; seed placeholder EN/FR copy in the story, replace in E-12 polish.
