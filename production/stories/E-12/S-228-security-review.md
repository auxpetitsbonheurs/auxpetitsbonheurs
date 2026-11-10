# S-228: Security review before launch
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 5 pts
Owner: security-lead

## Story
As the Owner, I want the site checked for common attacks before real customers use it, so that orders and customer data stay safe.

## Acceptance Criteria
- [ ] AC1 (NFR-003): Given an Admin session, when calling each Owner-only route and action by URL or fetcher, then each returns 403; given a customer or anonymous visitor on any `/admin/*` page (except login, invite, forgot, reset), then they are redirected to `/admin/login` and no data returns.
- [ ] AC2 (NFR-003): Given the rate-limited classes (sign-in, sign-up, reset, order, custom request, uploads, tracking, email-sending), then exceeding each returns `RATE_LIMITED` with `Retry-After`; Turnstile is enforced on public forms.
- [ ] AC3 (NFR-003): Given uploads, then non-images and files over 1 MB or more than 5 photos are rejected server-side.
- [ ] AC4 (NFR-003): Given tracking tokens, then they are long and random, a wrong and an unknown token give the same 404, and tracking pages carry `noindex` and no-store caching.
- [ ] AC5 (NFR-003): Given the Supabase email hook, then bad signatures and old timestamps give 401, and replayed `webhook-id`s send once; push and email secrets appear nowhere in the repo, logs or client bundles.
- [ ] AC6 (NFR-003): Given the threat-model gaps list (G items), then each is marked fixed, accepted by the Owner, or raised as a finding; the guest-order linking tests (G-01, G-02) pass.
- [ ] AC7 (NFR-003): Given response headers, then CSP, HSTS, X-Content-Type-Options, Referrer-Policy and cookie flags (HttpOnly, Secure, SameSite=Lax) are present; open-redirect (`next`) tests pass.
- [ ] AC8 (NFR-003, NFR-012): Given the dependency audit, then no known high or critical vulnerability remains unaccepted; two-step sign-in is enabled on all service accounts.
- [ ] AC9 (NFR-003): Given a critical or high finding, then launch is blocked until fixed or accepted in writing by the Owner and product-director.

## Tests
- AC1 → src/tests/e2e/security-roles.spec.ts
- AC2 → src/tests/e2e/security-rate-limits.spec.ts
- AC3 → src/tests/e2e/security-uploads.spec.ts
- AC4 → src/tests/e2e/security-tracking.spec.ts
- AC5 → production/audits/security-2026.md
- AC6 → production/audits/security-2026.md
- AC7 → src/tests/e2e/security-headers.spec.ts
- AC8 → production/audits/security-2026.md
- AC9 → production/audits/security-2026.md

## Notes
- Static/dynamic checks run against staging only; no third-party contact or paid scanners without the user's instruction.
- Dependencies (R9): E-01..E-11. Not yet done; expected.
