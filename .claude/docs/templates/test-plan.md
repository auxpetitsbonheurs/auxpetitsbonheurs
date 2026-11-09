<!-- Template: test-plan | Filled by: /team-qa (qa-lead) | Output: production/test-plans/<feature-or-release>.md -->
# Test Plan — [FEATURE / RELEASE]

Date: [YYYY-MM-DD] · Spec: [LINK] · Rigor: [minimal | standard | full]

## Scope
- In: [FEATURES, ROUTES, ENDPOINTS] · Out: [ITEMS]

## Strategy
| Layer | Tool | What | Owner |
|---|---|---|---|
| Unit | [vitest/jest/pytest] | domain logic, validators | test-engineer |
| Integration | [supertest/httpx + test DB] | endpoints, authz, DB | test-engineer |
| Component | [Testing Library] | UI behaviour, states | ui-engineer |
| E2E | Playwright | critical journeys | test-engineer |
| Accessibility | axe + manual keyboard/SR | changed pages | accessibility-specialist |
| Performance | Lighthouse CI / k6 | key routes / endpoints | performance-engineer |

## Cases (from acceptance criteria)
| ID | AC | Case | Layer | Data | Expected |
|---|---|---|---|---|---|
| TC-01 | AC1 | [CASE] | integration | [FIXTURE] | [RESULT] |

## Critical journeys covered
- [ ] Signup → first [VALUE ACTION]
- [ ] Login / logout / reset
- [ ] [CHECKOUT / CORE TASK]

## Environments & data
[LOCAL, PREVIEW URL, SEED DATA, TEST-MODE PROVIDER KEYS]

## Browsers / devices
[CHROMIUM, WEBKIT, FIREFOX; MOBILE VIEWPORT 375×812]

## Exit criteria
- All Must cases pass; no open S1/S2 bugs; no new axe violations; budgets met

## Results
| Run | Date | Pass | Fail | Notes |
|---|---|---|---|---|
