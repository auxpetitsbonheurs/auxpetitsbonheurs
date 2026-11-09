---
paths:
  - "tests/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__tests__/**"
  - "e2e/**"
  - "**/test_*.py"
  - "**/*_test.go"
---

# Test Standards

- Tests encode acceptance criteria: name them after the behaviour (`rejects expired reset links`)
- Arrange–Act–Assert; one behaviour per test
- Deterministic: fixed clocks, seeded data, no real network (mock at the HTTP boundary with MSW/respx/nock), no order dependence
- Each test creates its own data; parallel-safe
- E2E (Playwright): role/label locators, web-first assertions, no fixed sleeps, traces on failure, an axe check on each critical page
- Integration tests run against a real test database (Docker/Testcontainers), not mocks of your own repository layer
- Never skip, delete or weaken a failing test to make CI green; fix the cause or report it
- Never call live payment, email or AI APIs from tests
