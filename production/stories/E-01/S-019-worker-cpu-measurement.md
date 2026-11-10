# S-019: Measure Worker CPU time on staging (risk T3)
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#quality-attributes
Estimate: 3 pts
Owner: observability-engineer, hosting-platform-specialist, test-engineer

## Story
As the bakery owner, I want to know early whether the free Cloudflare plan's 10 ms CPU limit is enough, so that I can decide about a paid plan before the site is built on a wrong assumption.

## Acceptance Criteria
- [ ] AC1 (NFR-009): Given a list of CPU samples in ms, when `summarizeCpu` runs, then it returns count, p50, p99 and max (nearest-rank), and the verdict `pass` when p99 is under 10 ms and `fail` otherwise; an empty list throws a typed error.
- [ ] AC2 (NFR-009): Given measured results, then `docs/architecture/cpu-measurements.md` has a table per hot path (checkout submit, `/basket` with price calculation, tracking page) with cold and warm samples, count, p50, p99, max, verdict and the date, built by the report function.
- [ ] AC3 (NFR-009): Given at least 50 requests per hot path against staging (each submit with its own idempotency key and seeded data), when CPU time is read from Workers Logs, then the numbers are recorded in that file; the story is not done until they are.
- [ ] AC4 (NFR-009): Given any hot path with p99 at or above 10 ms, then the report marks FAIL and the hand-off asks the Owner to decide on Workers Paid ($5/month, which breaks NFR-009); no paid plan is bought or configured by this story.
- [ ] AC5 (NFR-004): Given each request, then one structured log line carries request id, route, status and duration, and the path `/t/:token` and `/order/:token/*` are logged as `/t/[redacted]` and `/order/[redacted]/*`; no cookie, token or personal data appears in logs.
- [ ] AC6 (NFR-012): Given the procedure, then `docs/runbooks/worker-cpu.md` lists the exact steps; steps that need a Cloudflare API token or dashboard access are documented for the user to run, with the token named only as a placeholder.
- [ ] AC7 (NFR-001): Given `placeOrder` pricing and number allocation, then a unit benchmark with 10 lines runs the pure domain code in under 1 ms of measured wall time per call on the CI runner (a sanity guard, not the platform measurement).

## Tests
- AC1 → src/app/lib/cpu-report.test.ts
- AC2 → src/app/lib/cpu-report.test.ts (markdown output)
- AC3 → docs/architecture/cpu-measurements.md (evidence file; checked by src/app/lib/cpu-report.test.ts for the presence of all three paths)
- AC4 → src/app/lib/cpu-report.test.ts
- AC5 → src/workers/log-redact.test.ts
- AC6 → src/app/lib/readme.test.ts (links to the runbook)
- AC7 → src/app/domain/pricing.bench.test.ts

## Notes
- Depends on: S-002, S-014, S-016.
- Risk T3 in the epic. The measurement itself needs the deployed staging site and Cloudflare dashboard access, so it is run by the user or the developer with the user's account; the story documents and tooling are what is built here.
- Smart Placement (architecture "Data") is enabled in `wrangler.jsonc` only if the numbers or TTFB justify it.
- AC7 is a guard against accidental heavy code, not a CPU guarantee.
