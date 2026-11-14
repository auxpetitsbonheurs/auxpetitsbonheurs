# Deploy-day checklist (S-236, S-235) — first live launch

For the Owner, with the builder on a call if wanted. Tick each line; write what you saw when a line
says so. The agent never types real payment details: the Owner enters them.
Live address at launch: `https://auxpetitsbonheurs.<subdomain>.workers.dev` (PRD 12.6, free).

## 0. One decision before the day

- [ ] **Emails to customers need the bakery's own domain.** Resend cannot send from a `workers.dev`
      address, and its test sender only reaches the Resend account's own inbox. Choose one:
      (a) buy the domain now (the only paid item, about Rs 500-2,000 a year) and follow
      `docs/runbooks/custom-domain.md` steps 1-6 before launch; or (b) launch without customer emails
      (customers still get the confirmation and tracking pages, and WhatsApp messages from you),
      and add the domain later. Decision: ____________

## 1. Accounts and secrets (once; `docs/runbooks/deploy-keys.md` says where each value is)

- [ ] Production Supabase project exists (region Frankfurt), MFA on the account.
- [ ] Production Auth URL Configuration: Site URL and Redirect URL set to the live address (README "Supabase Auth redirect allowlist").
- [ ] GitHub → Settings → Secrets and variables → Actions: `PRODUCTION_DATABASE_URL` (Session pooler) and variable `PRODUCTION_URL`.
- [ ] Cloudflare → Workers & Pages → `auxpetitsbonheurs` → Settings → Variables and Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (core); then `RESEND_API_KEY` + `EMAIL_FROM`, `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`, `SUPABASE_AUTH_HOOK_SECRET`, `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (new values, never the staging ones).
- [ ] Backup secrets (`production/audits/backup-restore-2026.md`, Owner steps 1-8) and one green manual backup run.
- [ ] Every secret also saved in the bakery password manager; none only on a developer's computer.

## 2. First production deploy and migrations (builder runs, Owner watches)

- [ ] Staging is green on the commit to launch (GitHub → Actions → deploy → staging job green).
- [ ] `git push origin <that commit>:production` → GitHub → Actions → deploy → production job: migrations applied, Worker deployed, "Launch readiness" lists no missing core secret, `/healthz` 200.
- [ ] Owner account: Supabase (production) → Authentication → Users → Add user (Owner email, strong password, Auto Confirm) → GitHub → Actions → make-owner → Run workflow (`production`, same email).
- [ ] Open `https://<live address>/healthz`: `{"ok":true,"db":"ok","auth":"ok"}`.

## 3. Settings the Owner enters (Admin app → More → Settings, signed in as the Owner)

Placeholders that must not reach customers: Juice number `5000 0000` and the pickup address "Beau Bassin" alone.

- [ ] **Payment → Juice number**: the real number (digits only; letters show an error and nothing is saved).
- [ ] **Payment → Juice name** and **payment WhatsApp**: as on the Juice account.
- [ ] **Delivery → Pickup address**: the exact address in Beau Bassin (and a map link if wanted).
- [ ] **Delivery → Delivery fee**: Rs 200.
- [ ] **Contact**: bakery WhatsApp number, phone, email, Instagram link.
- [ ] **Orders**: quote validity 5 days; evening reminder 18:00; order prefix `APB-`.
- [ ] **WhatsApp messages**: read each template in EN and FR in the preview.
- [ ] Admin app → More → **Availability**: notice 3 days; Sunday closed; windows Morning 9-12, Afternoon 12-17, Evening 17-20.
- [ ] Save, then open as a customer: checkout shows the pickup address; a test order's tracking page shows the real Juice number and amount.
- [ ] A helper (Admin, not Owner) cannot open Settings or Availability (they are Owner only).

## 4. Proving each service on live

- [ ] Test sign-in link: Admin login → Forgot password → the email arrives (needs section 0 option a).
- [ ] Test order as a customer from a phone (pickup): confirmation number, tracking page, email if domain set.
- [ ] Owner's phone: install the admin app, allow notifications, place a second test order from another phone: the push arrives and opens the order. Approve it; mark it paid; cancel both test orders.
- [ ] Turnstile: the custom-cake form submits without a puzzle.
- [ ] Share a product link in WhatsApp: the photo and name show (S-224).
- [ ] `https://<live address>/robots.txt` and `/sitemap.xml` open and use the live address.

## 5. After launch

- [ ] Weekly 5-minute check (`docs/runbooks/free-plans.md`).
- [ ] Sunday: the backup ran (green in GitHub, file in Drive).
- [ ] Remove the staging test orders from your mind: staging is separate, nothing there reaches customers.

Blocked until done elsewhere: Sentry alerts (not built, S-235 AC5); an uptime monitor (Owner account,
optional); the Appendix A items that need the Owner's phone (`production/test-sessions/appendix-a-staging.md`).
