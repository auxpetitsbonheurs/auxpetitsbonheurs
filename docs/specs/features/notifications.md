<!-- Template: feature-spec | Filled by: /feature-spec (product-manager, ux-lead, lead-backend, lead-frontend) | Output: docs/specs/features/notifications.md -->
# Feature Spec — Notifications (customer emails, admin alerts, WhatsApp templates)

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 (Resend + outbox, Web Push VAPID) · Epic: TBD (assigned by `/create-epics`; spans Phases 3-5)
Sources: `docs/product/prd.md` §5.9 + Appendix B, `docs/product/build-brief.md` "Notifications", `docs/architecture/architecture.md` (outbox, push, jobs, risk T1), `docs/architecture/api/contracts.md` (push payload, `/hooks/supabase/send-email`, jobs, `admin/profile`, `admin/order` `whatsappLink`), `docs/architecture/data-model.md` (`email_outbox`, `push_subscription`, `job_run`, `settings`).

## Summary
Every customer message is an automatic email in the order's language (EN or FR), sent through Resend with an outbox so an order is never lost when email fails. Admins get push and email alerts per their own switches, an 18:00 evening reminder, a one-time alert for orders waiting over 24 hours, and an alert when a quote expires. Nothing is sent by SMS or paid WhatsApp: the WhatsApp button only opens a chat with a pre-filled, editable message built from Owner-edited templates.

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-070 | Automatic customer emails EN/FR on each event | Email catalogue, AC1-AC6 |
| FR-071 | Required content per email; phone-readable; bakery name and colours | Email content rules, AC7-AC10 |
| FR-072 | Admin push + email (new order, new request, quote accepted/declined, customer cancelled); push only (18:00 reminder, quote expiry); preferences; tap opens target | Admin alerts, AC11-AC17 |
| FR-073 | WhatsApp button, templates and placeholders in order language, edited in Settings | WhatsApp, AC18-AC22 |
| FR-074 | Email failure never loses the order; admins still alerted; retry | Delivery and retry, AC23-AC27 |
| FR-075 | Push once when a website order is Pending approval over 24 h | Pending alert, AC28-AC31 |
| FR-021 (link) | Phone stored as E.164, +230 default | Phone normalisation, AC32-AC35 |
| FR-046, FR-047 | Per-admin alert switches; installable PWA with push | Admin alerts, preferences |
| FR-042, FR-034 (link) | Admin invitation, sign-in link, password reset emails | Email catalogue (system emails) |

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Admin profile > Alerts | `/admin/profile` | Skeleton | "Push is off on this device" + Enable button | Push blocked by browser: help text "Allow notifications in settings"; iOS not installed: "Add to Home Screen first" | Switch toasts "Saved"; "Send test push" shows a push within seconds |
| Order detail > WhatsApp menu | `/admin/orders/:id` | n/a | n/a | No phone: button disabled with reason | Opens `wa.me` link with message prefilled; admin edits before sending |
| Settings > WhatsApp templates (Owner) | `/admin/settings` | Skeleton | Defaults seeded | `SETTINGS_CHANGED` Reload; unknown placeholder inline error | Live preview with sample order values per language |
| Order detail > activity log | `/admin/orders/:id` | n/a | n/a | Entry `email_failed` with reason and "Resend" via WhatsApp hint | Shows "Email sent" implicit via no failure |
| Customer emails | inbox | n/a | n/a | n/a | See catalogue |
| Settings > Email usage (Owner) | `/admin/settings` | n/a | "0 of 100 today" | n/a | Resend daily usage from the settings loader |

### Flow
1. A business action commits in one DB transaction: status change, `order_event`, `email_outbox` rows, then (after commit, via `ctx.waitUntil`) the sender tries each outbox row and the push sender notifies opted-in admins.
2. On send failure the row stays `pending` with backoff; the hourly `retryEmails` job picks it up.
3. Admin taps a push: `sw.js` opens the payload `url` (an order or a prep list).

### Copy
All subjects, bodies, push texts and button labels exist in EN and FR (`copywriter`, `app/server/email/templates`); fall back to EN only if an FR string is missing. Push text is short, shows order number and first name only (NFR-004). Wording of the admin alerts and templates is Owner-reviewed before launch.

