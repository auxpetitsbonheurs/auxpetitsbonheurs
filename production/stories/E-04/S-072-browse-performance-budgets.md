# S-072: Browsing pages meet the performance and accessibility budgets
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#non-functional
Estimate: 2 pts
Owner: test-engineer, observability-engineer

## Story
As a customer on a mid-range phone over 4G, I want Home and Menu to load fast and be usable, so that I do not give up before I see the cakes.

## Acceptance Criteria
- [ ] AC1 (NFR-001): Given Home and Menu on a throttled mid-range 4G profile, when loaded, then they are interactive in under 3 s.
- [ ] AC2 (NFR-001): Given Home, Menu, Product and Gallery, when Lighthouse runs (mobile), then performance >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1.
- [ ] AC3 (NFR-001): Given each customer route, when the production build is measured, then initial JS <= 170 kB gz (carousel and lightbox are lazy chunks); a budget breach fails CI with the route named.
- [ ] AC4 (NFR-001): Given any served product or gallery image, when measured, then it is <= 300 kB, in a modern format, with explicit width/height, and lazy below the fold; the hero uses `fetchpriority=high`.
- [ ] AC5 (NFR-002): Given Home, Menu, Product, Gallery, About, Contact, FAQ, when Lighthouse accessibility and axe run at 320 px and 375 px, then the score >= 95 and axe reports zero serious or critical issues.
- [ ] AC6 (NFR-006): Given the same pages at 200% zoom and keyboard-only, when navigated end to end, then there is no sideways scroll, no keyboard trap and tap targets >= 44 px.

## Tests
- AC1 → src/tests/e2e/perf-budgets.spec.ts
- AC2 → src/tests/e2e/perf-budgets.spec.ts
- AC3 → src/tests/e2e/perf-budgets.spec.ts (reads build manifest)
- AC4 → src/tests/e2e/perf-budgets.spec.ts
- AC5 → src/tests/e2e/a11y-browse.spec.ts
- AC6 → src/tests/e2e/a11y-browse.spec.ts

## Notes
- Verification story that closes the epic success measure; runs after S-061..S-071 are done (dependency within epic).
- Budgets come from project.yaml; do not hard-code different numbers.
