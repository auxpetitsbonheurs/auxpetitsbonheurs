# S-023: Rate limits on sign-in and password reset
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#edge-cases
Estimate: 3 pts
Owner: api-engineer, postgres-specialist, auth-specialist

## Story
As the bakery Owner, I want repeated sign-in or reset attempts slowed down, so that nobody can guess an admin password or spam reset emails.

## Acceptance Criteria
- [ ] AC1 (NFR-003): Given five sign-in attempts in 15 minutes from the same email and IP, when a sixth arrives, then it returns `RATE_LIMITED` (429) with a `Retry-After` header and the message "Too many attempts, wait a few minutes."; the fifth is still processed normally.
- [ ] AC2 (NFR-003): Given the 15-minute window has passed (fixed clock), when I try again, then the attempt is processed.
- [ ] AC3 (NFR-003): Given different emails from the same IP, then each email has its own count (key = email + IP).
- [ ] AC4 (NFR-003, NFR-004): Given a limit counter, then the stored key is a SHA-256 hash of the action, email and IP; no raw email or IP is written to `rate_limit_bucket` or to logs.
- [ ] AC5 (NFR-003): Given 20 concurrent attempts on one key, then the count is exactly 20 (atomic increment) and attempts above the limit are refused.
- [ ] AC6 (NFR-003): Given the class `RL-auth`, then it also covers `admin/forgot` and `admin/reset`, and the limited response is the same for known and unknown emails.
- [ ] AC7 (NFR-003): Given buckets older than one day, when `purgeRateLimitBuckets(now)` runs, then they are deleted and newer ones kept.
- [ ] AC8 (NFR-002): Given the limited state on the sign-in page, then the message is announced (`role="alert"`), the form fields keep their values, and the page meets the same keyboard, 320/375 px, 200% zoom, 44 px tap target and WCAG AA contrast rules as S-009.

## Tests
- AC1 → src/app/server/rate-limit.server.test.ts and src/app/routes/admin/login.test.ts
- AC2 → src/app/server/rate-limit.server.test.ts
- AC3 → src/app/server/rate-limit.server.test.ts
- AC4 → src/app/server/rate-limit.server.test.ts
- AC5 → src/app/server/rate-limit.server.test.ts (Postgres container)
- AC6 → src/app/routes/admin/forgot.test.ts
- AC7 → src/app/server/rate-limit.server.test.ts
- AC8 → src/tests/e2e/admin-sign-in.spec.ts

## Notes
- Depends on: S-004, S-009 (E-01).
- The helper is generic (class, key, window, max); `RL-order` and `RL-track` reuse it in E-05. Sizes from architecture "Cross-cutting": sign-in/link/reset 5 / 15 min per email+IP.
- Cron purge wiring is added with the other jobs; this story ships the function and its test.