## Email catalogue
Language = `orders.locale` for order emails; `customer.locale` / `user_metadata.locale` for account emails; `admin.locale` for admin emails. Trigger = PRD Appendix B.
| Key | Sent when | To | Must include |
|---|---|---|---|
| `order_received` | Website order placed | Customer | Number, items with options, date, window, delivery/pickup, total, "not confirmed yet", tracking link |
| `request_received` | Custom request sent | Customer | Request summary (occasion, date, servings, photos count), "we will send a quote", tracking link |
| `quote` | Quote sent or re-sent | Customer | Amount, note, expiry date (valid through that day), Accept and Decline buttons (open tracking page) |
| `order_confirmed` | Approved (admin approve, accepted quote, manual order with email) | Customer | Full summary, payment reminder (Juice number plus total, or cash on delivery/pickup), pickup address or delivery details, tracking link, 48-hour cancellation line |
| `order_declined` / `request_declined` | Declined | Customer | Reason if given, link to menu |
| `cancellation_confirmed` | Cancelled by customer or admin | Customer | Order number |
| `quote_closed` | Customer declines or quote expires | Customer | Which, link to send a new request |
| `order_updated` | Admin edit changes the date and/or total (owner Q11) | Customer | Subject EN "Your order was updated" / FR "Votre commande a été modifiée"; order number; new date and window and/or new total (only what changed is highlighted); tracking link. Sent in `orders.locale`; skipped when the order has no email |
| `ready_for_pickup` | Status Ready | Customer | Pickup address, date, window |
| `on_the_way` | Status Out for delivery | Customer | Delivery window, address |
| `thank_you` | Completed | Customer | Link to order again, Instagram |
| `admin_invitation` | Owner invites or resends | Invitee | Set-password link valid 7 days |
| `sign_in_link`, `password_reset`, `signup_confirm` | Requested | Customer | One-time link (sent directly via the Supabase hook, not the outbox) |
| `admin_alert_*` | See admin alerts | Admin | Number, first name, one line, deep link |
No customer email for: Back one step, Next status Approved to In preparation, Mark paid, edits that change neither date nor total (edits that do send `order_updated`). Manual order without an email sends nothing.

### Content rules
- Layout: single column, max width 600 px, 16 px body text, buttons 44 px high, system font fallback; bakery name in header, palette from the brand guide (`docs/design/tokens.json`), all colour pairs meet 4.5:1; plain-text alternative included.
- Money "Rs 1,250" (EN) and "Rs 1 250" (FR); dates in Mauritius time, long form ("Saturday 14 November"); links absolute to the live domain.
- Juice number appears in `order_confirmed` and the WhatsApp payment reminder (owner answer, PRD A-resolved). The cancellation sentence reads: free by WhatsApp until 48 hours before the order date, no refund after (FR-010).
- Only necessary personal data; no admin notes, no decline reasons other than the one given for the customer, no other customers' data.

## API Contract
No new routes. Contract of record `docs/architecture/api/contracts.md`.
| Operation | Where | Input | Output | Errors | Auth |
|---|---|---|---|---|---|
| Queue customer email | service layer, same transaction as the status change | template key, to, locale, payload, `dedupe_key` | outbox row `pending` | duplicate `dedupe_key` is a no-op | system |
| Send / retry | `sendEmail` after commit; job `retryEmails` (≤ 50 due rows per tick) | outbox row | `sent` (+`provider_id`) or `attempts+1` | 6th failure = `dead` + Sentry + event `email_failed` | system |
| Auth emails | `POST /hooks/supabase/send-email` | Supabase payload | `200 {}` | 401 bad signature; 500 on Resend failure | webhook signature |
| Push alert | service layer via `push.server.ts` | payload `{ title, body, url, tag }` in each admin's locale | delivery per subscription | 404/410 deletes subscription | system |
| Subscribe / alerts | `admin/profile` `subscribePush`, `unsubscribePush`, `setAlerts` | as contract | ok | `VALIDATION_FAILED` | admin |
| WhatsApp link | `admin/order` `whatsappLink` | `{ template }` | `{ ok, url }`, no state change | `VALIDATION_FAILED` (missing phone) | admin |
| Tracking WhatsApp | `site/tracking` loader `whatsappUrl` | n/a | bakery number link | n/a | token |
| Jobs | `retryEmails`, `expireQuotes`, `pendingAlerts`, `eveningReminder` | none | JobReport | per-job error captured | system |

