# S-242: Horizontal site navigation in the laptop header
Status: ready
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md (Navigation section to add) · Design: docs/design/design-system.md#navigation (Top bar), docs/design/explorations/2026-11-12-burgundy-reference.jpg
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, i18n-specialist

## Story
As a customer on a laptop, I want the pages of the bakery listed across the top of every page, so that I reach the shop, custom orders or contact in one click.

## Acceptance Criteria
- [ ] AC1 (FR-076): Given a viewport of 1024 px or wider, when any customer page loads, then the burgundy header shows the logo at the start, a `<nav aria-label>` with 7 links in this order: Home, Our story, Our collection, Custom order, Workshops, Gallery, Contact us (routes `/`, `/our-story`, `/menu`, `/custom-cake`, `/workshops`, `/gallery`, `/contact`), and at the end the language switch, the basket button and (AC4) the account icon.
- [ ] AC2 (FR-076, NFR-007): Given locale fr, then the labels read Accueil, Notre histoire, Notre collection, Gâteau sur mesure, Ateliers, Galerie, Contact, links keep the `/fr` prefix, and at 1024 px the links stay on one line without overlapping the logo or the basket (FR text +30%).
- [ ] AC3 (FR-076, NFR-002): Given the current page (including `/menu/:slug` for Our collection), then its link has `aria-current="page"` and a visible non-colour marker (gold underline, as in the reference).
- [ ] AC4 (FR-076): Given customer accounts are not live yet, then no account icon shows and no link goes to a missing page; given the account route exists (E-11 S-207), then a 44 px person icon named "My account" shows between the language switch and the basket.
- [ ] AC5 (FR-076, NFR-002): Given keyboard only, then Tab order equals visual order (logo, 7 links, language, account, basket), every link has a visible focus ring on burgundy (>= 3:1), targets are >= 44 px high, and contrast of cream links on burgundy meets AA per docs/design/tokens.json.
- [ ] AC6 (FR-076): Given the existing sticky behaviour and the promo banner, then the banner stays above the header, the header does not grow taller than the current one by more than the nav row, and CLS <= 0.1.
- [ ] AC7 (FR-076): Given viewport 1023 px or narrower, then the horizontal bar is not rendered (S-243 shows the menu button instead) and no link is duplicated in the DOM for assistive tech.

## Tests
- AC1 → src/app/components/site/site-nav.test.tsx, src/tests/e2e/site-navigation.spec.ts (1280 px)
- AC2 → src/app/components/site/site-nav.test.tsx, src/tests/e2e/site-navigation.spec.ts (fr, 1024 px, no overflow)
- AC3 → src/app/components/site/site-nav.test.tsx
- AC4 → src/app/components/site/site-nav.test.tsx
- AC5 → src/tests/e2e/site-navigation.spec.ts (keyboard, axe)
- AC6 → src/tests/e2e/site-navigation.spec.ts (CLS measure)
- AC7 → src/tests/e2e/site-navigation.spec.ts (1023 px)

## Notes
- Labels come from the i18n catalogue (`nav.*` keys); copywriter may refine FR. Route list lives in one `siteNavItems` constant shared by S-242, S-243 and the sitemap (S-253).
- Targets not yet built (e.g. `/workshops`) must not ship as 404s: build S-245 and the pages first or add minimal pages in the same release; the nav is not released before all 7 routes answer 200.
- Breakpoint 1024 px is a proposal (ux-lead to confirm). Language switch placement at the end is a decision of this story because the reference has none and FR-001 needs it on every page.
- Depends on: the burgundy header from brand v0.3 (in progress), S-008 language switch.
