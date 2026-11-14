# Owner steps: what's still needed from the Owner and the client (updated 2026-11-14)

Staging: https://auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev
Done: domain auxpetitsbonheursmu.com, sales@ forwarding, Resend verified, email keys on staging.

## A. Now, on staging
1. Sign-up and password emails (Supabase hook):
   1. Supabase (staging) → Authentication → Hooks → Send Email hook → Add hook → type HTTPS.
   2. URL: `https://auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev/hooks/supabase/send-email`
   3. Click Generate secret, copy it, and leave the hook disabled.
   4. Cloudflare → Workers & Pages → staging Worker → Settings → Variables and Secrets → Add: `SUPABASE_AUTH_HOOK_SECRET` (Secret) → Deploy.
   5. Back in Supabase: set the hook to Enabled → Save.
2. Supabase (staging) → Authentication → URL Configuration → Redirect URLs → add `https://auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev/auth/confirm**`
3. Supabase (staging) → Authentication → Sign In / Providers → Email: keep "Confirm email" on.
4. Supabase (staging) → Storage → `request-photos` → Edit bucket: "Public bucket" off.
5. Admin → More → For Owners → Settings (if "For Owners" is missing: GitHub → Actions → make-owner → staging + your email):
   - Payment: Juice name, Juice number, payment WhatsApp.
   - Invoice: legal name, BRN, address, phone, bank name, account name, account number. Check the terms; next number stays 1108.
   - Contact: phone, email, Instagram link, Facebook page link.
   - Homepage: Homepage photo.
   - Privacy note: add a line about reviews.
   - WhatsApp messages: read each template (EN and FR), including "Payment details".
   - Save settings.
6. Phone alerts: GitHub → Actions → vapid-keys → Run workflow → staging + bakery email. Then on each admin phone: admin app → My profile → Enable push → Send test push.
7. Spam check: Cloudflare → Turnstile → Add widget → hostnames `auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev` and `auxpetitsbonheursmu.com`, mode Managed. Then in the staging Worker → Variables and Secrets add `TURNSTILE_SITE_KEY` (text) and `TURNSTILE_SECRET_KEY` (secret).
8. Phone test, on a real phone: place an order → approve in admin → pay guide and email → Payment received → download the invoice. Then: a custom cake request → quote → accept; a workshop → register → accept; a review → approve; sign up for an account.

## B. Backups (before launch; the weekly run fails and emails you until this is done)
1. Google Drive (bakery account) → New → Folder "Website backups" → copy the ID after `folders/`.
2. With the builder: generate the backup key (`age-keygen`) and save the private key in the password manager as "Backup age key".
3. Supabase (production) → Connect → Session pooler → copy the URI.
4. Supabase (production) → Storage → S3 Connection → New access key → copy the endpoint, region, key id and secret.
5. With the builder: `rclone authorize "drive"`, signed in as the bakery Google account.
6. Resend → API Keys → Create → name `apb-backup`, sending access.
7. GitHub → Settings → Secrets and variables → Actions → add each value (names in `production/audits/backup-restore-2026.md`).
8. GitHub → Actions → backup → Run workflow → check the file appears in Drive.

## C. Account security (5 minutes each)
1. Cloudflare → My Profile → Authentication → Two-factor authentication.
2. Supabase → avatar → Account preferences → Security → Multi-factor authentication.
3. GitHub → Settings → Password and authentication → Enable two-factor authentication.
4. Google (bakery account) → Security → 2-Step Verification.
5. Resend → Settings → Account → Two-factor authentication.
6. Save every recovery code in the password manager.
7. Supabase (production) → Project Settings → Data API → Exposed schemas → remove `public` → Save.

## D. Answers needed from the client
1. Retention: keep orders 5 years then anonymise; custom-cake photos 90 days after the request closes; email contents 90 days; backups 8 weeks. OK?
2. Is registration with the Mauritius Data Protection Office needed (Data Protection Act 2017)?
3. Two-step sign-in for the Owner's admin account: yes or no?
4. Accept in writing: a forwarded order email opens that order's page; up to one week of data could be lost (weekly backup); page styles allowed inline (low risk).
5. Real menu: prices, descriptions, photos (Admin → Menu), and the first real workshop (Admin → More → Workshops).

## E. Launch day (with the builder)
Follow `production/releases/launch-checklist.md` sections 1–4:
- production keys (Supabase, Resend `apb-production`, VAPID, Turnstile, hook secret)
- connect auxpetitsbonheursmu.com to the live site
- first production deploy (builder runs it, you watch)
- Owner account and real Settings
- live tests on your phone
