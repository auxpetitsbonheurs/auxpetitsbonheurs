<!-- Template: perf-report | Filled by: /perf-audit (performance-engineer) | Output: production/audits/perf-YYYY-MM-DD.md -->
# Performance Audit — [DATE]

Environment: [PREVIEW URL / LOCAL PROD BUILD] · Profile: [Lighthouse mobile, Slow 4G, 4× CPU]
Budgets: project.yaml → budgets · Verdict: [PASS | CONCERNS | FAIL]

## Results vs budget
| Route | Perf | A11y | BP | SEO | LCP (≤[2500]ms) | INP (≤[200]ms) | CLS (≤[0.1]) | JS kB (≤[170]) | Status |
|---|---|---|---|---|---|---|---|---|---|
| / | [N] | [N] | [N] | [N] | [ms] | [ms] | [N] | [kB] | [✓/✗] |

## Field data (if available)
[CrUX / RUM p75 VALUES]

## Top opportunities
| # | Issue | Route | Impact (est.) | Fix | Owner |
|---|---|---|---|---|---|
| 1 | [LCP IMAGE NOT PRELOADED] | / | [-800ms LCP] | [PRIORITY/PRELOAD, SIZES] | ui-engineer |

## Bundle analysis
- Largest chunks: [CHUNK — SIZE — CAUSE]
- Third-party scripts: [SCRIPT — SIZE — LOAD STRATEGY]

## Backend latency
| Endpoint | p50 | p95 | Target | Notes |
|---|---|---|---|---|

## Before / after (for fixes made)
| Change | Metric | Before | After |
|---|---|---|---|
