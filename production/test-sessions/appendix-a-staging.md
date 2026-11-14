# Appendix A launch test checklist on staging (S-237) — 2026-11-13/14

PRD Appendix A, row by row. "Automated" = the e2e or integration tests that prove the row on every
CI run (local build, real Postgres, fixed clock). "Staging" = what this job ran on the staging site
(`https://auxpetitsbonheurs-staging.kshana-auxpetitsbonheurs.workers.dev`, build 3693222 of
2026-11-13 15:13) with test data only. "Owner" = needs an admin sign-in on staging, the Owner's
phone or a real device. Test orders are named "Launch test … — ignore" or "CPU test — ignore",
with example.com emails and the placeholder phone 5000 0000.

| # | Check (FRs) | Automated | Staging | Owner / phone | State |
|---|---|---|---|---|---|
| 1 | Order with delivery, and with pickup (FR-018, 019, 024, 025) | `skeleton-order.spec.ts`, `checkout.spec.ts` | **Pass**: APB-0226 delivery, Red Velvet Rs 2,100 + delivery Rs 200 = **Rs 2,300**; APB-0227 pickup **Rs 2,100**; both confirmation → tracking ("Awaiting payment", Juice instructions, pay-by deadline); plus 50 ten-line pickup orders from `cpu-measure` | Repeat once on the Owner's phone on live | Pass |
| 2 | Date blocked after checkout opened is refused (FR-015, 059) | `checkout-dates.spec.ts` "a day blocked after the page opened is refused calmly"; `place-order.server.test.ts` (DATE_UNAVAILABLE) | Not run: blocking a day needs the Owner account | Owner: Availability → block tomorrow+3 while a basket tab is open, then submit | Pass (automated) |
| 3 | Longer notice moves the earliest date (FR-013) | `checkout-dates.spec.ts` AC1-AC3 (notice 5 → earliest Wed 25 Nov) | Not run: needs a product with its own notice (admin) | Owner: Menu → a cake → Notice days 5 → check product page and checkout | Pass (automated) |
| 4 | Promotion shows, is charged, disappears after end (FR-016, 017, 063) | `admin-promotions.spec.ts`, `promo-banner.spec.ts` (struck price on product, menu, basket); `promotions` and pricing unit tests (ends on its exact instant, S-082) | Not run: no promotion on staging, needs admin | Owner: Promotions → New → 10% on one cake, ending in 10 minutes → order it → wait → price back | Pass (automated) |
| 5 | Custom request, quote, accept; expired quote cannot be accepted (FR-028..032) | `admin-request.spec.ts` (request → quote → accept → Juice), `custom-request.server.test.ts`, `expire-quotes.test.ts` | Not run: quoting needs admin | Owner: send a quote with 0 days left via the admin, try to accept | Pass (automated) |
| 6 | Customer cancels while pending; no cancel after approval (FR-027) | `tracking.spec.ts`, `tracking.cancel.test.ts` | **Pass**: APB-0228 cancelled from tracking ("Cancel order" → dialog "Cancel order APB-0228") → "Cancelled", kept after reload, no console error | After approval: Owner approves a test order, customer checks the button is gone | Pass (pending part); approved part automated |
| 7 | Pending approval over 24 h sends one admin push (FR-075) | `app/jobs/pending-alerts.test.ts` (exactly once) | Not observable without a subscribed phone | Owner's installed admin app: leave a test order 24 h; one push | Automated pass; real push pending |
| 8 | Manual order shows in calendar and prep list (FR-055, 058, 060) | Manual-order entry is E-06 work in progress (no manual-order screen on main yet); calendar and prep list are covered for website orders (`admin-today.spec.ts`, `evening-reminder.test.ts`) | Not run | After E-06 lands | **Open** (E-06) |
| 9 | Owner-only screens hidden and blocked for an Admin (FR-041, 066, 067); deactivated admin signed out (FR-043) | `admin-access.spec.ts`, `admin-shell.spec.ts`, `admin-settings.spec.ts`, `admin-availability.spec.ts`, `admin-team.spec.ts`, `admin-sign-in.spec.ts` | Not run (needs two admin accounts) | Owner: invite a helper, check Settings is absent and `/admin/settings` refused; deactivate her; her next tap signs her out | Pass (automated) |
| 10 | All emails EN and FR, all WhatsApp templates (FR-070, 071, 073) | Email template unit tests (E-10), `admin-settings-whatsapp.spec.ts`, `admin-order-whatsapp.spec.ts` | Staging sends only to the Resend account's inbox (test sender) | Owner: with the bakery domain set, place EN and FR test orders and read each email; open each WhatsApp template preview | Automated pass; reading by a person pending |
| 11 | Sales summary totals match the orders (FR-068) | `admin-sales.spec.ts`, sales service tests, `admin-sales.perf.spec.ts` | Not run (needs admin) | Owner: compare Sales "This week" with the orders list | Pass (automated) |
| 12 | Backup runs and can be restored (NFR-005) | `backup-workflow.test.ts`; restore script tests | **Pass**: staging backup restored into a clean Postgres 17, every count matched (`production/audits/backup-restore-2026.md`) | Production backup secrets; first Sunday run; restore into a new Supabase project | Pass on staging data; live pending |
| 13 | Failed checks logged and routed; final pass recorded | — | One false alarm logged and cleared: the first cancel attempt used the wrong confirm-button name (script error, not a site defect) | — | Done for this run |

## Findings routed

| ID | Severity | Finding | Owner |
|---|---|---|---|
| APP-A-01 | S2 for launch | Row 8: no manual-order entry on main yet | E-06 |
| APP-A-02 | S3 | Staging lagged main by about 30 commits because CI on main kept being cancelled; fixed (`pipeline-2026.md` PIPE-01). Re-run rows 1 and 6 on staging once the next green build deploys | release-manager |

## Next run (with the Owner, about 45 minutes)

Sign in to the staging admin as the Owner and do the "Owner / phone" column top to bottom, then
on the live site on deploy day repeat rows 1 and 6 from the Owner's own phone
(`production/releases/launch-checklist.md` section 4).
