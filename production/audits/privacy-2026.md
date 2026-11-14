# Privacy audit and privacy note (S-229, S-225)

Reviewer: security-lead (privacy-compliance view) · Date: 2026-11-13 · Commit: origin/main after `ff58f91`
**Verdict: CONCERNS.** No high finding. The privacy note is live in EN and FR (`/privacy`, `/fr/privacy`). It stays `noindex` and shows "to be confirmed" until the Owner answers the questions below (S-225 AC7: blocked on the Owner, nothing invented). Three medium retention gaps need fixing before launch, or written acceptance.

This is not legal advice. The applicable regime (Mauritius Data Protection Act 2017) and the retention periods are the Owner's decision (PRD Q12).

## Personal data map
| Data | Collected at | Stored in | Who sees it | Logged? |
|---|---|---|---|---|
| Name, phone, email, delivery address, landmark, note | checkout, custom cake request, manual orders | `orders` snapshot + `customer` (Supabase Postgres) | signed-in admins; the customer through their token page or account | No: request and error logs redact emails, numbers and token paths (`workers/log-redact.ts`, `error-log.server.ts`) |
| Order contents and totals | checkout | `orders`, `order_item`, `order_event` | admins; the customer | No |
| Request details and up to 5 photos | custom cake | `custom_request`; photos in the **private** `request-photos` bucket (signed URLs) | admins | No |
| Account: name, email, phone, saved addresses, Auth user | sign-up, Save my details | Supabase Auth (password hash) + `customer` | the customer; admins | No |
| Review: rating, comment, display name | Write a review | `review` | public once approved; admins | No |
| Admin: name, email, role, push endpoints | invite | `admin`, Supabase Auth | owners | No |
| Email address of each sent email | outbox | `email_outbox.to_email`, cleared after 90 days (PRV-01) | server only | Only the provider id and status |
| IP address and email for abuse limits | every rate-limited action | `rate_limit_bucket` as **SHA-256 hashes**, 1 day | server only | No |
| Backups | weekly | bakery Google Drive, 8 copies | Owner | — |

Processors and cross-border transfers: Supabase (database, Auth, Storage; region `[TO CONFIRM]`), Cloudflare (hosting, Turnstile), Resend (email) and Google Drive (backups). Sentry is listed in `env.server.ts` but is not wired up in the browser or the Worker yet. Once it is, add it to the note and keep `beforeSend` scrubbing.

## Cookies and browser storage (S-229 AC3, S-225 AC5)
All are strictly necessary, so **no consent banner** is needed:
- `apb_basket`: 30 days, Secure, Lax. It holds product ids, choices and quantities, never personal data. It is not HttpOnly because the browser writes it.
- Supabase session cookies `sb-*`: 30 days, HttpOnly, Secure, Lax.
- `apb_customer`: a "My account" display hint, HttpOnly. It is never used for authorisation.
- `apb_banner_dismissed`: a session cookie, HttpOnly.
- `apb_left_out`: 15 min, and `apb_confirmed`: 10 min, both path-scoped to one order.
- The admin locale cookie.
- localStorage `apb_menu`: the public menu cache.

There is no analytics, tracker or third-party script except Turnstile on forms, which is bot checking, not tracking. The CSP (SEC-01) means no other third-party script can be added by accident.

## Emails and push (S-229 AC2)
- The order and request email templates (`email/templates/order-emails.ts`) carry only the recipient's own order: number, items, date, window, address and the tracking link. They never include the admin note or another customer's data, as stated in the templates and covered by `templates.test.ts`. Auth emails carry only the link.
- The push sender is not built yet (alerts job). When it is, the payload must be the order number and first name only. Test file: `app/server/notify/payload-privacy.test.ts` (S-229 AC2).

## Retention: stated, applied, and gaps (S-225 AC6)
`app/domain/privacy-facts.ts` holds the periods the note shows. `privacy-facts.test.ts` fails if they drift from the jobs.
| Data | Note says | Applied by | Status |
|---|---|---|---|
| Email contents | 90 days | `jobs/purge-emails` (payload emptied) | Applied |
| Abuse counters | 1 day | `jobs/purge-rate-limits` | Applied |
| Unused upload photos | 24 h | `jobs/purge-storage` (`ORPHAN_UPLOAD_MS`) | Applied |
| Backups | 8 weekly | `backup.yml` "Keep the latest 8" | Applied |
| Orders and contact details | 5 years, then anonymised (proposed) | **nothing** | **PRV-02** |
| Custom cake photos | 90 days after the request closes (proposed) | **nothing** | **PRV-03** |
| Email recipient address | (included in email contents) | `jobs/purge-emails` (`to_email` cleared with the payload) | Applied (PRV-01 fixed) |
| Account | until deleted | manual | PRV-04 |
| Reviews | until deleted | customer delete, cascade | Applied |

