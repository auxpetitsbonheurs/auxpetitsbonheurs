# S-223: The bakery's visual identity is applied and still accessible
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: ui-engineer, accessibility-specialist

## Story
As a customer, I want the site to look and feel like Aux petits bonheurs, so that I recognise the bakery and trust ordering from it.

## Acceptance Criteria
- [ ] AC1 (NFR-002): Given the final palette, logo and fonts (cream, pastel accent, rounded serif headings, sans-serif text unless the Owner changed them) are set in `docs/design/tokens.json`, then the site and emails use only token values.
- [ ] AC2 (NFR-002): Given every text/background and UI-component colour pair in the final tokens, then each meets WCAG AA (4.5:1 text, 3:1 large text and components), including sale prices, disabled/greyed dates and focus rings.
- [ ] AC3 (NFR-002): Given the final fonts, then they are self-hosted or system-fallback with `font-display: swap` and add no layout shift above 0.1.
- [ ] AC4 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no regression (no horizontal scroll, tap targets >= 44 px) on home, menu, product, basket, checkout and tracking.
- [ ] AC5 (NFR-002): Given `prefers-reduced-motion` and `prefers-color-scheme`, then animations stop and the scheme is respected (or light-only is documented).
- [ ] AC6 (NFR-001): Given the new identity, then initial JS per route stays <= 170 kB gzipped.
- [ ] AC7 (NFR-002): Given the Owner reviews the identity on her phone, then her approval or change list is recorded; open changes are applied or logged as findings.

## Tests
- AC1 → src/tests/e2e/identity-tokens.spec.ts
- AC2 → src/app/design/contrast.test.ts
- AC3 → production/audits/perf-real-phone.md
- AC4 → src/tests/e2e/identity-tokens.spec.ts
- AC5 → src/tests/e2e/identity-tokens.spec.ts
- AC6 → production/audits/perf-real-phone.md
- AC7 → production/audits/content-sign-off.md

## Notes
- Brand identity was a PRD open item (item 14, placeholder palette); design-director owns visual direction; this story applies it.
- Dependencies (R9): E-04, E-05. Not yet done; expected.