### Alert matrix (who gets what)
| Event | Push | Email | Payload url | Recipients |
|---|---|---|---|---|
| New website order | ✓ | ✓ | `/admin/orders/<id>` | active admins with the switch on |
| New custom request | ✓ | ✓ | `/admin/orders/<id>` | same |
| Quote accepted / declined | ✓ | ✓ | `/admin/orders/<id>` | same |
| Customer cancelled | ✓ | ✓ | `/admin/orders/<id>` | same |
| Evening reminder 18:00 | ✓ | ✗ | `/admin/calendar/<tomorrow>/prep` | admins with push on; skipped when tomorrow has 0 orders |
| Quote expired | ✓ | ✗ | `/admin/orders/<id>` | admins with push on |
| Pending approval over 24 h | ✓ | ✗ | `/admin/orders/<id>` | admins with push on |
`alert_push` gates push; `alert_email` gates email; a switch off means none of that channel (FR-046). Deactivated admins receive nothing. Push `tag` = `<event>:<id>` so repeats collapse.

### Pending alert, evening reminder, quote-expired rules
- `pendingAlerts`: website orders only (not custom requests, which have their own "Quote needed" alert), status `pending_approval`, `created_at` older than 24 h, `pending_alert_sent_at` NULL; the marker is set in the same statement that selects the rows (`UPDATE … WHERE … IS NULL RETURNING`), so each order alerts once even if two ticks overlap. No status change.
- `eveningReminder`: once per MU date via `job_run('evening_reminder', date)`; body "Tomorrow: {n} orders" counting *confirmed* orders (approved..completed), the same set as the prep list it opens (decided 2026-11-10; the calendar also shows pending ones). If the tick misses the 18:00 hour, it still sends on any later tick that evening (before 21:00) as long as the run key is unclaimed.
- `expireQuotes`: pushes after the status update succeeds; see `custom-requests-quotes.md`.

## WhatsApp templates
- Keys: `approved`, `ready`, `on_the_way`, `payment_reminder`, `blank` in `settings.whatsapp_templates`, each `{en, fr}`; the order's `locale` chooses the language, falling back to EN if FR is empty.
- Placeholders: `{name}` (first name), `{order_number}`, `{date}` (long, MU), `{window}` (label e.g. "Morning 9:00-12:00"), `{total}` ("Rs 1,250"), `{juice_number}`, `{pickup_address}`, `{tracking_link}`.
- Resolution is server-side in `domain/whatsapp.ts`: unknown placeholders are rejected when Owner saves Settings; known placeholders with no value (e.g. `{pickup_address}` on a delivery order) resolve to an empty string and a double space is collapsed.
- `payment_reminder` default text includes `{juice_number}` and `{total}`.
- URL: `https://wa.me/<digits>?text=<url-encoded message>`, digits = E.164 without "+". The admin can edit the text in WhatsApp before sending; the app records nothing about what was sent.
- Customer-side "WhatsApp us" button uses the bakery number from Settings with an optional prefilled "Order {order_number}" line.

## Phone normalisation (`domain/phone.ts`, used by checkout, custom form, manual order, profile)
Strip spaces, dashes, dots, parentheses. Then: starts with "+" keep; starts with "00" replace by "+"; exactly 8 digits becomes "+230" + digits; "230" followed by 8 digits becomes "+230…"; anything else without "+" is invalid. A result must be E.164: "+" and 8 to 15 digits. Examples: "5712 3456" -> +23057123456; "+230 5712 3456" -> +23057123456; "0033 6 12 34 56 78" -> +33612345678; "123" -> invalid with a field error "Enter a phone number, e.g. 5712 3456". Unit tests table-drive these.

## Data Model Changes
| Entity | Change | Fields / constraints / indexes | Migration notes |
|---|---|---|---|
| `email_outbox` | none | `template` holds the keys above; `dedupe_key` pattern `order:<id>:<key>:v<orderVersion>` (quote: version of the quote; thank_you: `…:thank_you`) | none |
| `order_event` | none | uses `email_failed`, `pending_alert_sent`, `quote_expired` | none |
Admin alert emails also use `email_outbox` (`to_email` = admin email, `order_id` set). No new tables.

## Permissions matrix
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| Receive customer emails | n/a (recipients only) | ✓ own | n/a | n/a |
| Change own alert switches, subscribe push | ✗ | ✗ | ✓ (self only) | ✓ (self only) |
| Use WhatsApp button, see templates (resolved) | ✗ | ✗ | ✓ | ✓ |
| Edit WhatsApp templates, quote validity, reminder time | ✗ | ✗ | ✗ (403) | ✓ |
| See email failures in order log | ✗ | ✗ | ✓ | ✓ |
| See Resend usage | ✗ | ✗ | ✗ | ✓ |
Webhook calls need a valid signature.