## Findings
| ID | Sev | Finding | Suggested fix | Owner |
|---|---|---|---|---|
| PRV-01 | M | **Fixed 2026-11-14** (privacy job): after 90 days a finished row's payload is emptied and `to_email` cleared, auth-hook claim rows included; the row stays so its dedupe key still blocks a resend; pending rows wait. Tests: `jobs/purge-emails.test.ts`. Was: `purgeEmails` empties `email_outbox.payload` after 90 days but keeps `to_email` and the row forever, and auth-hook claim rows also keep the address. `data-model.md` says "Cron hard delete". | After 90 days, delete rows that are not `pending`, or set `to_email` to null. The dedupe keys only matter while an order is active. Add a test that an old row has no address. | email-specialist (emails job) |
| PRV-02 | M | There is no anonymise or erase action (S-229 AC6) and no annual 5-year anonymise job (data-model "Customer personal"). An erase request today means editing the database by hand. | Add an Owner action on the customer screen: null the contact and address fields on the customer and their orders, set the name to "Deleted customer", delete the Auth user, keep totals. The yearly job reuses it. Until it exists, the runbook needs a manual SQL procedure so the 30-day promise can be kept. | lead-backend (customers screen) |
| PRV-03 | M | Custom cake photos are never deleted after the request closes (data-model: 90 days after a final status). | Extend `purgeStorage`: queue each request's photos with `due_at` = closed + 90 days when the order reaches a final status. | custom requests job |
| PRV-04 | L | Inactive accounts and reviews have no retention limit (PRD Q12 `[TO CONFIRM]`). The proposal is to keep them until deleted. | Owner answer (question 6). | Owner |
| PRV-05 | L | There is no access-request export (G-24 DSAR: one customer's data as JSON or CSV). | Add it with PRV-02 on the customer screen. The manual workaround is the Supabase table editor. | lead-backend |
| PRV-06 | L | No breach-response note in the incident runbook (G-24: 72 hours). | Add a short "personal data breach" section: what to check, who to tell, the Data Protection Office. | devops-lead |
| PRV-07 | L | Sign-up and Save my details link to the note. The account sign-in and Write a review forms do not (they collect no new personal data apart from the review's display name). | Optional: add `PrivacyNoteLink` under Write a review. | accounts and reviews job |

AC status: AC1 is pass (static plus `account.spec.ts`, `admin-access.spec.ts`; `privacy-visibility.spec.ts` was not written separately). AC2 is pass for email; push is pending. AC3 is pass. AC4 is pass for code, and the staging log sample is still to check (S-237). AC5 is partial (PRV-01..03). AC6 is open (PRV-02). AC7 is met: every gap is logged here and none is high.

## Privacy note (S-225)
- `/privacy` and `/fr/privacy` (`ff58f91`) cover: who is responsible, what is collected and why, who sees it and the processors, cookies, the **forwarded-email limit** (AC3), retention, erasure within 30 days with totals kept anonymously, and the law.
- Links: footer ("Privacy" / "Confidentialité") on every customer page. A "privacy note" link sits by the submit button on checkout (and so on the custom cake form, which uses the same summary block), sign-up and Save my details (AC4).
- Tests: `tests/e2e/privacy-note.spec.ts` (EN, FR, footer, form links, axe, tap targets, 320/375/1280 px) and `app/domain/privacy-facts.test.ts` (AC6, AC7).
- When the Owner answers: fill `PRIVACY_FACTS` in `app/domain/privacy-facts.ts`, update `updatedOn`, and add `/privacy` to the sitemap. The page becomes indexable once nothing is open.
- PRD NFR-004, `data-model.md` and the note agree on the proposed periods. When the Owner decides, update all three in one change (AC2).

## Questions for the Owner (each blocks S-225 AC2/AC7)
1. **Legal business name**, exactly as registered.
2. **Address** to show as the business address. It can be a postal address if the home address should stay private.
3. **BRN** (Business Registration Number).
4. **Database region** of the live Supabase project: Project Settings → General → Region (devops can read it for you).
5. **Regime**: do you confirm the Mauritius Data Protection Act 2017 applies? Do you need to register as a controller with the Data Protection Office? Ask your accountant or the DPO if unsure.
6. **Retention**: accept the proposed defaults, or choose others?
   - Orders and contact details: 5 years from the order date, then anonymised.
   - Accounts: until you are asked to delete them.
   - Custom cake photos: 90 days after the request closes.
   - Email contents: 90 days.
   - Reviews: until deleted.
   - Backups: 8 weekly copies.
7. **Uptime target**: proposed "best effort on free plans, no guarantee", recorded as accepted.
8. **Two-step sign-in (TOTP) for Owner accounts** in the admin app (G-10): yes or no. If no, it is recorded as an accepted risk.
9. **Accepted risks** C5 (a forwarded email gives access to the order page), C6 (tracking tokens stored in plain text) and J6 (up to one week of data loss): accept in writing?
