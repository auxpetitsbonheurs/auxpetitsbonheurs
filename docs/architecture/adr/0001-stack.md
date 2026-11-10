# ADR-0001: Technology stack

Status: accepted
Date: 2026-11-10 · Deciders: technical-director (automation mode `auto`, user instructed "decide, do not ask"); for owner review

## Context
From `docs/product/build-brief.md` (Ground rules, Quality requirements, Notifications, Handover) and `docs/product/prd.md` (NFR-001..013, section 9, R1/R3):
- **Cost:** every service on a free plan that allows commercial use. Only the domain is paid (NFR-009). This rules out Vercel Hobby, which is non-commercial only.
- **Ownership:** every account is created under the bakery's email. Widely known, documented tools so another developer can take over (NFR-012). Staging and live environments, with automatic deploys.
- **Data:** relational (orders, events, sequential order numbers, optimistic concurrency, NFR-013). About 1 GB of photos, compressed to 250 kB or less (project.yaml beats the brief's 300 kB, R9).
- **Auth:** admins get Owner/Admin roles, invitations (7-day link), 30-day sessions, and are signed out when deactivated. Customers sign in with a password or an email link.
- **Messaging:** about 100 transactional emails a day, EN/FR, retried on failure. Web push to an installable admin PWA on iPhone (16.4+, home-screen install) and Android. No SMS, no WhatsApp API.
- **Scheduled jobs:** quote expiry, the 18:00 Mauritius reminder, the 24 h pending alert, promotion start/end, email retries, a keep-alive for free tiers that pause, and weekly backups to storage the bakery owns.
- **Locale:** EN/FR, Indian/Mauritius (UTC+4), "Rs 1,250".
- **Budgets:** Lighthouse perf 90 or more, LCP 2.5 s or less, 170 kB or less of initial JS.
- **Team:** solo developer. The working prototype (`prototypes/apb-v1`) is React + TS + Tailwind.

## Options considered
### Option A: React Router v7+ (framework mode) on Cloudflare Workers + Supabase + Resend (chosen)
- Pros: Cloudflare's free plan allows commercial use and never sleeps, gives 100k requests a day, and includes cron triggers. Workers Builds gives git deploys, and staging/production are wrangler environments. React Router is the official successor to Remix and SSR-first, has a small bundle (fits the 3 MiB free Worker limit) and lets prototype components transfer. Supabase's free plan gives Postgres (500 MB), Auth (password, magic link, invite, reset), Storage (1 GB) and 2 projects (staging and live). Resend's free plan gives 3,000 emails a month and 100 a day, commercial use included.
- Cons: the Workers free plan allows 10 ms of CPU per request. So password hashing stays in Supabase Auth, images are compressed in the browser, and heavy work goes to cron. Supabase free projects pause after 7 days without activity, which needs a keep-alive. The stack spans 3 vendors.
- Cost at expected scale (under 1k orders a month): Rs 0 a month, plus the domain.

### Option B: Next.js + Supabase + Resend on Netlify Free (alternative)
- Pros: Next.js is the most widely known framework, and Netlify supports it fully. Scheduled functions are built in.
- Cons: Netlify's credit-based Free plan gives 300 credits a month, and each production deploy costs 15, so there are about 20 deploys a month before traffic. When credits run out the site is **paused** until the next cycle, which breaks "an order is never lost". Next.js is too big for the free Cloudflare Worker (3 MiB), and Vercel Hobby is non-commercial.
- Cost: Rs 0, but there is a hard cap on deploys and traffic.

### Rejected quickly
- Render or Fly free web services: they sleep, or they need a card or paid plan.
- Firebase: App Hosting and Functions need the paid Blaze plan.
- Better Auth on Workers: scrypt hashing exceeds the 10 ms CPU limit unless replaced. Supabase Auth avoids this and adds invites and magic links for free.

## Decision
We will build **one deployable app**: React Router (framework mode, SSR) on **Cloudflare Workers** (free), with **Supabase** (Postgres + Auth + Storage, free, one project per environment), **Drizzle ORM**, **Tailwind + shadcn/ui**, **Resend** for email, the standard **Web Push/VAPID** protocol for admin alerts, **Sentry** (free Developer plan) plus Workers Logs for observability, and **Vitest** + **Playwright** for tests. It meets every free-commercial constraint without a sleeping server, and it keeps the prototype's React/TS/Tailwind skills.

| Layer | Choice | Why |
|---|---|---|
| Language / PM | TypeScript strict, npm | Most widely known; npm needs no extra tooling at handover |
| Frontend + server | React Router (`stack.frontend: remix`), loaders/actions | SSR-first, small JS, React like the prototype |
| Hosting | Cloudflare Workers (staging + production envs), Workers Builds for auto-deploy | Free plan allows commercial use and has no cold sleep |
| Database | Supabase Postgres via Drizzle (transaction pooler) | Relational, typed schema and migrations, portable plain Postgres |
| Auth | Supabase Auth (password, magic link, invite); roles in our own `admin` table, checked server-side on every action | Free, hashing runs off-Worker; the Send Email hook renders EN/FR auth emails via Resend |
| Files | Supabase Storage (1 GB); browser-side resize/compress (HEIC to JPEG/WebP) before upload | Fits 1 GB; Worker CPU stays low; image transforms are paid, so we pre-size |
| Email | Resend + React Email templates (EN/FR); outbox table and retry by cron | 100 emails a day free, commercial use allowed |
| Push | Web Push (VAPID), Workers-compatible library chosen by `lead-backend` | Free, standard, works on an installed iOS/Android PWA |
| Cron | One hourly Cloudflare Cron Trigger per env; dispatch by Mauritius time | Free; also serves as the Supabase keep-alive (DB query every hour) |
| Backups | Weekly GitHub Actions workflow in the bakery's private repo: `pg_dump` + Storage copy to the bakery's Google Drive (rclone) | Free (2,000 min a month), the bakery owns it, restore is documented |
| Bot protection | Cloudflare Turnstile | Free, no puzzles |
| i18n | i18next / react-i18next, en + fr, FR falls back to EN | Widely known |
| Analytics | none by default; Cloudflare Web Analytics (cookieless, free) optional | No consent banner needed |
| Tests | Vitest (unit), Playwright (e2e) | Matrix defaults |

## Consequences
- Positive: Rs 0 running cost; one repo, one Worker per environment; plain Postgres and standard Web Push make the vendors swappable.
- Negative / accepted trade-offs:
  - The 10 ms CPU per request limit on the Workers free plan: keep SSR lean and move heavy work (image processing, bulk email) off the request path. Upgrade path: Workers Paid at $5 a month.
  - Supabase free has no time-boxed sessions. We enforce the 30-day admin session and the sign-out of deactivated admins in app code (session age plus `admin.active` checked every request).
  - Resend's 100 emails a day matches the brief exactly with no headroom. An outbox and retry absorb spikes. Brevo (300 a day free) is the fallback provider.
  - Resend needs the bakery's domain verified before it can email customers. Before the domain exists, it can only send to the account owner's address.
  - GitHub cron can run late by minutes. That is fine for weekly backups, and time-critical jobs use Cloudflare cron.
  - iOS push only works once the admin app is installed to the home screen (R3). The email alert remains the fallback.
- Exit plan: Workers to Netlify/Node (the React Router adapter swap); Supabase DB to any Postgres (Drizzle + `pg_dump`); Supabase Auth to Better Auth (needs a password-reset campaign, which is the costliest exit); Resend to Brevo/Postmark (swap the SMTP/API client).
- Follow-ups: `/create-architecture` (auth model, cron dispatch, outbox, backup/restore runbook); a `/tech-spike` on Web Push from a Worker to iOS; a spike on the Supabase Send Email hook with EN/FR templates; privacy regime `mu` (DPA 2017) to confirm with the owner (PRD Q12).

## Revisit when
Free limits are hit two months running (100k requests a day, 500 MB DB, 1 GB storage, 100 emails a day); Worker CPU errors appear in logs; or the owner accepts a monthly budget.