## Analytics Events
Server-side counters, no PII, no cookies.
| Event | Trigger | Properties |
|---|---|---|
| email_sent / email_failed / email_dead | outbox outcome | template, attempt |
| email_deferred_cap | daily cap reached | template |
| push_sent / push_gone | push result | event type, status code class |
| whatsapp_link_opened | `whatsappLink` | template key, locale |
| alert_prefs_changed | `setAlerts` | push, email booleans |

## Edge Cases
- Resend outage or 429: order saved, admins alerted, retries at 1 h, 2 h, 4 h, 8 h, 24 h; after 6 tries `dead`, Sentry alert, `email_failed` event, order detail shows it so the admin can WhatsApp the tracking link.
- Daily cap: at 90 sends in a day, non-critical emails (Thank you, `admin_alert_*` duplicates of push) defer to the next day; critical customer emails (`order_received`, `request_received`, `quote`, `order_confirmed`, `order_updated`, declines, cancellations, auth, invitations) still go until 100.
- Duplicate triggers (double tap, retry of the same action): `dedupe_key` prevents duplicate emails.
- Back one step then Next again: no email on revert; forward again emits a new status email only if the status key differs (`dedupe_key` includes version so legitimate repeats do send).
- Customer with a bounced/invalid address: send fails with 4xx from Resend; marked `dead` immediately (no 6 retries) when the error is permanent.
- Admin has no push subscription: email alert still sent if on; push alone never carries a critical event that lacks email, except the three push-only alerts, which the Today counts also show (architecture T1, iOS push risk).
- Push to iOS requires the installed PWA; failure 404/410 deletes that subscription.
- Time: all reminders and expiry are in Mauritius time (UTC+4, no DST); the 18:00 hour is read from `settings.evening_reminder_at`.
- Admin deactivated mid-send: skipped; subscriptions deleted.
- Language missing for an order (legacy row): fall back to EN.
- Long French strings and 320 px: emails stay single column, buttons wrap.
- Email links use tracking tokens; forwarded emails expose the order page (accepted, noted in privacy note).
- Test sends in staging go only to test inboxes.

## Acceptance Criteria
- AC1: Given each event in Appendix B and each locale, then exactly one email with the right key and language is queued and sent.
- AC2: Given an order placed from `/fr/basket`, then `order_received`, `order_confirmed` and `thank_you` are French.
- AC3: Given a manual order without email, then no email and no outbox row.
- AC4: Given Back one step, then no email.
- AC5: Given Approved to In preparation, then no email.
- AC6: Given a cancellation by an admin on an Approved order, or on a quote_sent order (owner Q6), then `cancellation_confirmed` is sent.
- AC6b (Q11): Given an admin edit changing the date and/or total of an FR order with an email, then one `order_updated` email in French shows the new date and/or total; given an edit changing neither, then none; given no email on the order, then none. Admin-created manual orders do not send it.
- AC7: Given `order_confirmed`, then it shows summary, payment reminder with the Juice number and total (or cash wording), pickup address or delivery details, tracking link and the 48-hour policy sentence.
- AC8: Given `quote`, then amount, note, expiry and Accept and Decline buttons are present, both linking to the tracking page.
- AC9: Given `order_received`, then it states the order is not confirmed yet.
- AC10: Given a 375 px client and 320 px, then no horizontal scroll, text ≥ 16 px, buttons ≥ 44 px, contrast ≥ 4.5:1.
- AC11: Given alerts on, when a website order is placed, then each opted-in admin receives push and email.
- AC12: Given `alert_push` off and `alert_email` on, then that admin gets email only.
- AC13: Given both off, then nothing.
- AC14: Given a deactivated admin, then nothing and their subscriptions are deleted.
- AC15: Given tomorrow has 3 orders, when the 18:00 hour passes, then each admin with push on gets one push "Tomorrow: 3 orders" that opens the prep list for tomorrow; no email.
- AC16: Given tomorrow has 0 orders, then no push, but the run key is still claimed.
- AC17: Given the job runs twice in the 18:00 hour, then one push per admin.
- AC18: Given each template and each locale, when resolved for a delivery order, then all placeholders are replaced and no braces remain.
- AC19: Given an FR order and an empty FR template, then the EN template text is used.
- AC20: Given an unknown placeholder `{foo}`, when the Owner saves, then rejected with an inline error.
- AC21: Given phone +23057123456, then the link is `https://wa.me/23057123456?text=` with encoded text.
- AC22: Given an Admin (not Owner), when saving templates, then 403.
- AC23: Given Resend returns 500, when an order is placed, then the order exists, admins are alerted by push, and the outbox row is pending with `next_attempt_at` 1 h later.
- AC24: Given a later successful retry, then the row is `sent` and exactly one email arrived.
- AC25: Given 6 failures, then the row is `dead` and the order log shows `email_failed`.
- AC26: Given 90 emails sent today, then a Thank you is deferred and an Order confirmed still sends.
- AC27: Given the same action replayed, then no duplicate email (same `dedupe_key`).
- AC28: Given a website order Pending approval for 24 h 1 min, when `pendingAlerts` runs, then each opted-in admin receives exactly one push opening the order.
- AC29: Given approved or cancelled at 23 h, then no push.
- AC30: Given the job runs again later, then no second push for that order.
- AC31: Given a custom request waiting over 24 h, then no pending alert (website orders only).
- AC32: Given "5712 3456", then +23057123456.
- AC33: Given "+44 7700 900123" and "0033 6 12 34 56 78", then kept as E.164 numbers.
- AC34: Given "123" or letters, then `VALIDATION_FAILED` with a field message.
- AC35: Given "23057123456" then +23057123456.
- AC36: Given a quote that expires, then the customer gets `quote_closed` and opted-in admins get a push opening the order.

