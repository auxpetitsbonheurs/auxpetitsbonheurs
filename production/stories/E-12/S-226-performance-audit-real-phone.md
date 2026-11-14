# S-226: Performance meets the budget on a real mid-range phone
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 5 pts
Owner: performance-engineer

## Story
As a customer on a mid-range phone over 4G, I want home and menu to load fast, so that I do not give up before ordering.

## Acceptance Criteria
- [ ] AC1 (NFR-001): Given home and menu on a real mid-range Android phone over 4G with real content, then each loads in under 3 s (median of 5 runs recorded).
- [ ] AC2 (NFR-001): Given Lighthouse (mobile) on home, menu, product, basket, checkout and tracking, then performance >= 90, LCP <= 2.5 s, INP <= 200 ms and CLS <= 0.1.
- [ ] AC3 (NFR-001): Given the production build, then initial JavaScript is <= 170 kB gzipped per route (report per route).
- [ ] AC4 (NFR-001, NFR-009): Given images, then none served exceeds 300 kB and below-the-fold images are lazy-loaded with explicit dimensions.
- [ ] AC5 (NFR-001): Given Worker CPU time measured on staging for checkout submit, price calculation and tracking (T3, re-check after E-05), then the figures are recorded against the 10 ms free-plan limit and any breach is raised to the Owner for decision.
- [ ] AC6 (NFR-001): Given a metric misses its budget, then a finding with the cause and owner is logged and fixed or accepted by product-director with a reason; the story is not closed with an unlogged miss.
- [ ] AC7 (NFR-001): Given the order-action p95, then it stays <= 800 ms with email and push sent after commit.

## Tests
- AC1 → production/audits/perf-real-phone.md
- AC2 → production/audits/perf-lighthouse.md
- AC3 → production/audits/perf-lighthouse.md
- AC4 → production/audits/perf-lighthouse.md
- AC5 → production/audits/perf-worker-cpu.md
- AC6 → production/audits/perf-lighthouse.md
- AC7 → src/tests/perf/order-action.perf.test.ts

## Notes
- Phase 6 exit. Budgets from project.yaml. Report file names take the run date if the team prefers. CPU result may trigger an Owner decision on a paid plan (breaks NFR-009).
- Dependencies (R9): S-221, S-223, E-01..E-11. Not yet done; expected.

## Launchprep notes (2026-11-14)
- Method prepared (production/audits/perf-real-phone.md); needs a real mid-range phone and the real menu. Checkout lab figures: production/audits/perf-checkout-2026.md.
