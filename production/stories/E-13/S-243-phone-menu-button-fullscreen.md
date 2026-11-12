# S-243: Phone menu button with full-screen menu
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md (Navigation section to add) · Design: docs/design/design-system.md#navigation (Top bar, Site menu: "full-screen" replaces side/bottom drawer, decided 2026-11-12)
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer on a phone, I want a menu button that opens all the pages of the bakery, so that I can find the collection, custom orders or contact without hunting.

## Acceptance Criteria
- [x] AC1 (FR-076): Given a viewport under 1024 px, when a page loads, then the header still shows Français/English, the logo and the basket as today, plus a menu button (three-line icon, accessible name "Menu"/"Menu", `aria-expanded`, `aria-controls`) at least 44 x 44 px.
- [x] AC2 (FR-076): Given I press the button, then a full-screen panel opens with a labelled title, a visible Close button (44 x 44 px, named "Close menu"/"Fermer le menu") and the 7 links in order (Home, Our story, Our collection, Custom order, Workshops, Gallery, Contact us; FR labels per S-242), each row >= 48 px with 8 px between rows, the current page marked with `aria-current="page"` and a non-colour marker.
- [x] AC3 (FR-076, NFR-002): Given the panel is open, then focus moves to the panel, Tab and Shift+Tab stay inside it, the page behind is inert and does not scroll, and Esc closes it.
- [x] AC4 (FR-076, NFR-002): Given I close it (Close, Esc, or choosing the current page's link), then focus returns to the menu button; given I choose another link, then the panel closes, the new page loads and focus lands on the page's `h1` or skip target.
- [x] AC5 (FR-076, NFR-001): Given the menu has never been opened, then the panel code is not in the route's initial JS (loaded on first press, with the button working at once and a 300 ms-delayed state only if the chunk is slow), route JS stays <= 170 kB gz.
- [x] AC6 (FR-076, NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then logo, Français, basket and menu button all fit on one row or wrap in DOM order without horizontal scroll, overlap or targets under 44 px; the logo may drop to 44 px (existing rule).
- [x] AC7 (FR-076, NFR-007): Given locale fr with the longest labels (Gâteau sur mesure, Notre collection), then labels wrap rather than truncate and no row clips.
- [x] AC8 (FR-076): Given a failed chunk load or JavaScript disabled, then the button is a link to a no-JS page `/menu-links` or to the footer navigation list so the 7 links stay reachable (progressive enhancement); never a dead button.
- [x] AC9 (FR-076, NFR-002): Given `prefers-reduced-motion`, then no slide animation; otherwise a short fade only; contrast of the panel (cream on burgundy or burgundy on cream) meets AA.

## Tests
- AC1 → src/app/components/site/site-menu.test.tsx, src/tests/e2e/site-navigation.spec.ts (375 px)
- AC2 → src/app/components/site/site-menu.test.tsx
- AC3 → src/tests/e2e/site-navigation.spec.ts (focus trap, Esc, inert background)
- AC4 → src/tests/e2e/site-navigation.spec.ts
- AC5 → src/app/lib/js-budget.test.ts
- AC6 → src/tests/e2e/site-navigation.spec.ts (320, 375, 200% zoom)
- AC7 → src/tests/e2e/site-navigation.spec.ts (fr)
- AC8 → src/tests/e2e/site-navigation.spec.ts (JS disabled)
- AC9 → src/app/components/site/site-menu.test.tsx

## Notes
- The menu button goes after the basket (Français, logo, basket, menu); ux-lead to confirm on a real phone width (owner preference: check a real phone before done).
- AC8 fallback: simplest is the footer link list with `id="site-links"` anchored; decide in build, record in the story.
- Use the same `siteNavItems` constant as S-242. Language switch also appears in the panel only if there is room; the header switch stays (owner: keep today's header).
- Depends on: S-242 (items, labels), design-system Dialog/Sheet focus rules.

## Build notes (2026-11-12)
- Built: `app/components/site/site-menu.tsx` (native modal `<dialog>`), CSS in `app.css` (scroll lock, fade), `/menu-links` (`routes/site/menu-links.tsx`).
- AC5 deviation (lead-frontend): the panel is not a lazy chunk. It is server-rendered markup reusing the nav list (about 1 kB gz), so the first press opens at once with no network; a lazy chunk would add a request and a loading state for almost no saving. Routes stay far under budget (home 151.5 kB, collection 157.6 kB of 170); the budget gate (`npm run check:js-budget`) covers it rather than a `js-budget.test.ts` case.
- AC8: decided the `/menu-links` page (not the footer list), so the footer does not become a second navigation (S-061).
- ux-lead: menu button after the basket confirmed at 320 and 375 px (one row at 100%, wraps in order at 200%).
- Tests: `app/components/site/site-menu.test.tsx`, `tests/e2e/site-navigation.spec.ts` (src/ paths).
