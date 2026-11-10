# S-007: Accessible page shell and design tokens
Status: review
Epic: E-01-walking-skeleton
Spec: docs/specs/features/catalogue-browsing.md#ux
Estimate: 3 pts
Owner: tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer on a phone, I want a clear, readable page frame that works with my keyboard and zoom, so that I can use the site comfortably whatever my abilities or screen.

## Acceptance Criteria
- [x] AC1 (NFR-002): Given any customer page, then it has a "Skip to content" link as the first focusable item, one `main`, a `header` and a `footer` landmark, one `h1`, and the header shows the bakery name and a basket link whose accessible name is "Basket, 2 items" (localised, with the count).
- [x] AC2 (NFR-002): Given the colour tokens in `docs/design/tokens.json`, then `app.css` uses the same light and dark values, and every text/background pair listed in the tokens `contrast` table is at least 4.5:1 (3:1 for large text and UI parts), computed in a test.
- [x] AC3 (NFR-002, NFR-006): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [x] AC4 (NFR-002): Given the page in light and dark mode, then every text and control pair meets WCAG AA contrast with the tokens in `docs/design/tokens.json`, and an axe scan reports no serious or critical violations.
- [x] AC5 (NFR-002): Given `prefers-reduced-motion: reduce`, then transitions and the basket count animation are disabled and the count change is announced through a polite live region.
- [x] AC6 (NFR-002): Given the shadcn `Button`, then its minimum height is 44 px on touch sizes and its focus ring has at least 3:1 contrast against the page background.
- [x] AC7 (NFR-006): Given a page with no JavaScript, then the shell, navigation and basket link still render (server-rendered).

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
- Decision: colours are the tokens.json hex values as CSS variables; dark mode switches with `@media (prefers-color-scheme: dark)` (the `dark:` variant now uses the same media query) instead of shadcn's `.dark` class (rationale: design-system "follows prefers-color-scheme, no manual toggle").
- Decision: tokens.test.ts checks every colour role in light and dark against app.css and recomputes each passing contrast pair (UI roles border-input and ring at 3:1, the rest at 4.5:1); `app/lib/contrast.ts` holds the WCAG formula.
- Decision: 200% zoom is tested in all three projects, including 320 px (160 CSS px effective), stricter than WCAG reflow's 320 CSS px (rationale: the gate asks for 200% without loss at phone widths).
- Decision: the top bar is not sticky yet (rationale: a sticky bar eats the viewport at 200% zoom on phones; revisit with the site menu story).
- Decision: Button: every size min 44 px, height auto with wrapping labels, radius full, solid 2 px `--ring` outline from the global `:focus-visible` rule (replaces shadcn's 50% alpha ring, which could fall under 3:1).
- Decision: self-hosted Fraunces (full axes, for SOFT 100) and Nunito Sans replace Geist and the Google Fonts Inter link (rationale: brand guide; no third-party requests).
- Decision: header count reads the `apb_basket` cookie with a PROVISIONAL `[{ productId, quantity }]` shape; S-011 owns the format and replaces `basket-count.server.ts`.
- Decision: the count bumps (`animate-basket-bump`) only when it changes after load; `prefers-reduced-motion: reduce` sets motion tokens to 0 ms and disables animations and transitions globally; changes are announced by a `role="status"` polite region.
- Decision: footer reads WhatsApp, phone, email and pickup address from Settings; blank values are omitted. WhatsApp uses a Lucide icon until the official monochrome glyph is added (E-03). E2E seeds placeholder contacts.
- Added: `<html data-hydrated>` marker set after hydration so specs wait for client behaviour without sleeps; e2e helpers `withZoom`, `expectTapTargets`, `expectNothingClipped`, `expectKeyboardOperable`.
