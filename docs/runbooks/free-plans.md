# Free plans: limits, our usage and what to do near a limit (S-233, NFR-009)

Checked 2026-11-13 by the launchprep job. Plan terms change: re-check each figure on the
vendor's pricing page before launch and once a year (the "Check" column says where). Figures
marked *vendor docs not reachable* were confirmed from search results only, because this
session could not open developers.cloudflare.com or supabase.com.

**Result: everything runs on free plans that allow commercial use; the only paid item is the
domain (and only once the Owner buys one: launch is on the free `*.workers.dev` address).**
Two items need an Owner decision before they become a problem (Worker CPU, photo egress), and
one needs a yearly habit (GitHub's 60-day rule for scheduled workflows). Nothing paid is enabled.

## The services

| Service | What it does for the bakery | Plan | Yearly cost | Commercial use |
|---|---|---|---|---|
| Cloudflare Workers | Runs the website and admin app; hourly jobs | Workers Free | Rs 0 | Allowed |
| Supabase | Database, sign-in (Auth), photo storage | Free | Rs 0 | Allowed (pauses when idle, see below) |
| Resend | Sends every email (orders, sign-in links, backup alerts) | Free | Rs 0 | Allowed |
| GitHub | Code, automatic tests, deploys, weekly backup | Free, public repository | Rs 0 | Allowed |
| Google Drive | Keeps the encrypted weekly backups | Free 15 GB (bakery Google account) | Rs 0 | Allowed |
| Web push (VAPID) | Admin notifications | No account: browser push services are free | Rs 0 | n/a |
| Cloudflare Turnstile | Bot check on public forms | Free | Rs 0 | Allowed |
| Sentry (optional) | Error alerts | Developer (free) | Rs 0 | Allowed; not wired yet (see S-235 notes) |
| Domain (later) | A custom address instead of `*.workers.dev` | Registrar of the Owner's choice | about Rs 500 to 2,000 | The only paid item |

## Limits, usage and projection

Usage is today's staging figure or an estimate; the projection assumes **50 orders a week**
(no real baseline exists yet, PRD question 9) and is easy to re-scale: every number below is
roughly proportional to orders.

| Limit (free) | Now (staging) | Projection at 50 orders/week | Alert at (80%) | Check |
|---|---|---|---|---|
| **Workers requests**: 100,000 per day (resets 00:00 UTC = 04:00 Mauritius); burst 1,000 per minute | a few hundred a day (tests) | ~2-3 Worker requests per page view (HTML + data); photos, CSS and JS are static files served free and do not count. 100,000/day ≈ 35,000 page views/day: far above a home bakery | 80,000/day | Cloudflare dashboard → Workers & Pages → the Worker → Metrics |
| **Workers CPU**: 10 ms per request | p50 24-38 ms, p99 37-155 ms on the hot paths, **0 requests stopped** (docs/architecture/cpu-measurements.md) | same per request | any "Exceeded CPU" count above 0 | Same Metrics page, "CPU time" and errors; `cpu-measure` workflow |
| **Cron triggers**: 5 per account | 2 (staging + live, each hourly) | 2 | n/a | wrangler.jsonc `triggers` |
| **Supabase database**: 500 MB | a few MB | orders, items and events ≈ 15 MB a year | 400 MB | Supabase → Project → Reports → Database |
| **Supabase file storage**: 1 GB | sample images only | product/gallery photos ≈ 0.5 MB each with their 480/960 px copies: 200 photos ≈ 100 MB; custom-request photos ≈ 1-3 MB per request: 5 a week ≈ 0.5 GB a year | 800 MB | Supabase → Storage (bucket sizes) |
| **Supabase egress**: 5 GB a month (plus cached egress) | low | **the first limit likely to bite**: photos are served from Supabase. A product page shows ~100-200 kB of photos, so 5 GB ≈ 30,000 photo-page views a month | 4 GB in a month | Supabase → Organization → Usage |
| **Supabase Auth**: 50,000 monthly active users | < 10 | admins + customers with accounts: < 500 | n/a | Supabase → Authentication |
| **Supabase pausing**: a free project pauses after 7 days without activity | never paused | `keepAlive` touches the database and Auth every hour (Worker cron) | `/healthz` not 200 | `https://<site>/healthz` → `{"ok":true,"db":"ok","auth":"ok"}` (staging returned this on 2026-11-13) |
| **Resend**: 3,000 emails a month, **100 a day**, 1 sending domain per team | test sends only | ~4 emails per order (received, confirmed/payment, ready, reminder) + sign-in links ≈ 30 a day on a busy day, 900 a month | 80 in a day / 2,400 in a month | Resend → Emails / Usage |
| **GitHub Actions**: free for public repositories on standard runners | ~15 min per push (ci) | backups ≈ 5 min a week | n/a | GitHub → Actions |
| **Google Drive**: 15 GB shared with Gmail | 0 | 8 encrypted backups kept; each ≈ database + photos ≈ 0.2-1 GB at launch, growing with photos: 8 × 1 GB = 8 GB | 12 GB | Google Drive → Storage |

### What happens at each limit, and what to do

- **Workers requests**: past 100,000 in a day, Cloudflare answers with an error page until 04:00
  Mauritius time. Action: look at the Metrics page for a bot or a loop first; a real traffic level
  that high is a business decision (Workers Paid, about USD 5 a month).
- **Workers CPU**: a request that uses too much CPU can be stopped with an error. Today none was
  stopped although the measured CPU is above 10 ms (Cloudflare allows short bursts). The Owner chose
  "accept and monitor" on 2026-11-11. Action: if the "Exceeded CPU" count is ever above 0, re-run the
  `cpu-measure` workflow and bring the result to the Owner as a decision (Workers Paid lifts it to
  30 s). Never enabled without the Owner.
- **Supabase database or storage full**: new orders or photos are refused. Action: delete old
  custom-request photos per the retention note; otherwise a decision (Supabase Pro, USD 25 a month).
- **Supabase egress**: over the quota Supabase may restrict the project. Action: check that photos
  use their 480/960 px copies (they do on the menu and product pages); if the shop grows, the decision
  is moving photos behind Cloudflare (R2 free tier, egress free) or Supabase Pro.
- **Supabase pausing**: a paused project means the site cannot read orders. `keepAlive` prevents it;
  if `/healthz` ever shows `db` or `auth` not ok, open the Supabase dashboard and press "Restore".
- **Resend 100 a day**: from 90 emails sent in a day, non-critical emails (thank-you notes, admin
  alert copies of a push) wait for the next day; order, request, quote, cancellation and account
  emails still go (`src/app/server/email/daily-cap.ts`, FR-074). An email Resend refuses stays in
  the outbox as "not sent" and is retried or resent by an admin. No order is lost: the order is
  saved before any email.
- **GitHub 60-day rule**: in a public repository GitHub **turns off scheduled workflows after 60
  days without any commit**. The weekly backup is a scheduled workflow, so after handover, if nobody
  commits for two months, backups stop silently (GitHub sends one email first). Action: once a month,
  open GitHub → Actions → backup and check the last run is green; if GitHub disabled it, press "Enable
  workflow". The builder's 3-month aftercare covers this at first.

## Weekly 5-minute check (AC3, until automatic alerts exist)

No vendor here can email at 80% on the free plan, except Supabase's own usage emails. Every Monday:

1. Open `https://<site>/healthz`: it must say `"ok":true`.
2. GitHub → Actions → backup: the last Sunday run is green (a failed run also emails the bakery).
3. Supabase → Organization → Usage: database, storage and egress under 80%.
4. Resend → Usage: under 2,400 this month.
5. Cloudflare → Workers → the live Worker → Metrics: no "Exceeded CPU", requests well under 80,000 a day.

Anything over its alert threshold goes to the builder (during aftercare) with a screenshot; any fix that
costs money is the Owner's decision.

## Open items

- Re-check every figure on the vendors' own pricing pages before launch (this session could not open
  them). Sources used: Cloudflare Workers limits and pricing docs, Supabase pricing summaries, the Resend
  "new free tier" post, GitHub's "About GitHub's plans".
- Sentry: the key exists (`SENTRY_DSN`) but the Worker does not send errors yet; until it does, errors
  are only in Cloudflare Workers Logs (S-235 AC5).
- Resend: one sending domain per free team. Staging and live must not share the bakery domain's
  quota: keep staging on Resend's test sender (`onboarding@resend.dev`) or a second free team.
