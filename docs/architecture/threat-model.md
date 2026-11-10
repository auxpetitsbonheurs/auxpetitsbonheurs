# Threat model — Aux petits bonheurs

Reviewer: security-lead · Date: 2026-11-10 · Commit: 8228fa5 (docs only, no code yet) · Verdict: **CONCERNS** (design is sound; the 4 high-severity gaps G-01..G-04 were specified on 2026-11-10; the medium-severity gaps remain for Build before `SEC-REVIEW`)
Method: STRIDE per component (S spoofing, T tampering, R repudiation, I information disclosure, D denial of service, E elevation of privilege).
Sources: `architecture.md` (Auth, Security, Cross-cutting, Integrations), `data-model.md` (Access control, Retention), `api/contracts.md`, `adr/0001-stack.md`, `docs/specs/features/*.md` (Permissions, Security/Privacy notes), PRD NFR-003/004/005/012/013.
Scale context: single bakery, under 1k orders a month, 1 to 5 admins. The likely attackers are opportunistic bots and spammers, curious customers and people holding forwarded emails, not targeted adversaries. The highest-value assets are customer PII (name, phone, email, address, photos), the Owner account and the vendor accounts.

**Scale.** L = likelihood, I = impact (H/M/L). **Status:** `specified` = a doc or FR defines the mitigation; `partial` = part of it is defined; `gap` = not defined yet (see Gaps).

## Summary
| Severity of open gaps | Count |
|---|---|
| High | 0 open (G-01..G-04 specified 2026-11-10) |
| Medium | 12 |
| Low | 8 |
Threats modelled: **82** · specified: 47 · partial: 18 · gap: 17. Gap items: **24** (G-01..G-24; G-01..G-04 specified).

## A. Admin authentication and roles (Supabase Auth, `requireAdmin`)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| A1 | E | Admin calls an Owner route or action (Availability, Settings, Team) by URL or a crafted POST | M | H | `requireAdmin({role:'owner'})` in every loader and action, never only in the layout; 403; a test for each Owner route | arch Auth; FR-041; admin-access-team Permissions | specified |
| A2 | E | Customer session reaches `/admin` data | M | H | Redirect to `/admin/login`, no admin data returned; `admin` row required | FR-039; contracts Auth column | specified |
| A3 | S | Stolen or old admin session used after 30 days | L | H | Session age taken from the JWT `amr` timestamp and checked on every request; sign-out after 30 days; fixed-clock tests | FR-040; arch Auth; risk T6 | specified |
| A4 | E | Deactivated admin keeps access | M | H | `admin.active` checked on every request, the auth user is banned (refresh stops), push subscriptions are deleted | FR-043; arch Auth | specified |
| A5 | S | Credential stuffing or brute force on `/admin/login` | M | H | RL-auth 5/15 min per email+IP, Supabase limits, generic errors. No MFA, and no leaked-password check on the free plan | contracts admin/login | partial (G-10) |
| A6 | S | Invite token guessed or replayed | L | H | 32 random bytes stored as a SHA-256 hash, 7-day expiry, single use (`accepted_at`), a resend revokes the old token | FR-042; data-model admin_invitation | specified |
| A7 | E | The last Owner is demoted or deactivated (lock-out) | L | H | Check under `SELECT … FOR UPDATE` | FR-044 | specified |
| A8 | S | An admin email gets a session through the customer magic-link flow, which skips the password and lands in `/admin` | L | M | Not defined whether `requireAdmin` accepts `amr=otp` sessions | — | gap (G-16) |
| A9 | R | An admin denies an order action | L | M | `order_event` stores the actor on every change; names kept after deactivation | FR-045; NFR-013 | specified |
| A10 | S | Open redirect through `?next=` on `/admin/login`, `/account/sign-in` and `/auth/confirm`, used for phishing after a real sign-in | M | M | No rule that `next` must be a same-origin relative path | contracts sign-in, auth/confirm | gap (G-05) |
| A11 | T | Email link scanners (Outlook Safe Links, Gmail) prefetch `/auth/confirm` or the invite link with GET and use up the one-time token | M | M | No rule that a GET must not consume an OTP or invite | contracts auth/confirm, admin/invite | gap (G-06) |

