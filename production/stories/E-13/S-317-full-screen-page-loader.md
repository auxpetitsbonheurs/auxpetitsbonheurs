# S-317: Full-screen branded page loader (the whisk stirring in circles)
Status: done
Epic: E-13-site-navigation-and-pages
Supersedes: S-284
Spec: docs/design/brand-guide.md (Logo: the Owner's official badges) · docs/design/design-system.md (Navigation)
Estimate: 5 pts
Owner: lead-frontend, ux-lead, motion/design-director
Asked by: the Owner, 2026-11-14 ("they mostly see the thin white top bar and want a proper branded loader")

## Story
As a customer moving between pages, I want a full cream screen with the bakery's badge and a gold whisk beating in circles every time I change page, so that every tap clearly worked and the wait feels like the bakery, without flicker and without slowing the first page.

## Acceptance Criteria
- [x] AC1: Given a page change on a customer page (link, back/forward, language switch), then a full-screen cream overlay (#FBF3E8) with the Owner's round cream badge in the middle (176 px on phones, 200 px from 768 px) shows **at once** and fades in (150 ms); it replaces the customer pages' thin top bar. Admin keeps its thin bar.
- [x] AC2: It fades out (150 ms) when the new page is ready, and stays at least 450 ms so it never flickers; it is never up longer than the navigation plus that minimum. Never on the first visit or first load (no markup shown, no badge request before load + idle, so LCP is untouched).
- [x] AC3: `role="status"` with "Loading…" / "Chargement…" while shown (no status role otherwise); the visual layer is `aria-hidden`; focus is not moved or trapped; axe is clean with it shown.
- [x] AC4: Animation, CSS only: the gold whisk (inline SVG in the badge's style, gradient #BA8430 to #E2B65A) stirs round and round over the badge where its own whisk is, and the small gold heart floats up from it. The badge image has its baked whisk, heart and flourish painted out (`badge-cream-plain-*.webp`). Reduced motion: nothing moves, the badge shows with the whisk and heart in place.
- [x] AC5: Full page loads (browsing pages start React only after load + idle, so early taps are plain navigations): a tiny inline script with the CSP nonce, written before `</body>` on customer pages, shows the same overlay on same-origin link clicks and form submits that leave the page (not hash links, new tabs, downloads, other sites, phone or mail links, nor anything React already handled). A page restored from the back/forward cache comes back with it hidden (`pageshow`). If the page never unloads (a download, a stopped load) it hides after 10 s.
- [x] AC6: A navigating form submission shows it after 300 ms (a quick validation answer never flashes it); fetcher forms (Add to basket) never show it and keep their own feedback.

## Tests
- AC1, AC3, AC6 → tests/e2e/page-loader.spec.ts (held page data: veil visible, cream, badge loaded at 160–200 px, whisk and heart animated, Loading…, axe; then hidden), FR text
- AC2 → app/lib/delayed-flag.test.ts (shown in the same tick, 450 ms minimum, slow page hides at once when ready), tests/e2e/page-loader.spec.ts (first load never shows it; a fast change is visible ≥ 450 ms and < 1.5 s), app/components/shell/page-loader.test.tsx (server render hidden, badge without src/srcset)
- AC4 → tests/e2e/page-loader.spec.ts (reduced motion: no animation, heart opaque)
- AC5 → app/lib/page-loader-script.test.ts (written before </body> with the nonce, across chunks, never an unsafe nonce, < 1 kB gzipped, customer pages only), tests/e2e/page-loader.spec.ts (app JS blocked: a tap shows it via the script; a `pageshow` persisted event hides it; anchors, tel: and new tabs leave it alone)
- Regression: basket-instant.spec.ts, a11y-shell.spec.ts, site-navigation.spec.ts; `npm run check:js-budget`

## Notes
- The overlay is server-rendered once in the customer layout and never re-rendered; React (after hydration) and the inline script toggle the same attributes (`data-show` on the veil, `role` and text on the root), so the two paths cannot disagree. React skips its first effect run, so hydrating while an early tap is leaving the page does not hide the overlay.
- The script decides in a 0 ms timeout after the click/submit: if React (or anything) called `preventDefault`, it is not a full page load and the script does nothing.
- The badge's srcset is filled after load + idle (both by the script and by React on mount), so its 10 kB (23 kB at 2x) never competes with the LCP image.
- The overlay blocks taps while up (an opaque screen with live links under it would invite mis-taps); it is never up longer than the navigation + 450 ms (10 s cap for full loads that never unload).
- Frames: scratchpad logo-loader-*.png (375 px).