## Non-functional
- Performance: emails and push are sent after commit and never block the customer response; order action p95 unaffected (≤ 800 ms); outbound timeouts Resend 8 s, push 5 s; a tick sends ≤ 50 rows.
- Accessibility: emails use real headings, alt text on images, link text that makes sense out of context, no information only in colour; push text is readable by screen readers.
- Security: webhook signature verified, skew ≤ 5 min; secrets (`RESEND_API_KEY`, VAPID keys, hook secret) in env, documented in `.env.example` only; templates escape user text; links carry tracking tokens only; the push payload carries order number and first name only.
- Privacy: emails hold name, items, address (delivery) and order data of the recipient only; outbox payloads deleted after 90 days; push contains no address or phone; no tracking pixels in emails; unsubscribe is not required for transactional email.

## Rollout / flags
Flag: none · Rollout: staging with test inboxes first (all templates EN/FR checked in launch test Appendix A); production after the Resend sending domain is verified · Rollback: pause by emptying `RESEND_API_KEY`; outbox rows stay `pending` and send on restore.

## Open Questions
- Should the 24-hour pending alert also exist as email? Assumed push only per FR-075 — owner product-director.
- Evening reminder when tomorrow has 0 orders: skipped (owner-approved 2026-11-10, Q14).
- Admin alert emails and the 90/day cap: assumed admin alert emails are non-critical because push covers them — owner lead-backend.
- iOS web push viability (architecture T1) is unresolved until the spike; the email fallback applies to the four push+email alerts only.

## Open contract changes (applied 2026-11-10)
1. Push payload `url` union: add `/admin/orders/<id>` for the pending and quote-expired alerts (already used) and document `/admin/calendar/<date>/prep` as tomorrow's date. — **Resolved in contracts.md (2026-11-10).**
2. `email_outbox.template` keys: list the keys in this spec as an enum in `app/server/contracts/` and add `admin_alert_*` keys. — **Resolved in contracts.md (2026-11-10).** As the `EmailTemplate` enum (admin keys `admin_alert_new_order`, `_new_request`, `_quote_accepted`, `_quote_declined`, `_customer_cancelled`).
3. `admin/settings` `save`: validate `whatsapp_templates` placeholders against the allowed set; return a field error per template/locale; loader returns sample-order preview values. — **Resolved in contracts.md (2026-11-10).**
4. `site/tracking` and `admin/order`: `whatsappUrl` and `whatsappLink` use `domain/phone` E.164 digits; no change to shapes. — **No shape change (2026-11-10);** E.164 rule noted on `Phone` and tracking.
5. Job `eveningReminder`: add "skip when count is 0" and the late-tick window (up to 21:00 MU) to the contract. — **Resolved in contracts.md (2026-11-10).**
6. Job `retryEmails`: classify permanent provider errors (4xx except 429) as `dead` immediately. — **Resolved in contracts.md (2026-11-10).**
7. Daily email cap: define the critical / non-critical split above in architecture.md R1 handling. — **Resolved in architecture.md (2026-11-10)** (Resend row: critical vs non-critical split).
