# S-194: Sign-in, confirmation, reset and invitation emails arrive from Supabase in EN/FR
Status: done (2026-11-13; sending untested live: no sender domain yet)
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#api-contract
Estimate: 5 pts
Owner: auth-specialist, email-specialist

## Story
As a customer or invited admin waiting on a link, I want the email to arrive quickly in my language, so that I can sign in, confirm or set my password.

## Acceptance Criteria
- [ ] AC1 (FR-070, NFR-003): Given a POST to `/hooks/supabase/send-email` with a valid Standard Webhooks signature, when `email_action_type` is `signup`, `magiclink`, `recovery`, `email_change` or `invite`, then the matching email (`signup_confirm`, `sign_in_link`, `password_reset`, `admin_invitation`) is sent directly through Resend and the hook returns `200 {}`.
- [ ] AC2 (NFR-003): Given a bad or missing signature, or a timestamp more than 5 minutes off, then the response is 401 and nothing is sent.
- [ ] AC3 (NFR-003): Given the same `webhook-id` delivered twice, then one email is sent (outbox `dedupe_key`).
- [ ] AC4 (FR-070): Given `user_metadata.locale` is `fr`, then the email is in French; given it is missing, then in English.
- [ ] AC5 (FR-070): Given an admin invitation, then the email contains a set-password link valid 7 days; given a customer link, then it is one-time and valid 1 hour.
- [ ] AC6 (FR-074): Given Resend fails, then the hook returns `500 { error: { http_code, message } }` so Supabase surfaces the failure, and nothing is queued silently.
- [ ] AC7 (FR-071, NFR-002): Given these emails, then they use the S-188 layout (320 px, 16 px text, 44 px buttons, 4.5:1 contrast).
- [ ] AC8 (NFR-003): Given the hook secret `SUPABASE_AUTH_HOOK_SECRET`, then it is read from typed env, documented only as a placeholder in `.env.example`, and never logged.
- [ ] AC9 (NFR-003): Given the link target, then `redirect_to` is accepted only if same-origin or the configured site URL; otherwise the email is not sent.

## Tests
- AC1 → src/app/routes/hooks.supabase.send-email.test.ts
- AC2 → src/app/routes/hooks.supabase.send-email.test.ts
- AC3 → src/app/routes/hooks.supabase.send-email.test.ts
- AC4 → src/app/server/email/templates/auth-emails.test.ts
- AC5 → src/app/server/email/templates/auth-emails.test.ts
- AC6 → src/app/routes/hooks.supabase.send-email.test.ts
- AC7 → src/app/server/email/templates/auth-emails.test.ts
- AC8 → src/app/server/env.test.ts
- AC9 → src/app/routes/hooks.supabase.send-email.test.ts

## Notes
- E-02 triggers invitations and E-11 sign-in/reset flows; the templates and the hook are built here (epic Scope "Out" note).
- Added AC9 (open-redirect guard) from threat-model F/G concerns; flag if lead-backend disagrees.
- Auth emails bypass the daily cap below 100 (S-187 AC2).
- Dependencies (R9): E-01 (auth shell), S-186, S-188. Not yet done; expected.
