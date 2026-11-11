# S-023: Rate limits on sign-in and password reset
Status: review
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#edge-cases
Estimate: 3 pts
Owner: api-engineer, postgres-specialist, auth-specialist

## Story
As the bakery Owner, I want repeated sign-in or reset attempts slowed down, so that nobody can guess an admin password or spam reset emails.

## Acceptance Criteria
- [x] AC1 (NFR-003): Given five sign-in attempts in 15 minutes from the same email and IP, when a sixth arrives, then it returns `RATE_LIMITED` (429) with a `Retry-After` header and the message "Too many attempts, wait a few minutes."; the fifth is still processed normally.
- [x] AC2 (NFR-003): Given the 15-minute window has passed (fixed clock), when I try again, then the attempt is processed.
- [x] AC3 (NFR-003): Given different emails from the same IP, then each email has its own count (key = email + IP).
- [x] AC4 (NFR-003, NFR-004): Given a limit counter, then the stored key is a SHA-256 hash of the action, email and IP; no raw email or IP is written to `rate_limit_bucket` or to logs.
- [x] AC5 (NFR-003): Given 20 concurrent attempts on one key, then the count is exactly 20 (atomic increment) and attempts above the limit are refused.
- [x] AC6 (NFR-003): Given the class `RL-auth`, then it also covers `admin/forgot` and `admin/reset`, and the limited response is the same for known and unknown emails.
- [x] AC7 (NFR-003): Given buckets older than one day, when `purgeRateLimitBuckets(now)` runs, then they are deleted and newer ones kept.
- [x] AC8 (NFR-002): Given the limited state on the sign-in page, then the message is announced (`role="alert"`), the form fields keep their values, and the page meets the same keyboard, 320/375 px, 200% zoom, 44 px tap target and WCAG AA contrast rules as S-009.

## Tests
- AC1 → src/app/server/rate-limit.server.test.ts and src/app/routes/admin/login.test.ts
- AC2 → src/app/server/rate-limit.server.test.ts
- AC3 → src/app/server/rate-limit.server.test.ts
- AC4 → src/app/server/rate-limit.server.test.ts
- AC5 → src/app/server/rate-limit.server.test.ts (PGlite; the count is one atomic `insert ... on conflict do update ... returning`, so it holds on any Postgres)
- AC6 → src/app/server/auth-rate-limit.server.test.ts and src/app/routes/admin/login.test.ts (forgot/reset routes arrive with S-025/S-026 and must call `consumeAuthAttempt(args, AUTH_ACTIONS.forgot | reset, email)`)
- AC7 → src/app/server/rate-limit.server.test.ts
- AC8 → src/tests/e2e/admin-sign-in.spec.ts

## Notes
- Depends on: S-004, S-009 (E-01).
- The helper is generic (class, key, window, max); `RL-order` and `RL-track` reuse it in E-05. Sizes from architecture "Cross-cutting": sign-in/link/reset 5 / 15 min per email+IP.
- Cron purge wiring: added in the batch-1 review (hourly `purgeRateLimits` job in app/jobs/dispatch.ts), so buckets never outlive a day.
- Built 2026-11-12: Postgres fixed windows in the existing `rate_limit_bucket` (architecture "Cross-cutting"), so no new infrastructure and no ADR; Workers KV was not used (eventually consistent, so concurrent attempts could slip past). IP = `CF-Connecting-IP`. A successful sign-in resets that email + IP count. Field problems are not counted. The limited alert also says how many minutes to wait (`retryAfterMinutes`, contract v0.17).
