# S-321: Page loader: one scene per destination page
Status: done
Epic: E-13-site-navigation-and-pages
Builds on: S-317 (full-screen branded page loader, commit d7c74ae)
Spec: docs/design/brand-guide.md (Motion principles: the page loader scenes) · docs/design/design-system.md (Navigation: Page loader)
Estimate: 5 pts
Owner: lead-frontend, ux-lead, motion/design-director
Asked by: the Owner, 2026-11-18 (the client loved the S-317 whisk loader and wants one scene per page)

## Story
As a customer moving between pages, I want the loader to show a little baking scene that matches the page I am opening (an egg for Our story, sugar for the menu, an oven for the gallery…), so that every tap feels like the bakery and hints at where I am going, with the same calm pace, size and badge.

## Acceptance Criteria
- [x] AC1: The scene is chosen by the page being OPENED (EN and FR alike): Home `/` → the whisk (unchanged); Our story → an egg cracks and breaks into a bowl; Menu `/menu` and every cake page `/menu/:slug` → sugar (cubes) pours into a bowl; Custom order `/custom-cake` → flour pours into a bowl (sack with a wheat ear, puff); Workshops `/workshops` and `/workshops/:slug` → tiny hearts pour into a bowl; Gallery → the bowl goes into an oven (door closes, warm glow in the window); Contact → a layered cake with a flickering candle and a heart rising; everything else (basket, checkout, tracking, account, privacy, reviews, 404…) → the whisk.
- [x] AC2: Every scene sits inside the badge where the whisk is, in the same gold line art (gradient #BA8430 to #E2B65A, ~1.5 px lines at 176 px), the same loop pace (1.6 s, like the whisk's heart) and the logo always shown. The bowl is one shared shape (`#apb-loader-bowl`), so the set reads as a family. Pure CSS and inline SVG; no images beyond the existing badge, no animation library; the CSP nonce is untouched.
- [x] AC3: The scene is picked before hydration too: the nonce'd inline script carries the same destination → scene map (`lib/loader-scenes.ts`, serialised into the script; one source of truth with React's `sceneFor`). The script stays under 1 kB gzipped.
- [x] AC4: Only the active scene is drawn and animated (`display: none` on the others); animations are paused while the overlay is hidden or fading out.
- [x] AC5: Reduced motion: each scene shows a still, recognisable frame (egg open with the yolk falling, cubes and hearts on their way, sack pouring, oven shut and glowing, cake with its candle).
- [x] AC6: Accessibility and timing unchanged from S-317: "Loading…" / "Chargement…" announced, visuals `aria-hidden`, never on the first load, ≥ 450 ms, axe clean. Admin unchanged.

## Tests
- AC1, AC3 → app/lib/loader-scenes.test.ts (every EN and FR route, detail pages, fallback, prototype keys; React's `sceneFor` and the script's function agree on every path; each mapped section is a real route in routes.ts), app/lib/page-loader-script.test.ts (script carries the shared map, sets `data-scene`, < 1 kB gzipped)
- AC1, AC4, AC6 → tests/e2e/page-loader.spec.ts "page loader scenes (S-321)": each footer destination (and the logo for Home) shows its scene and only it, every part running, Loading…, axe; FR pages; app JS blocked: the inline script draws the right scene for EN/FR, `/menu/:slug`, `/workshops/:slug`, basket and tracking
- AC5 → tests/e2e/page-loader.spec.ts (reduced motion: no part animates; egg open with yolk; oven door shut, glow on)
- AC2 → app/components/shell/page-loader.test.tsx (one group per scene, whisk by default, one shared bowl, overlay HTML < 9 kB); screenshots at 375 px (scratchpad `s321-scene-*-375.png`, `s321-scenes-contact-sheet.png`)
- Regression: the S-317 tests in page-loader.spec.ts, basket-instant.spec.ts, a11y-shell.spec.ts, site-navigation.spec.ts; `npm run check:js-budget`

## Notes
- All seven scenes are in the server-rendered markup: the inline script runs before React exists and can only switch an attribute, so "render only the active scene" is done in CSS (`display: none`), which also means only that scene is painted and animated. Cost: customer routes +1.5 to 1.6 kB gzipped JS (e.g. home-en 149.3 → 150.9 kB, custom-cake-en 161.5 → 163.1 kB, limit 170), root CSS +0.9 kB gzipped, inline script 676 → 841 B gzipped. Admin routes unchanged.
- Sugar is shown as sugar cubes tumbling in (with two sparkles), so it reads apart from the flour's fine pour and puff at badge size.
- The CSS minifier (Lightning CSS) rewrites an `animation` shorthand without a name to `animation: none` and drops the `translate` property next to `transform`, so the scenes use animation longhands and per-part `translate()` groups in the SVG; the e2e checks every part is really running.
- Design review (ui-designer / ux-lead lens): each scene reads in its first frames (egg, cubes, sack with wheat, hearts, oven front, cake with candle are recognisable before any motion); the telling moment (crack, first cube, puff, door closing) falls in the first half second.
