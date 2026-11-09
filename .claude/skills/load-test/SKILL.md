---
name: load-test
description: "Generates and runs k6 load tests for key endpoints and journeys against local or staging environments only, with thresholds from project.yaml and the PRD's expected traffic. Use before launch, before a marketing push, or when checking whether an endpoint or database will hold up."
argument-hint: "[endpoint | journey]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(k6 *), Bash(docker run *grafana/k6*)
model: sonnet
---

# Load Test

Finds the breaking point before users do. Scripts live in `tests/load/`; the
report goes to `production/audits/perf-load-YYYY-MM-DD.md`. **Never** targets
production, third-party APIs (payment, email, AI, auth providers) or any host
the user does not own; those are mocked or excluded.

## Inputs

- PRD non-functional requirements (expected users, peak requests/second, p95 targets)
- `docs/architecture/api/openapi.yaml` or the route inventory
- The target: local production build or staging URL (ask; refuse production)

## Phases

### Phase 1: Model the traffic

With `performance-engineer`, agree: scenarios (e.g. 70% browse, 20% search, 10%
checkout-to-provider), target load (expected peak × 2–3), ramp profile, and
thresholds: `http_req_failed < 1%`, `http_req_duration p(95) < <target> ms`.
If the PRD has no traffic numbers, ask the user for an estimate and record it.

### Phase 2: Script

Draft `tests/load/<scenario>.js` for k6: `options.scenarios` with
`ramping-vus` or `ramping-arrival-rate`, `thresholds`, realistic think time,
test users created by a setup function or seeded data, auth via a login step
or a test token from env (`__ENV`), and checks on status and body. Third-party
calls must be stubbed in the target environment. Show and ask before writing.

### Phase 3: Run

Confirm the target URL once more, then run `k6 run tests/load/<scenario>.js`
(or `docker run --rm -i grafana/k6 run - < …`). Watch for errors early and
stop if the target is not the agreed one.

### Phase 4: Analyse

Report throughput, p50/p95/p99 latency, error rate, thresholds passed/failed,
and where it broke (CPU, DB connections, pool exhaustion, slow query, rate
limiter, memory). Spawn `postgres-specialist`/`data-engineer` for DB
bottlenecks. Recommend fixes with expected impact.

### Phase 5: Write

Ask before writing the report (template `perf-report`, section "Load").

## Output

`tests/load/*.js`, `production/audits/perf-load-YYYY-MM-DD.md` (template: `.claude/docs/templates/perf-report.md`).

## Next step

`/create-stories` for the fixes, then re-run the same scenario to compare.