## B. Customer accounts and guest-order linking
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| B1 | I | Someone places a guest order with another person's email, then uses "Save my details" to read that person's history | M | H | `saveDetails` creates an unconfirmed user only; linking happens only in `auth/confirm type=signup` for the confirmed email | FR-038; contracts save-details, auth/confirm; arch Auth | specified |
| B2 | S/E | **Pre-account takeover.** An attacker signs up (or uses `saveDetails` with a forwarded tracking link) with the victim's email and the attacker's own password. The victim clicks the genuine confirmation email, the account is confirmed and linked, and the attacker signs in with the password they chose | M | H | Not covered: the password is chosen before email ownership is proven | [contracts](api/contracts.md) sign-up, save-details, auth/confirm (v0.3); [customer-accounts](../specs/features/customer-accounts.md) AC6b; [UX](../design/ux/customer-account.md) | specified (G-01) |
| B3 | I | Checkout matches a guest to an existing customer by phone, and the "upsert" overwrites `customer.email`. The attacker's email then becomes the key that `auth/confirm` links on, which exposes the victim's orders | M | H | Upsert rules for contact fields are not defined | [contracts](api/contracts.md) "Customer matching", account/orders; [data-model](data-model.md#customer); [checkout](../specs/features/checkout-and-tracking.md) step 7; [manual orders](../specs/features/admin-manual-orders.md) AC16; [customer-accounts](../specs/features/customer-accounts.md) AC6c | specified (G-02) |
| B4 | I | Account enumeration through sign-up, reset or magic-link responses or timing | M | L | Generic responses, `shouldCreateUser:false`, same response timing on `EMAIL_IN_USE` | contracts account/* | specified |
| B5 | E | A customer reads another customer's address or order through `id` parameters | M | H | Ownership scoping, `NOT_FOUND` for another customer's id, "own orders only" | contracts account/addresses, orders | specified |
| B6 | S | Brute force or spam on sign-up, reset and links | M | M | Turnstile, RL-auth and RL-signup. Limits are per email+IP, so an attacker who rotates IPs can still flood one inbox | arch Cross-cutting | partial (G-08) |

## C. Tracking tokens (`/t/:token`, `/order/:token/confirmed`, `/account/save-details?t=`)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| C1 | S | Guessing or enumerating tokens | L | H | 256-bit random token, format check `^[A-Za-z0-9_-]{43}$` before any DB read, same 404 for wrong and unknown tokens, RL-track 60/10 min/IP, unique-index lookup | FR-024/026; data-model orders; contracts tracking | specified |
| C2 | I | Token derived from the order number | L | H | Independent random value; AC17 | FR-024 | specified |
| C3 | I | Token leaks through the Referer header to third parties (Maps, WhatsApp, Turnstile) | M | M | `no-referrer` is specified for `/t/:token` only. The confirmation page and `save-details?t=` also carry the token | arch Rendering/Security | partial (G-07) |
| C4 | I | Token leaks into Workers Logs, Sentry or the optional Cloudflare Web Analytics beacon | M | M | `/t/` and `/order/` paths are redacted. `?t=`, `token_hash`, `/admin/invite/:token` and the analytics beacon are not covered | checkout-and-tracking Security | partial (G-07) |
| C5 | I/T | A forwarded email gives the recipient the order page and the cancel, accept and decline actions | M | L | Accepted by design and stated in the privacy note; actions are status-gated and versioned | notifications Edge cases; FR-027 | specified (accepted risk, owner to confirm) |
| C6 | I | Tokens are stored in plaintext, so a DB or backup leak exposes every tracking link | L | M | Backups are encrypted with `age`; the DB is reached only with server credentials. Storing a hash would break `trackingUrls` for accounts and admins | data-model orders | specified (accepted, see Accepted risks) |
| C7 | E | Search engines index token pages | L | M | `noindex`, `no-store` | arch Rendering | specified |

## D. Public forms: checkout, custom request (abuse, tampering, concurrency)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| D1 | T | Client changes prices, delivery fee, promotion or total | H | H | Server re-prices with `domain/pricing.ts`; client total used only to detect `PRICE_CHANGED`; the basket cookie holds no prices | FR-011; arch Data; contracts | specified |
| D2 | T | Ordering a blocked, too-soon or sold-out date or a hidden product | H | M | `assertOrderable` on the server in Mauritius time; `DATE_UNAVAILABLE` | FR-013..017; pricing spec | specified |
| D3 | T | Out-of-range input (negative quantity, 11+ lines, huge text, bad option ids) | H | M | zod on every action, caps (10 lines, message length, details ≤ 2000), option ids validated against the product | contracts Primitives | specified |
| D4 | T | Illegal status transition (cancel after approval, accepting an expired quote) | M | M | Transition table enforced on the server; `CANCEL_NOT_ALLOWED` and `QUOTE_EXPIRED` checked before `version` | FR-027/031; PRD App. B; AC16 | specified |
| D5 | T | Lost update between two admins, or between an admin and a customer | M | M | Optimistic `version`; `409 ORDER_CHANGED`; notes last-write-wins (accepted) | FR-054; data-model | specified |
| D6 | T | Double submit or replay creates duplicate orders or emails | H | L | `idempotencyKey` unique in the DB; a replay returns the original redirect. Not stated: the key must come from `crypto.randomUUID()`, because a replay returns the original tracking token | FR-023; contracts | mitigated (G-21 done 2026-11-10: server `randomUUID()` per render, replay bound to the order's email) |
| D7 | D | Bot spam orders or requests | M | M | Turnstile + RL-order 5/10 min/IP, RL-request 3/10 min/IP | NFR-003; arch Integrations | specified |
| D8 | S | Rate limits keyed on a spoofable IP header (`X-Forwarded-For`) | M | M | The client-IP source is not defined | arch Cross-cutting | gap (G-09) |
| D9 | S | Turnstile token replayed or reused from another site or action; outage handled as fail-open | L | M | siteverify is called; `action` and `hostname` are not checked; on an outage the request is allowed with a stricter limit | arch Integrations | partial (G-14) |
| D10 | D | Exhausting the Worker free quota (100k requests/day) or Supabase limits, which takes the site down | L | H | None at the edge; app-level limits only | — | gap (G-12) |
| D11 | D | `/healthz` hit repeatedly, each call costing a DB query and an Auth call | L | L | Public, no secrets; no limit or caching | contracts | gap (G-24) |
| D12 | T | Gaps or duplicates in order numbers under concurrency | M | L | Counter row inside the transaction | NFR-013 | specified |

## E. Uploads and Storage (custom-request photos, admin images)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| E1 | T | Non-image or oversized upload (PDF, HTML, SVG, 50 MB) | M | M | Client checks type and ≤ 10 MB, then compresses; signed upload URLs only for the declared type and ≤ 1 MB; server verifies the object exists under the issued prefix with an allowed MIME and ≤ 1 MB; bucket MIME and size limits; no SVG | FR-029; arch Data; data-model Storage | specified |
| E2 | T | Content-Type label does not match the bytes (polyglot, or HTML labelled `image/jpeg`) | L | L | The server checks the stored MIME, which the client declared. Magic bytes are not checked on the server. Impact is limited: files are served from the Supabase origin, not the app origin | custom-requests Security | partial (G-13) |
| E3 | E | A submit references another visitor's `uploadSessionId` or paths and attaches or exposes their photos | L | M | Prefix check. `uploadSessionId` is client-chosen and not bound to the requester | contracts custom-cake | gap (G-13) |
| E4 | I | Customer photos (faces, homes) publicly readable | L | H | Private `request-photos` bucket; admins view through 10-minute signed URLs; never shown on tracking | data-model; FR-028; admin-orders AC12 | specified |
| E5 | I | EXIF GPS location in photos | M | M | Re-encoding in the browser strips EXIF. A direct client can skip this; the server does not strip | admin-menu Privacy; custom-requests Privacy | partial (accepted for customer self-uploads; G-13 for verification) |
| E6 | D | Filling the 1 GB Storage quota (RL-upload 20/10 min/IP × 5 × 1 MB) | L | M | Rate limit, Turnstile, orphan purge after 24 h; no global daily cap | arch Cross-cutting, jobs | partial (G-15) |
| E7 | E | Anon or authenticated keys write to buckets directly | L | H | Writes only through server-signed URLs. Storage RLS policies on `storage.objects` are not stated or tested | data-model Access control | partial (G-11) |
| E8 | T | Supply-chain risk in the lazily loaded `heic2any` and the compressor libraries | L | M | Lazy loading only; no dependency audit | risk T8 | gap (G-18) |

## F. Webhooks and scheduled jobs
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| F1 | S | Forged call to `/hooks/supabase/send-email` (sends phishing mail from the bakery domain) | M | H | Standard Webhooks signature with `SUPABASE_AUTH_HOOK_SECRET`, 401 on failure | contracts Webhooks | specified |
| F2 | T | Webhook replay | L | M | Timestamp skew ≤ 5 min; idempotent on `webhook-id` (`dedupe_key`). Use the `standardwebhooks` library (constant-time compare) | contracts; notifications Security | specified (use the library) |
| F3 | T | `email_data.redirect_to` points to an attacker domain, so auth links send tokens elsewhere | L | H | Depends on the Supabase Redirect URLs allowlist, which is not specified | [architecture Security](architecture.md#security) "Supabase Auth redirect allowlist" | specified (G-04) |
| F4 | S | Cron jobs triggered over HTTP by anyone | L | M | The `scheduled` handler is not HTTP; no `/cron` route exists. Keep it that way: no job-trigger route in production builds | contracts Scheduled jobs | specified |
| F5 | T | A job runs twice (cron overlap or retry): double emails or pushes | M | L | `job_run` once-only keys, marker updates with `RETURNING`, versioned updates, `dedupe_key` | arch Jobs; contracts | specified |
| F6 | R | A silent job failure goes unnoticed (quotes not expired, emails stuck) | M | M | Job reports in Workers Logs; Sentry Cron Monitor on `keepAlive`; `dead` email alert | arch Jobs, Integrations | specified |

## G. Email (Resend)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| G1 | S | Others spoof the bakery domain (phishing "your order" emails) | M | H | The domain must be verified with Resend (DKIM). SPF alignment, DMARC policy and a sending subdomain are not specified | [architecture Security](architecture.md#security) "Email domain authentication" | specified (G-03) |
| G2 | T | Public forms abused to send bakery-branded mail with attacker text (the name field) to arbitrary addresses | M | M | Turnstile and per-IP limits; React Email escapes the text. No per-recipient cap; the name length cap is loose | notifications Security | partial (G-08) |
| G3 | D | Daily quota (100) drained by public-triggered emails, which blocks real customers and auth emails | M | M | Daily counter, non-critical emails deferred at 90; outbox retry; Brevo fallback. Public-triggered critical emails have no budget of their own | arch Integrations; risk T7 | partial (G-08) |
| G4 | I | Excess PII in emails or outbox | L | M | Only the recipient's own data; push carries order number + first name; outbox purged after 90 days; no tracking pixels | NFR-004; notifications Privacy | specified |
| G5 | T | HTML or header injection through customer text in emails | L | M | React Email escapes; the Resend JSON API (no raw headers); plain text alternative | notifications Security | specified |

## H. Web push (VAPID)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| H1 | S | VAPID private key leaks, so pushes can be forged to admin devices | L | M | Worker secret; only the public key is sent to the client (`vapidPublicKey`); no rotation runbook | notifications Security | partial (G-17) |
| H2 | T/I | `subscribePush` stores any endpoint URL, so the Worker POSTs to arbitrary hosts (SSRF-lite, data exfiltration of payloads) | L | L | Admin-only. Endpoint host allowlist not specified | contracts admin/profile | gap (G-17) |
| H3 | I | Push payload shows PII on the lock screen | M | L | Order number + first name only; no address or phone | notifications Security | specified |
| H4 | I | The admin service worker caches private admin responses on a shared or lost phone | L | M | HTML is `private, no-store`; the SW cache scope is not specified | arch Rendering | gap (G-22) |

## I. Data layer (Postgres, RLS, queries)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| I1 | E | Public anon key used against the Supabase Data API (PostgREST) to read or write tables | M | H | RLS on every table with no policies; `schema.test.ts` fails if a table lacks it | data-model Access control | specified (G-11 adds defence) |
| I2 | T | SQL injection, including through `ILIKE` search | L | H | Drizzle parameterised queries only; no SQL in routes. `%`/`_` escaping in search not stated (correctness, not injection) | coding-standards; admin-sales Security | specified |
| I3 | E | The pooler role bypasses RLS, so a bug in app authz is a full bypass | M | H | Guards on every loader and action; route-level tests per role. Accepted by design (RLS is the safety net, not the policy) | arch Auth | specified |

## J. Secrets, vendor accounts, CI and backups
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| J1 | I | Secrets committed to git or bundled into the client | M | H | `env.server.ts` server-only, `wrangler secret`, `.dev.vars.example`; no secret scanning in CI or hooks | arch Security, Environments | partial (G-19) |
| J2 | S/E | Takeover of a bakery vendor account (Cloudflare, Supabase, GitHub, Resend, Google, registrar) gives full compromise | M | H | Accounts are owned by the bakery (NFR-012). MFA and recovery codes are not required | [architecture Security](architecture.md#security) "Vendor account protection"; NFR-012 | specified (G-03; Owner MFA in-app still G-10) |
| J3 | I | High-value secrets (pooler/direct DB URL, service-role key, Storage S3 keys, Drive OAuth token) over-privileged or never rotated | L | H | Separate per environment. No inventory, rotation runbook, or least-privilege scopes (Drive full scope versus `drive.file`) | arch Backups | gap (G-20) |
| J4 | T | Compromised GitHub Action or workflow exfiltrates backup secrets | L | H | Private repo. Actions not pinned to SHA; default `GITHUB_TOKEN` permissions not reduced | arch Backups | gap (G-20) |
| J5 | I | Backup archive on Google Drive read by others | L | H | `age` encryption, key in the bakery password manager; 8-week rotation | arch Backups | specified |
| J6 | D | Data loss (no PITR) | L | H | Weekly backup, restore drill before launch; orders duplicated in emails; accepted for v1 | NFR-005; risk T9 | specified (accepted) |
| J7 | T | Malicious npm dependency or install script | L | H | Lockfile; `npm ci`. No dependency audit or `ignore-scripts` policy | — | gap (G-18) |

## K. Admin outputs: CSV, WhatsApp links, editable URLs, headers
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| K1 | T | CSV formula injection through a customer name | M | M | Cells starting with `= + - @` get a `'` prefix; AC22. Tab, CR and the full-width variants are missing | admin-sales CSV layout | partial (G-23) |
| K2 | I | CSV leaks PII | L | M | Names only in the Unpaid section, no phone or email; session required; streamed | admin-sales Privacy | specified |
| K3 | T | WhatsApp `wa.me` link injection through the phone or template text | L | L | Phone reduced to E.164 digits; templates resolved on the server, unknown placeholders rejected. URL-encoding of the text not stated | notifications; domain/whatsapp | partial (G-23) |
| K4 | E | Stored XSS through an admin-editable URL (promotion custom link, Instagram, map URL) using `javascript:` | L | H | React escapes text; CSP nonce blocks inline script. No URL scheme allowlist (`https:` only) | admin-menu Security | gap (G-23) |
| K5 | T | XSS through FAQ, About or cake messages | L | H | Plain text only, rendered escaped; no `dangerouslySetInnerHTML` | arch Security; admin-menu | specified |
| K6 | T | Clickjacking, MIME sniffing, mixed content | L | M | CSP `frame-ancestors 'none'`, HSTS, `nosniff`, nonce CSP | arch Security | specified |
| K7 | T | CSRF on cookie-authenticated mutations | M | H | SameSite=Lax + `Origin`/`Host` check on every non-GET action | arch Auth | specified |
| K8 | S | Social engineering over WhatsApp ("I'm APB-0042, change my address"); the order number is not a secret | M | L | Not addressed in the admin runbook | — | gap (G-22) |

## L. Privacy (Mauritius Data Protection Act 2017)
| ID | S/T/R/I/D/E | Threat | L | I | Mitigation | Where | Status |
|---|---|---|---|---|---|---|---|
| L1 | I | Personal data kept longer than needed | M | M | Retention table with proposed periods and purge and anonymise crons; periods marked `[TO CONFIRM]` | data-model Retention; NFR-004; R10 | partial (G-24) |
| L2 | R | No process for access (DSAR), rectification or export | M | M | Erasure is an Owner-triggered anonymise action within 30 days. Access and export are not specified | data-model | gap (G-24) |
| L3 | I | Erased data survives in backups for 8 weeks and in Sentry or Workers Logs | M | L | 8-week rolling backups; Sentry scrubbing; logs have no PII. Must be disclosed in the privacy note | arch Backups, Cross-cutting | partial (G-24) |
| L4 | R | Controller obligations not met (registration with the Data Protection Office, privacy notice listing processors and cross-border transfers to Supabase (India), Cloudflare, Resend and Sentry (US), breach notification) | M | M | Privacy note planned; regime, controller and retention are open (PRD Q12) | NFR-004; PRD Q12, R10 | gap (G-24) |
| L5 | I | Analytics or consent cookies | L | L | No tracking cookies; optional cookieless Cloudflare Web Analytics | NFR-011 | specified |

## Gaps: actionable items for the build
Priority: **H** must be fixed before launch; **M** should be fixed before launch; **L** nice to have or decide.
| Gap | Pri | Threats | Action (acceptance) | Owner |
|---|---|---|---|---|
| G-01 | H | B2 | **Specified 2026-11-10** (contracts v0.3, customer-accounts, UX). Prevent pre-account takeover: do not set the user's password before the email is confirmed. In `signUp` and `saveDetails`, create the user with a random unusable password, and have the user choose the password on the confirmation landing (`auth/confirm type=signup` → set-password step). Or: on first confirmation, revoke all sessions and force a password set. Test: attacker-set password cannot sign in after the victim confirms. | auth-specialist |
| G-02 | H | B3 | **Specified 2026-11-10** (contracts "Customer matching", data-model, checkout, manual orders, customer-accounts). Customer upsert at checkout must never overwrite `customer.email` or `auth_user_id`. A phone-only match creates a new customer when the emails differ, or keeps the existing email and snapshots the typed one on the order only. `account/orders` lists only orders whose `customer_id` is linked *and* whose snapshot email equals the confirmed email. Test: phone-collision scenario. | lead-backend |
| G-03 | H | G1, J2 | **Specified 2026-11-10** (architecture Security). Email auth for the bakery domain: send from a subdomain (e.g. `mail.<domain>`), Resend DKIM + SPF (custom Return-Path) aligned, DMARC `p=quarantine` at launch then `p=reject` after 4 clean weeks, `rua` reporting to the bakery address. Also **G-03b**: MFA (TOTP or passkey) on Cloudflare, Supabase, GitHub, Resend, Google and the registrar, with recovery codes in the bakery password manager. Add both to the launch checklist. | devops-lead / email-specialist |
| G-04 | H | F3, A10 | **Specified 2026-11-10** (architecture Security). Supabase Auth URL configuration: Site URL = production domain; Redirect URLs = exact `https://<domain>/auth/confirm` and the staging equivalent, no wildcards. The send-email hook rejects any `redirect_to` outside the allowlist before building a link. Unit test. | auth-specialist |
| G-05 | M | A10 | `next` and `redirect_to` validator: accept only a relative path starting with a single `/` (reject `//`, `/\`, a scheme, or an encoded scheme); default `/account` or `/admin`. One helper, used by every sign-in and confirm route. Test cases. | auth-specialist |
| G-06 | M | A11 | GET on `/auth/confirm` and `/admin/invite/:token` must not consume the token: render a "Continue" button that POSTs `verifyOtp` or accept. Email links never perform a state change on GET (quote accept and decline stay POST buttons on the tracking page). | auth-specialist |
| G-07 | M | C3, C4 | Apply `Referrer-Policy: no-referrer`, `noindex` and `no-store` to every token-bearing route: `/t/*`, `/order/*`, `/account/save-details`, `/auth/confirm`, `/admin/invite/*`, `/admin/reset`. Redact `/t/*`, `/order/*`, `/admin/invite/*`, `?t=`, `token_hash`, `code` in Workers Logs and Sentry (`beforeSend`, breadcrumbs). Exclude these routes from any analytics beacon. Test for the log redactor. | security-lead / lead-backend |
| G-08 | M | B6, G2, G3 | Per-recipient email limits: at most 3 public-triggered emails per recipient address per 24 h (order or request received, auth links), keyed by `sha256(email)`. Reserve at least 30 of the daily 100 for admin-triggered and auth emails. Cap the name at 80 characters and do not autolink it. Sentry alert when the daily count passes 70 before 14:00 MU. | lead-backend / email-specialist |
| G-09 | M | D8 | Rate-limit key uses only `request.headers.get('CF-Connecting-IP')`; ignore `X-Forwarded-For`. Note it in `rate-limit.server.ts`, with a test. | lead-backend |
| G-10 | M | A5, J2 | Decision for the owner: enable Supabase TOTP MFA (free) for Owner accounts, enforced in `requireAdmin({role:'owner'})` through `aal2`. If declined, record it as an accepted risk. Minimum password length 12 for admins. | auth-specialist (owner decides) |
| G-11 | M | I1, E7 | Defence in depth: in Supabase, remove `public` from the Data API exposed schemas (or disable the Data API), since the app never uses PostgREST. Add `storage.objects` with no anon or authenticated insert, update or delete policies. Mark only `public-images` as public. Extend `schema.test.ts` or a setup check to assert the bucket config and policies. | lead-backend / devops-lead |
| G-12 | M | D10 | When the custom domain is live: put the Worker behind the zone (not only `workers.dev`, which you disable in production), turn on Bot Fight Mode, and add the free-plan WAF rate-limit rule on `POST` to `/basket`, `/custom-cake` and `/account/*`. Sentry alert at 80 % of the daily request quota. | devops-lead |
| G-13 | M | E2, E3, E5 | Generate the upload session on the server: `requestUploadUrls` returns an `uploadSessionId` bound to an HttpOnly signed cookie (HMAC), with server-chosen random object names. On submit, require the same cookie and reject paths outside that session. Fetch the first 16 bytes of each object (range GET) and check JPEG, PNG or WebP magic bytes. Set `cacheControl` and `contentType` when signing. | lead-backend |
| G-14 | M | D9 | In siteverify, check `success`, `action` (per form) and `hostname` (allowlist). Treat only network timeouts as an outage (fail open with the stricter limit); treat `success:false` as a hard fail. Log the fail-open count. | lead-backend |
| G-15 | M | E6 | Global cap on public uploads: at most 200 public signed upload URLs a day (counter in `rate_limit_bucket`); above that, `RATE_LIMITED` and a Sentry alert. Alert when Storage passes 800 MB. | lead-backend |
| G-16 | L | A8 | Decide and test: `requireAdmin` accepts sessions whose `amr` includes `password` or `recovery` only. Admin emails cannot use the customer magic-link flow (refuse it in `magicLink`, as is done for sign-up). | auth-specialist |
| G-17 | L | H1, H2 | `subscribePush`: require `https:` and an endpoint host in the allowlist (`fcm.googleapis.com`, `*.push.apple.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`), keys in the expected base64url lengths. VAPID rotation runbook: generate a new pair, deploy, admins re-subscribe. | lead-backend |
| G-18 | L | E8, J7 | Run `/dependency-audit` before adding `heic2any`, the image compressor and the web-push library (maintenance, install scripts, licence). Set `npm ci` in CI; `ignore-scripts=true` in `.npmrc` unless a package needs install scripts; Dependabot or `npm audit` in CI. | security-lead |
| G-19 | L | J1 | Secret scanning: gitleaks in CI and a pre-commit hook; `.dev.vars` and `.env*` in `.gitignore`; a build check that no `SUPABASE_SERVICE_ROLE_KEY` or `*_SECRET` name appears in the client bundle. | devops-lead |
| G-20 | L | J3, J4 | Secrets inventory and rotation runbook (`docs/runbooks/secrets.md`): every secret, where it lives, its scope and how to rotate it. Use the Drive scope `drive.file` and a dedicated backup folder. Pin backup workflow actions to commit SHAs; set `permissions: contents: read`; branch protection on `main` and `production`. Rotate immediately on staff or developer handover. | devops-lead |
| G-21 | L | D6 | Generate `idempotencyKey` with `crypto.randomUUID()` on the server per render. On a replay, return the original redirect only when the replayed payload's email matches the order's email; otherwise `VALIDATION_FAILED`. | lead-backend |
| G-22 | L | H4, K8 | Service worker caches only hashed static assets and the offline shell, never `/admin` data responses. Admin runbook: confirm changes requested over WhatsApp from the customer's phone number on file, not the order number alone. | lead-frontend / producer |
| G-23 | L | K1, K3, K4 | CSV guard: also prefix cells starting with tab, CR, or the full-width `＝ ＋ － ＠`; always quote. WhatsApp text through `encodeURIComponent`, with tests. All admin-editable URLs pass a zod `https:`-only (or relative `/`) refinement. | lead-backend |
| G-24 | M | L1–L4, D11 | Privacy, with privacy-compliance-specialist and the owner: confirm the DPA 2017 regime, controller and retention (PRD Q12); register the controller with the Data Protection Office if required; privacy note lists the processors and cross-border transfers (Supabase, Cloudflare, Resend, Sentry, Google Drive) and the 8-week backup tail; define the DSAR access flow (Owner exports one customer's data as JSON or CSV from the customer detail page) and a 72-hour breach-response note in the incident runbook. Also: cache `/healthz` for 30 s (D11). | privacy-compliance-specialist |

## Checklist (design level)
- [x] Authn + object-level authz on every route/action (A1, A2, B5)
- [x] Input validation at boundaries; output encoding; no unsafe HTML sinks with user data (D3, K5); [ ] URL scheme allowlist (G-23)
- [x] Parameterised queries only (I2)
- [x] CSRF: SameSite=Lax + Origin check (K7)
- [~] Rate limits on auth and expensive endpoints (gaps G-08, G-09, G-12, G-15)
- [x] Security headers (K6); [~] extend `no-referrer` to all token routes (G-07): done for `/t/*` and `/order/*` (S-015/S-016, `token-page.server.ts`); save-details, auth and invite routes follow with their stories
- [x] CORS: no cross-origin API; send no CORS headers
- [~] Secrets: Worker secrets only; scanning and rotation missing (G-19, G-20)
- [x] Webhooks signature-verified and idempotent (F1, F2); [ ] redirect allowlist (G-04)
- [~] Uploads: type and size limits, private bucket; session binding and magic bytes missing (G-13)
- [~] SSRF: push endpoint allowlist missing (G-17)
- [ ] Dependencies audited (G-18)
- [x] Logging excludes PII; [~] token redaction to complete (G-07); audit log for admin actions (A9)

## Accepted risks (user decision required)
| Item | Reason | Decided by | Date |
|---|---|---|---|
| C5 Forwarded email gives the order page and its actions | Guest ordering without an account is a core requirement; actions are status-gated | owner (to confirm) | — |
| C6 Tracking tokens stored in plaintext | Needed for account and admin links; DB access is server-only and backups are encrypted | owner (to confirm) | — |
| I3 Authorisation only in app code (RLS as a safety net) | Single app, pooler role; covered by per-route tests | technical-director (ADR-0001) | 2026-11-10 |
| J6 No point-in-time recovery; worst case one week of data loss | Free plan; orders also exist in emails | owner (to confirm) | — |
| A3 30-day session enforced in the app, not by Supabase | Supabase free plan has no time-boxed sessions | technical-director (ADR-0001) | 2026-11-10 |
