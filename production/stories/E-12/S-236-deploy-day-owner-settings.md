# S-236: Deploy-day checklist: the Owner enters the real Juice number and pickup address
Status: in-progress
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#12-open-questions
Estimate: 3 pts
Owner: release-manager

## Story
As the Owner, I want a short deploy-day checklist, so that I set the Juice number, pickup address and other live settings myself and nothing placeholder reaches customers.

## Acceptance Criteria
- [ ] AC1 (NFR-012): Given the Owner signed in on live, when she enters the real Juice number and exact pickup address (Beau Bassin area) in Settings, then the values save and appear on checkout, `order_confirmed` email, the tracking page and the WhatsApp payment reminder.
- [ ] AC2 (NFR-012): Given the settings still contain placeholders (Juice number, address) at the pre-launch check, then the checklist fails and launch is blocked.
- [ ] AC3 (NFR-012): Given the other launch settings (delivery fee Rs 200, notice 3 days, Sunday closed, windows 9-12/12-17/17-20, quote validity 5 days, evening reminder 18:00, WhatsApp templates, bakery WhatsApp number, Instagram link), then each is shown with the agreed value and ticked by the Owner.
- [ ] AC4 (NFR-012): Given the Resend sending domain, Turnstile, VAPID keys, hook secret and Supabase redirect URLs, then each is configured on live and checked by a test email, a test push and a test sign-in link.
- [ ] AC5 (NFR-012): Given the launch address (the free Cloudflare `*.workers.dev` default per owner decision), then the site URL in emails, share previews, sitemap and auth redirects all use it consistently and a custom domain can be added later by the Owner without code change.
- [ ] AC6 (NFR-003): Given an Admin who is not the Owner, then she cannot edit Settings; the checklist is performed with the Owner account.
- [ ] AC7 (NFR-012): Given the Owner makes a typo (letters in the Juice number, empty address), then validation shows a field error and nothing is saved.

## Tests
- AC1 → src/tests/e2e/deploy-day-settings.spec.ts
- AC2 → src/tests/e2e/deploy-day-settings.spec.ts
- AC3 → production/releases/launch-checklist.md
- AC4 → production/releases/launch-checklist.md
- AC5 → src/tests/e2e/site-url.spec.ts
- AC6 → src/tests/e2e/deploy-day-settings.spec.ts
- AC7 → src/app/routes/admin/settings.test.ts

## Notes
- Owner decision: fee Rs 200, pickup area Beau Bassin; exact address and real Juice number entered by the Owner on deploy day (PRD 12.1). Domain: launch on the free Cloudflare default (PRD 12.6). The agent never invents or sees real payment details; the Owner types them.
- Needs the Owner; may be blocked until she is available.
- Dependencies (R9): E-03 (Settings), E-10, S-235. Not yet done; expected.

## Launchprep notes (2026-11-14)
- Deploy-day checklist: production/releases/launch-checklist.md (domain/email decision first, secrets, first production deploy and migrations, every Setting with its agreed value, proving email, push, sign-in and Turnstile). Needs the Owner.
