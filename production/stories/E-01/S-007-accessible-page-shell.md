# S-007: Accessible page shell and design tokens
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/specs/features/catalogue-browsing.md#ux
Estimate: 3 pts
Owner: tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer on a phone, I want a clear, readable page frame that works with my keyboard and zoom, so that I can use the site comfortably whatever my abilities or screen.

## Acceptance Criteria
- [ ] AC1 (NFR-002): Given any customer page, then it has a "Skip to content" link as the first focusable item, one `main`, a `header` and a `footer` landmark, one `h1`, and the header shows the bakery name and a basket link whose accessible name is "Basket, 2 items" (localised, with the count).
- [ ] AC2 (NFR-002): Given the colour tokens in `docs/design/tokens.json`, then `app.css` uses the same light and dark values, and every text/background pair listed in the tokens `contrast` table is at least 4.5:1 (3:1 for large text and UI parts), computed in a test.
- [ ] AC3 (NFR-002, NFR-006): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC4 (NFR-002): Given the page in light and dark mode, then every text and control pair meets WCAG AA contrast with the tokens in `docs/design/tokens.json`, and an axe scan reports no serious or critical violations.
- [ ] AC5 (NFR-002): Given `prefers-reduced-motion: reduce`, then transitions and the basket count animation are disabled and the count change is announced through a polite live region.
- [ ] AC6 (NFR-002): Given the shadcn `Button`, then its minimum height is 44 px on touch sizes and its focus ring has at least 3:1 contrast against the page background.
- [ ] AC7 (NFR-006): Given a page with no JavaScript, then the shell, navigation and basket link still render (server-rendered).

## Tests
- AC1 → src/tests/e2e/a11y-shell.spec.ts
- AC2 → src/app/lib/tokens.test.ts (reads tokens.json and app.css, computes ratios)
- AC3 → src/tests/e2e/a11y-shell.spec.ts
- AC4 → src/tests/e2e/a11y-shell.spec.ts (axe, both colour schemes)
- AC5 → src/tests/e2e/a11y-shell.spec.ts (emulated reduced motion)
- AC6 → src/app/components/ui/button.test.tsx
- AC7 → src/tests/e2e/a11y-shell.spec.ts (JavaScript disabled context)

## Notes
- Depends on: S-005, S-006.
- No prototype defects carry over: duplicate `aria-label`s and unlabelled controls from `prototypes/apb-v1` are not copied; each control gets its own accessible name.
- UX source: design-system.md and the shell notes in the catalogue-browsing spec; no new wireframe needed for the frame.
- Footer contact values come from Settings (read-only here); the footer shows the seeded placeholders until E-03.
