# S-024: Password reset emails through the auth email hook
Status: review
Epic: E-02-admin-access-team
Spec: docs/architecture/architecture.md#security
Estimate: 5 pts
Owner: email-specialist, auth-specialist, api-engineer

## Story
As an admin who forgot my password, I want the reset email to arrive in my language with a safe link, so that I can get back into the app.

## Acceptance Criteria
- [x] AC1 (FR-040): Given a correctly signed webhook for `recovery` with `user.user_metadata.locale = "fr"`, when `POST /hooks/supabase/send-email` runs, then it returns `200 {}` and one French email is sent through Resend (fake in tests) whose link is `<SITE_URL>/auth/confirm?token_hash=<hash>&type=recovery&next=/admin/reset`.
- [x] AC2 (NFR-003): Given a bad signature or a `webhook-timestamp` more than 5 minutes old, then the response is 401 and nothing is sent.
- [x] AC3 (NFR-003): Given a `redirect_to` whose origin is not the environment's `SITE_URL`, or a `next` that is not a relative path, then the response is 500 `{ error: { http_code, message } }` and nothing is sent.
- [x] AC4 (NFR-007): Given no locale or an unknown locale, then the English template is used; both templates carry the bakery name, a one-sentence reason, the link, and an expiry note.
- [x] AC5 (NFR-003): Given the provider fails or does not answer within 8 seconds, then the response is 500 with a safe message so Supabase shows the failure, and the body contains no secret or provider detail.
- [x] AC6 (NFR-003): Given the same `webhook-id` is delivered twice, then the second call returns 200 and no second email is sent (dedupe key).
- [x] AC7 (NFR-004): Given the email body, then it contains only the link, bakery name and expiry; no password, no order data.
- [x] AC8 (NFR-003): Given an `email_action_type` this epic does not handle (magiclink, signup, email_change), then the hook returns 500 `unsupported` and sends nothing (E-11 adds them).

## Tests
- AC1 → src/app/routes/hooks/send-email.test.ts
- AC2 → src/app/routes/hooks/send-email.test.ts
- AC3 → src/app/routes/hooks/send-email.test.ts
- AC4 → src/app/server/email/templates.test.ts
- AC5 → src/app/routes/hooks/send-email.test.ts (fake provider with a timeout) and src/app/server/email/sender.test.ts
- AC6 → src/app/routes/hooks/send-email.test.ts
- AC7 → src/app/server/email/templates.test.ts
- AC8 → src/app/routes/hooks/send-email.test.ts

## Notes
- Depends on: S-003 (E-01). Contract: "Webhooks and resource endpoints" `/hooks/supabase/send-email`. Redirect allowlist rule: architecture "Security" (threat-model G-04).
- Spec gap: the specs assign the Resend sender and email templates to E-10 (notifications), but Phase 1 exit needs a real reset and invitation email. Decision: E-02 builds the minimal Resend adapter (`server/email/sender.ts`, timeout 8 s) and the two templates it needs (recovery here, invitation in S-028); E-10 extends it with the other templates, retry and daily cap.
- No UI in this story. Wording of the two emails is drafted by the developer and reviewed by `copywriter` before launch (E-12).
- Real DKIM/SPF/DMARC setup is a launch task (threat-model G-03), not part of this story.
- Built 2026-11-12 (batch 5): `server/email/sender.server.ts` (Resend, 8 s), `templates.server.ts`, `auth-hook.server.ts`, route `routes/hooks/send-email.ts`. SITE_URL = the origin the hook is called on (no new variable). Language falls back to the admin row's `locale` when `user_metadata.locale` is absent. Dedupe row `email_outbox` `auth-hook:<webhook-id>` (status `dead` while sending so the outbox job never picks it up; released on failure so a retry can send). Templates are plain functions (no React Email dependency), so the test is `templates.test.ts`. Proven with a fake mailer only: staging needs `RESEND_API_KEY`, `EMAIL_FROM`, `SUPABASE_AUTH_HOOK_SECRET` and the hook enabled (deploy-keys.md section 2).
