# S-254: Navigation and pages accessibility, performance and journey sweep
Status: ready
Epic: E-13-site-navigation-and-pages
Spec: docs/design/design-system.md#accessibility-rules · NFRs in docs/product/prd.md section 6
Estimate: 3 pts
Owner: test-engineer, accessibility-specialist, remix-specialist

## Story
As a customer on any device, I want the navigation and the new pages to be fast, readable and usable by everyone, so that I am never stuck or frustrated; and as the client I want the edit-and-see journey proven.

## Acceptance Criteria
- [ ] AC1 (NFR-002): Given the 7 pages plus the open phone menu in EN and FR, then axe finds no serious or critical violation at 375 px and 1280 px, in light and dark themes, and contrast pairs meet AA per docs/design/tokens.json.
- [ ] AC2 (NFR-002, NFR-006): Given each page at 320 px, 375 px and 200% zoom, then there is no horizontal scroll, no clipped action, and every target is >= 44 px (8 px apart in bars and rows).
- [ ] AC3 (NFR-001): Given each new route on throttled 4G mid-range phone, then Lighthouse performance >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, route JS <= 170 kB gz (checked by `check-js-budget`), accessibility >= 95, SEO >= 95.
- [ ] AC4 (FR-076): Given a customer on a 375 px phone, then from any page each of the 7 pages is reachable in at most 2 taps (menu button, link), and the e2e test walks all 7 in EN and FR.
- [ ] AC5 (FR-078): Given the Owner on a phone, when she edits the Our story text and adds one photo and saves, then the page shows both within 60 s, and the flow is timed in a test session under 3 minutes (production/test-sessions/E-13-edit-our-story.md).
- [ ] AC6 (FR-076, FR-078): Given any new page answers an error, then the header, menu and footer still render so the visitor can navigate away.
- [ ] AC7 (FR-076): Given the Escape key, focus return and focus trap of the phone menu on iOS Safari and Android Chrome, then they behave as in AC3/AC4 of S-243 in a recorded real-phone check.
- [ ] AC8 (NFR-007): Given a pseudo-locale (+40%) and the FR locale, then no label or button truncates or overlaps on the nav, menu or pages.

## Tests
- AC1 → src/tests/e2e/site-navigation.spec.ts, src/tests/e2e/content-pages.spec.ts (axe)
- AC2 → src/tests/e2e/content-pages.spec.ts
- AC3 → src/tests/e2e/perf-budgets.spec.ts
- AC4 → src/tests/e2e/site-navigation.spec.ts
- AC5 → src/tests/e2e/admin-pages.spec.ts plus the manual session file
- AC6 → src/tests/e2e/content-pages.spec.ts
- AC7 → manual real-phone session (production/test-sessions/E-13-phone-menu.md)
- AC8 → src/tests/e2e/site-navigation.spec.ts (pseudo-locale)

## Notes
- Last story of the epic; ux-lead signs off the header and menu on a real phone width before the epic is called done (owner preference).
- Depends on: S-242 to S-253.
