# Aux petits bonheurs: your website at a glance

*One page for the Owner. Keep it with the password manager. No password is written here.*

**Your website:** `https://auxpetitsbonheurs.<subdomain>.workers.dev` (your own domain can be added later, see "Later").
**Your admin app:** the same address followed by `/admin`. Install it on your phone: open it in Safari (iPhone) or Chrome (Android) → Share or menu → "Add to Home Screen".
**Everything belongs to Aux petits bonheurs:** the code, the design, the texts and photos, and every account below.

## Your accounts

| Service | What it does for you | Where to sign in | Account email | Cost per year |
|---|---|---|---|---|
| Cloudflare | Runs the website and the admin app | dash.cloudflare.com | the bakery email | Rs 0 |
| Supabase | Keeps orders, customers, the menu and photos; handles sign-in | supabase.com/dashboard | the bakery email | Rs 0 |
| Resend | Sends the emails (orders, sign-in links) | resend.com | the bakery email | Rs 0 |
| GitHub | Keeps the code, tests and publishes each change, runs the weekly backup | github.com | the bakery email | Rs 0 |
| Google Drive | Stores the weekly backups (encrypted) | drive.google.com | the bakery Google account | Rs 0 |
| Cloudflare Turnstile | Stops robots on the custom-cake form | inside Cloudflare | the bakery email | Rs 0 |
| Sentry (optional) | Emails when the site has an error | sentry.io | the bakery email | Rs 0 |
| Your domain (later) | A short address like `auxpetitsbonheurs.mu` | your registrar | the bakery email | about Rs 500-2,000: **the only paid item** |

Every account uses two-step sign-in (an authenticator app or a passkey). Recovery codes and the backup key live in the password manager only.

## What each admin screen does

| Screen | Use it to |
|---|---|
| Today | See what to prepare and deliver today; approve new orders |
| Orders | Find any order, change its status, mark it paid, cancel or refund |
| Calendar | See orders per day and the prep list |
| Menu | Add or change a product, its photos, sizes and options; hide it or mark it sold out |
| Promotions | Put products on sale for a period |
| Pages and Gallery | Change the texts and photos of the website pages |
| Customers, Sales | See your customers and your sales totals |
| Availability *(Owner only)* | Block a day, change the notice period and closed days |
| Settings *(Owner only)* | Delivery fee, pickup address, Juice number, WhatsApp number, time windows |
| Team *(Owner only)* | Invite a helper by email, or switch a helper off |

**Add a product:** Menu → New → name in English and French, price, photo → Save. **Invite a helper:** Team → Invite → her email → she gets an email with a link. **Block a day:** Availability → tap the day → Block.

## Safety nets

- **Backup:** every Sunday at 02:00 a copy of all orders and photos goes to Google Drive (the last 8 weeks are kept). If it fails you get an email. The copy has been restored and checked on test data.
- **Check once a week (5 minutes):** open `<your website>/healthz` (it must say `"ok":true`), and look at GitHub → Actions → backup (last Sunday is green). Details: `docs/runbooks/free-plans.md`.
- **Free limits:** up to 100 emails a day and 3,000 a month; 1 GB of photos; 100,000 page requests a day. Far above what a home bakery needs; if one gets close, it is your decision, nothing paid is switched on by itself.

## Who to call

- **Builder (3 months of aftercare from launch):** stays a member of the accounts above until then. You can remove the builder at any time: Cloudflare → Manage account → Members; Supabase → Organization → Team; GitHub → Settings → Collaborators.
- **If the site is down:** check `<your website>/healthz`, then message the builder. Orders already placed are safe in the database and the weekly backup.

## Later

- **Your own domain:** about 30 minutes of settings, no code change (`docs/runbooks/custom-domain.md`). Needed before customer emails can come from your own address.
- **Restore a backup:** step by step in `docs/runbooks/restore.md` (with the builder).
