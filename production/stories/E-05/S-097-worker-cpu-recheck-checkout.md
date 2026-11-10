# S-097: Re-measure Worker CPU on pricing and checkout (risk T3)
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#non-functional
Estimate: 2 pts
Owner: observability-engineer, hosting-platform-specialist, test-engineer

## Story
As the bakery owner, I want checkout to stay inside the free hosting CPU limit, so that orders never fail because the site ran out of compute.

## Acceptance Criteria
- [ ] AC1 (NFR-001): Given a 10-line basket with promotions and options, when `/basket` is loaded and `placeOrder` runs on a staging Worker, then CPU time per request is recorded and stays under the free-plan limit (10 ms CPU for `/basket`; `placeOrder` measured and recorded) with the figures written to the audit.
- [ ] AC2 (NFR-001): Given `placeOrder`, when measured at p95 over 50 runs, then wall time <= 800 ms.
- [ ] AC3 (NFR-001): Given `dayStatuses(90)` and `priceBasket` for 10 lines, when benchmarked in vitest bench, then each < 1 ms.
- [ ] AC4 (NFR-001): Given the measurement exceeds a limit, when reported, then risk T3 is updated with the finding and a mitigation (move work off the hot path, cache settings) is proposed; no silent pass.
- [ ] AC5 (NFR-001): Given the client bundle, when built, then `domain/pricing.ts` + `promotions.ts` + `time.ts` <= 6 kB gz and the `/basket` route JS <= 170 kB gz.
- [ ] AC6 (NFR-003): Given measurement runs, when executed, then they use a staging project and test data only (no production data, no paid API call).

## Tests
- AC1 → src/tests/perf/worker-cpu.spec.ts
- AC2 → src/tests/perf/worker-cpu.spec.ts
- AC3 → src/app/domain/pricing.bench.ts
- AC4 → production/audits/perf-checkout-cpu.md (manual report check)
- AC5 → src/tests/e2e/perf-budgets.spec.ts
- AC6 → src/tests/perf/worker-cpu.spec.ts (env guard)

## Notes
- Re-check required by the E-05 risk list. Runs after S-085..S-091. The CPU limit figure comes from ADR-0001 / hosting docs; adjust if the platform limit differs (assumption flagged: 10 ms free-plan CPU).
- No UI, no a11y ACs.
