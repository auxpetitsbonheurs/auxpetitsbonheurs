# S-162: Spam protection and rate limits on the custom request form
Status: ready
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#edge-cases
Estimate: 3 pts
Owner: api-engineer, auth-specialist, ui-engineer, test-engineer

## Story
As the bakery, I want the public request form and photo upload protected from bots and floods, so that the inbox, storage and free-plan email limits stay usable.

## Acceptance Criteria
- [ ] AC1 (NFR-003): Given `submitCustomRequest` or `requestUploadUrls` without a valid Turnstile token, then `BOT_CHECK_FAILED` and no order or URL is created.
- [ ] AC2 (NFR-003): Given the same IP sends 4 requests in 10 minutes, then the 4th returns `RATE_LIMITED` (RL-request: 3 per 10 min) with a friendly message and `Retry-After`; the form content is kept.
- [ ] AC3 (NFR-003): Given the same IP requests upload URLs 21 times in 10 minutes, then the 21st returns `RATE_LIMITED` (RL-upload: 20 per 10 min).
- [ ] AC4 (NFR-003): Given a legitimate customer behind shared mobile IP, then a rate-limit message tells them to try later or message on WhatsApp, and never loses their text.
- [ ] AC5 (NFR-003): Given the Turnstile widget fails to load (blocked script), then the form shows "We could not verify you are human. Reload or message us on WhatsApp" and does not submit silently.
- [ ] AC6 (NFR-003): Given tests, then no real Turnstile network call is made (test keys / stub) and the secret is read only from validated env (`.env.example` placeholder).
- [ ] AC7 (NFR-002, NFR-006): Given the Turnstile widget and messages, then no puzzles are used, the widget is keyboard-reachable, errors are announced with `role=alert`, text meets AA contrast per `docs/design/tokens.json` and the layout fits 320/375 px at 200% zoom.

## Tests
- AC1 → src/app/routes/custom-cake.test.tsx
- AC2 → src/app/lib/rate-limit.test.ts
- AC3 → src/app/lib/rate-limit.test.ts
- AC4 → src/app/routes/custom-cake.test.tsx
- AC5 → src/tests/e2e/custom-request.spec.ts
- AC6 → src/app/lib/turnstile.test.ts
- AC7 → src/tests/e2e/custom-request.a11y.spec.ts

## Notes
- Depends on S-151, S-153. Reuse the E-01/E-05 rate-limit and Turnstile helpers if they exist (checkout uses the same); only add the RL-request and RL-upload buckets here.
- Spec cites the limits in Edge Cases; contract names `RL-request`, `RL-upload`.
