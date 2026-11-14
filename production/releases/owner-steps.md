# Owner steps — everything still needed from the Owner and the client (2026-11-14)

All MVP features are built and live on staging:
https://auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev

## A. Now, on staging (so you can test everything)
1. Admin → More → Settings → Payment: Juice account name, Juice number, WhatsApp for payment proof → Save settings.
2. Settings → Privacy note: add a line about reviews (first name and stars shown, approved first, deleted on request) → Save.
3. Supabase (staging) → Authentication → Sign In / Providers → Email: keep "Confirm email" on.
4. Supabase (staging) → Authentication → URL Configuration → Redirect URLs → Add: `https://auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev/auth/confirm**`
5. Supabase (staging) → Storage → `request-photos` → Edit bucket: "Public bucket" must be off.
6. Phone alerts: GitHub → Actions → vapid-keys → Run workflow → staging, bakery email → Run.
7. On each admin phone: open the installed admin app → My profile → Enable push on this device → Send test push.
8. Spam check keys: Cloudflare → Turnstile → Add widget → domain `auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev`, mode Managed → copy both keys.
9. Cloudflare → Workers & Pages → the staging Worker → Settings → Variables and Secrets → add `TURNSTILE_SITE_KEY` (text) and `TURNSTILE_SECRET_KEY` (secret).
10. Phone test: follow `production/test-sessions/` and the Appendix A run sheet (order → Juice instructions → admin Payment received → tracking; custom cake request → quote → accept; review → approve).

## B. Backups (before launch)
Tonight's first scheduled backup will fail on purpose and email you: its secrets are not set yet.
1. Google Drive (bakery account) → New → Folder "Website backups" → copy the ID after `folders/`.
2. With the builder: generate the backup key (`age-keygen`); save the private key in the password manager as "Backup age key".
3. Supabase (production) → Connect → Session pooler → copy the URI.
4. Supabase (production) → Storage → S3 Connection → New access key → copy endpoint, region, key id, secret.
5. With the builder: `rclone authorize "drive"`, signed in as the bakery Google account.
6. Resend → API Keys → Create (sending only) — after the domain exists.
7. GitHub → Settings → Secrets and variables → Actions → add each value (names in `production/audits/backup-restore-2026.md`).
8. GitHub → Actions → backup → Run workflow → check the file appears in Drive.
9. Once a month: GitHub → Actions → backup → still enabled and green (GitHub turns schedules off after 60 days without a commit).

## C. Account security (5 minutes each)
1. Cloudflare → My Profile → Authentication → Two-factor authentication → Set up.
2. Supabase → avatar → Account preferences → Security → Multi-factor authentication → Add.
3. GitHub → Settings → Password and authentication → Enable two-factor authentication.
4. Google (bakery account) → Security → 2-Step Verification → Turn on.
5. Resend (once created) → Settings → Account → Two-factor authentication → Enable.
6. Save every recovery code in the bakery password manager.
7. Supabase (production) → Project Settings → Data API → Exposed schemas → remove `public` → Save.

## D. Answers needed from the client
1. Domain before launch (customers get emails) or launch without emails first?
2. Legal business name, exactly as registered.
3. Address to show on the privacy note (a postal address is fine).
4. BRN (Business Registration Number), if any.
5. Keep orders 5 years then anonymise; delete custom-cake photos 90 days after a request closes; email contents 90 days; backups 8 weeks — OK?
6. Is registration with the Mauritius Data Protection Office needed? (Data Protection Act 2017)
7. Two-step sign-in for the Owner's admin account: yes or no?
8. Accept in writing: a forwarded order email opens that order's page; up to one week of data could be lost (weekly backup); page styles allowed inline (low risk).
9. Workshops: how booking should work (dates, seats, price, payment).
10. Real menu: cake prices, descriptions, photos (Admin → Menu).

## E. Domain and email (when bought)
1. Cloudflare → Domain Registration → Register Domains → `auxpetitsbonheurs.online` (about US$28/yr).
2. Cloudflare → the domain → Email → Email Routing → Get started → `sales@` → forward to the bakery Gmail.
3. resend.com → sign up (free) → Domains → Add Domain → `mail.auxpetitsbonheurs.online`.
4. Cloudflare → the domain → DNS → add each record Resend lists (SPF, DKIM, MX), plus TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:sales@auxpetitsbonheurs.online`.
5. Resend → Domains → Verify DNS Records → wait for "Verified".
6. Resend → API Keys → Create → sending access, that domain → copy (shown once).
7. Tell the builder: we add `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` to Cloudflare, connect the domain to the site, set the Supabase email hook and redirect URLs (`docs/runbooks/deploy-keys.md` §3b, `docs/runbooks/custom-domain.md`).

## F. Launch day
Follow `production/releases/launch-checklist.md` sections 1–4: production secrets, first production deploy (builder runs, you watch), Owner account, real Settings (Juice number, pickup address, fees, contact), then live tests on your phone.
