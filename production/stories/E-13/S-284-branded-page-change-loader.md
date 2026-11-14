# S-284: Branded page-change loader (the whisk)
Status: done
Epic: E-13-site-navigation-and-pages
Spec: docs/design/brand-guide.md v0.3 (logo badge, motion) · docs/design/design-system.md (Navigation)
Estimate: 3 pts
Owner: lead-frontend, ux-lead, motion/design-director
Asked by: the Owner, 2026-11-14 (job "brand")

## Story
As a customer moving between pages, I want a small bakery badge with the whisk gently whisking when a page takes a moment, so that I know the tap worked and the wait feels like part of the brand, without anything flashing on fast pages.

## Acceptance Criteria
- [x] AC1: Given a client-side page change (after hydration) that is still loading after 300 ms, then a small round badge (burgundy #660C0C, gold #BA8430 ring, the logo's heart flourish and whisk) appears fixed in the centre of the screen (no backdrop); it does not move the layout or block taps, and it goes away when the page has loaded.
- [x] AC2: Given a page change that finishes within 300 ms, then nothing appears (no flash); once shown, the badge stays at least 300 ms so it never blinks.
- [x] AC3: Given the first page load (before and right after hydration), then the loader never appears and it adds nothing to the first paint (no markup at all until a page change starts; the badge is inline SVG, no image request).
- [x] AC4: Then the loader is a `role="status"` region whose visually-hidden text is "Loading…" / "Chargement…"; the badge itself is decorative (`aria-hidden`); axe finds nothing at 375 px.
- [x] AC5: Given `prefers-reduced-motion: reduce`, then the whisk does not move (the badge is static).
- [x] AC6: The motion is CSS only (no animation library, no JS timer per frame); the whisk rocks on its handle about once a second. Route JS stays within `check:js-budget` (170 kB) and the change for home, menu and product is reported.
- [x] AC7: Customer pages use it for page changes; a form submission keeps its own button feedback and the existing thin progress bar. Admin keeps its thin progress bar.

## Tests
- AC1, AC2 → app/lib/delayed-flag.test.ts (fake timers: under 300 ms never shown, shown after 300 ms, kept 300 ms minimum, cancel on idle), tests/e2e/page-loader.spec.ts (slow navigation shows the status; fast one does not)
- AC3 → tests/e2e/page-loader.spec.ts (no status text on first load), app/components/shell/page-loader.test.tsx (server render is empty)
- AC4 → tests/e2e/page-loader.spec.ts (axe with the loader visible, EN and FR text)
- AC5 → tests/e2e/page-loader.spec.ts (reduced motion: no running animation)
- AC6 → `npm run check:js-budget`
- AC7 → app/lib/delayed-flag.test.ts (isPageChange: submissions are not page changes), tests/e2e/a11y-shell.spec.ts and basket-instant.spec.ts (unchanged behaviour)

## Notes
- The whisk in public/brand/logo-badge-*.svg is separate stroke paths (handle, collar, wires), so the loader reuses those paths inline and rotates them about the handle's end; no new artwork.
- The `role="status"` region mounts empty when a page change starts and gets its text at 300 ms, so screen readers announce it; it unmounts when idle, so the basket count stays the page's only status otherwise (existing specs locate it unfiltered).
- Page changes only: a form submission (`formMethod` set) keeps its button feedback and the thin bar (`NavProgress submissionsOnly`); admin is unchanged.
- Route JS (gz) with S-283, vs origin/main: home 146.8 → 148.1, menu 142.8 → 144.1, product 147.9 → 149.2 kB (limit 170).
- Screenshots: scratchpad brand-loader-375.png, brand-loader-badge-375.png.
