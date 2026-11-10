<!-- Template: feature-spec | Filled by: /feature-spec (product-manager, ux-lead, lead-backend, lead-frontend) | Output: docs/specs/features/custom-requests-quotes.md -->
# Feature Spec — Custom requests and quotes

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 (stack) · Epic: TBD (assigned by `/create-epics`; Phase 4 "custom requests and quotes")
Sources: `docs/product/prd.md` §5.4 + Appendix B, `docs/product/build-brief.md`, `docs/architecture/api/contracts.md` (`site/custom-cake`, `site/tracking`, `admin/order`, job `expireQuotes`), `docs/architecture/data-model.md` (`custom_request`, `custom_request_photo`, `orders`).

## Summary
A customer who wants a cake that is not on the menu sends a request (up to 5 reference photos, shrunk on their phone). Admins price it with a quote (full order total, optional note, expiry, default 5 days), the customer accepts or declines from the email link or tracking page, and unanswered quotes close themselves. Accepting turns the request into an Approved order on the calendar. This is the bakery's highest-value order type and is journey J5 in the PRD.

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-028 | Request form with all fields; appears in admin within seconds; "Request received" email | UX (form), API (`submitCustomRequest`), AC1-AC4 |
| FR-029 | Photos: JPEG/PNG/WebP/HEIC (converted), max 10 MB source, up to 5, shrunk before upload; others rejected | UX (photo step), Photo rules, AC5-AC8 |
| FR-030 | New request is Quote needed; admin sends quote (total incl. delivery, note, expiry default today + validity days) or declines with reason | UX (admin), API (`sendQuote`, `decline`), AC9-AC12 |
| FR-031 | Customer accepts/declines from email link or tracking page; accept makes order Approved; expired cannot be accepted | UX (tracking), API (`acceptQuote`, `declineQuote`), AC13-AC17 |
| FR-032 | Expired quotes move to Closed automatically (hourly job), "Quote closed" email + push to admins | Expiry job, AC18-AC21 |
| FR-033 | Admin can re-send a new quote replacing the old one while Quote sent | API (`sendQuote` re-quote), AC22-AC23 |
| FR-009 (link) | "Request something similar" opens the form with a gallery photo attached | UX (form prefill), AC24 |
| FR-051, FR-054, FR-045 (inherited) | Transitions per Appendix B, optimistic `version`, one event per change | API, Edge cases |

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Custom cake form | `/custom-cake`, `/fr/custom-cake` | Server-rendered; date picker gets 90 `DayStatus`; photo tile shows spinner while shrinking/uploading | No photos: dashed "Add photos (up to 5)" tile, photos optional | Field errors below fields (`aria-describedby`); Alert at top listing problems as links; per-photo error chip with "Remove" / "Try again"; submit never discards the form | Redirect to confirmation |
| Confirmation | `/order/:token/confirmed` | Server-rendered | n/a | Wrong token: not found + WhatsApp button | Shows request number, "Request received, we will send you a quote" (not a confirmed order), tracking link; offers "Save my details" for guests |
| Tracking, request states | `/t/:token` | Server-rendered | n/a | Wrong token: "We can't find this order" + WhatsApp | Quote needed: "Waiting for your quote" + Cancel; Quote sent: amount, note, "Valid until [date]", Accept / Decline; Approved/Declined/Closed/Cancelled: status text, no buttons |
| Admin Orders > To review | `/admin/orders?tab=review` | Skeleton rows | "Nothing to review" | Retry | Request rows labelled "Quote needed" |
| Admin order detail, request | `/admin/orders/:id` | Skeleton | Photos: "No photos" | `ORDER_CHANGED` Alert with Reload | Photo grid (signed URLs, 10 min), request fields, quote panel, activity log |
| Send quote sheet | drawer on order detail | Submit loading | Amount empty, expiry prefilled `today + quote_validity_days` | Inline field errors; 409 Alert | Toast "Quote sent"; status chip Quote sent |

### Flow
1. Customer opens `/custom-cake` (or "Request something similar" on a gallery photo: the photo is pre-attached and counts as one of the 5).
2. Fills the form. Fields: occasion (select), date (same availability rules and reasons as checkout), time window, servings (1 to 500), flavours, theme/colours, text on cake (max 200), optional budget (Rs), details (max 2000), delivery or pickup (+address/landmark), contact (name, phone, email), policies tick. Signed-in customers get contact and saved addresses prefilled (FR-021).
3. Photos are shrunk on the phone, uploaded straight to private storage, then the form is submitted with the storage paths.
4. Server creates the order (source `custom_request`, status Quote needed, number APB-nnnn, tracking token), photo rows, event `created`, outbox "Request received", and admin alert (push + email).
5. Admin opens it from To review, views photos, taps Send quote (or Decline with optional reason).
6. Customer gets "Your quote" email with Accept and Decline buttons that open the tracking page (never a one-tap GET that changes state), and responds there.
7. No answer by end of the expiry day: the hourly job closes it.

### Photo rules (client)
- Accept `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` by MIME and by file signature; anything else is rejected immediately with a message naming the allowed types. Source size max 10 MB; larger is rejected before decoding.
- HEIC is decoded in the browser (decoder is `lazy()`-loaded on first HEIC pick; not in the initial bundle), then all images are resized to a longest edge of 1600 px and re-encoded to JPEG or WebP, lowering quality from 0.82 toward 0.5, then the long edge toward 1200 px, until the file is at most 300 KB (target) and never above 1 MB (hard limit, matches the contract and bucket limit). If 1 MB cannot be reached the photo is rejected with "This photo is too detailed, try another".
- EXIF orientation is applied; location metadata is stripped by re-encoding.
- A sixth photo is blocked client-side ("5 photos maximum") and rejected server-side.

### Copy
Key strings (EN/FR both required, in `app/i18n`, owned by `copywriter`): "Not confirmed until we send you a quote and you accept"; "Add photos (up to 5)"; "Photos are shrunk on your phone to save data"; "Valid until {date}"; "This quote has expired. Send a new request or message us on WhatsApp"; "This quote was updated, reload to see the new amount". Never show the private block reason (FR-014).

## API Contract
Contract of record: `docs/architecture/api/contracts.md`. Referenced by name, not repeated.
| Operation | Module / intent | Input | Output | Errors | Auth |
|---|---|---|---|---|---|
| Load form | `site/custom-cake` loader | `?fromGallery` | days, windows, prefill, attachedGalleryPhoto, idempotencyKey, limits | n/a (unknown gallery id ignored) | public |
| Get upload URLs | `site/custom-cake` `requestUploadUrls` | uploadSessionId, files[1..5] (type, size after shrinking ≤ 1 MB), turnstileToken | signed upload URLs | `UPLOAD_REJECTED`, `RATE_LIMITED` (RL-upload), `BOT_CHECK_FAILED` | public |
| Submit request | `site/custom-cake` `submitCustomRequest` | as contract | redirect `/order/:token/confirmed` | `UPLOAD_REJECTED` (object missing/wrong MIME/over 1 MB/over 5), `DATE_UNAVAILABLE`, `VALIDATION_FAILED`, `RATE_LIMITED` (RL-request), `BOT_CHECK_FAILED` | public |
| View request/quote | `site/tracking` loader | token | order, `quote { amountRs, note, expiresOn, canRespond }`, `canCancel` | `NOT_FOUND` | token, RL-track |
| Cancel | `site/tracking` `cancel` | version | ok | `CANCEL_NOT_ALLOWED`, `ORDER_CHANGED` | token |
| Accept quote | `site/tracking` `acceptQuote` | version | ok, status approved | `QUOTE_EXPIRED`, `INVALID_TRANSITION`, `ORDER_CHANGED` | token |
| Decline quote | `site/tracking` `declineQuote` | version | ok, status closed | `INVALID_TRANSITION`, `ORDER_CHANGED` | token |
| Send / re-send quote | `admin/order` `sendQuote` | version, amountRs (≥ 1), note ≤ 1000, expiresOn ≥ today | ok, order | `INVALID_TRANSITION` (status not quote_needed/quote_sent), `ORDER_CHANGED`, `VALIDATION_FAILED` | admin |
| Decline request | `admin/order` `decline` | version, reason ≤ 500 | ok | `INVALID_TRANSITION`, `ORDER_CHANGED` | admin |
| Expire quotes | job `expireQuotes` | none | JobReport | n/a | system |

Server behaviours that the contract implies and tests must pin:
- `submitCustomRequest` verifies each `photoPaths` object exists under the `uploadSessionId` prefix, MIME and size, then writes `custom_request_photo` rows (sort_order 0..4). A replay with the same `idempotencyKey` returns the original redirect and creates nothing.
- `sendQuote` sets `total_rs` = `quote_amount_rs` (full total incl. delivery; there is no separate delivery line for quotes). It writes quote columns, event `quote_sent` (on re-quote, event details hold the previous amount/note/expiry), queues "Your quote" with `dedupe_key = order:<id>:quote:v<version>` so a re-send is a new email, and bumps `version`.
- `acceptQuote`: allowed only when status is `quote_sent` and `todayMU <= quote_expires_on`; sets `approved`, event `quote_accepted`, queues "Order confirmed", alerts admins. Availability of the date is not re-checked on accept (the admin priced a specific date; blocking never touches existing orders, FR-059).
- A quote is valid through 23:59:59 Mauritius time on `quote_expires_on`.

## Data Model Changes
No new tables or columns. Uses `custom_request`, `custom_request_photo`, `orders.version/status/total_rs`, `order_event`, `email_outbox`, `settings.quote_validity_days` (default 5). Proposal only if lead-backend agrees: none required. Retention of reference photos (90 days after final status) is already in data-model.md "Data classes & retention".

## Permissions matrix
| Action | Anonymous | Customer (token holder) | Customer account | Admin | Owner |
|---|---|---|---|---|---|
| Submit request (Turnstile, rate-limited) | ✓ | ✓ | ✓ (prefilled) | n/a | n/a |
| View own request/quote by token | ✗ | ✓ | ✓ | n/a | n/a |
| Cancel (quote_needed only) / accept / decline quote | ✗ | ✓ | ✓ (same token) | ✗ | ✗ |
| View request photos | ✗ | ✗ (not shown on tracking) | ✗ | ✓ (signed URL) | ✓ |
| Send / re-send quote, decline request | ✗ | ✗ | ✗ | ✓ | ✓ |
A customer account gives no extra rights over an order beyond its token (FR-039). Quote amount changes are server-side only.

## Analytics Events
Privacy-friendly, no PII, no tracking cookies (NFR-011). Counted server-side from order events; no client SDK.
| Event | Trigger | Properties |
|---|---|---|
| custom_request_submitted | request created | photoCount, fulfilment, hasBudget, fromGallery |
| quote_sent | first quote | hoursSinceRequest, expiryDays |
| quote_resent | re-quote | previousExpired: false |
| quote_accepted / quote_declined / quote_expired | outcome | hoursSinceQuote |
| request_declined | admin declines | hasReason |
| photo_rejected (client) | rejected photo | reason: type, size, toodetailed |

## Edge Cases
- Double tap / retry on submit: one order (idempotency key). Retry after network drop re-uses already uploaded paths.
- Photo upload partially fails: the form stays, failed tile offers retry; submit is blocked until every tile is uploaded or removed.
- Orphan uploads (form abandoned): purged after 24 h by the `purge` job.
- Same file twice: allowed; counts twice.
- Zero photos: allowed.
- Date becomes blocked/too soon between page load and submit: `DATE_UNAVAILABLE` with reason; form kept.
- Customer cancels while admin is sending a quote: whoever commits first wins; the other gets `ORDER_CHANGED` (customer) or `INVALID_TRANSITION` (admin) with reload.
- Re-quote while the customer has the old page open: old Accept returns `ORDER_CHANGED` ("This quote was updated, reload"); the old email's buttons open the tracking page, which always shows the current quote (FR-033).
- Customer opens the quote on its expiry day: still valid until 23:59 MU. On the day after, Accept returns `QUOTE_EXPIRED` even if the hourly job has not yet run; the page shows the expired message and the job closes it on its next tick (at the 00:00 MU tick or later).
- Admin sets an expiry later than the event date: allowed with a warning in the sheet.
- Quote amount 0 or over Rs 1,000,000: rejected.
- Customer without email? Email is required on the request form, so every request can receive its quote.
- Email provider outage: request is still saved and admins alerted; "Request received" and "Your quote" retry from the outbox (FR-074). Admin sees an `email_failed` event on order detail after 6 failed tries and can send the quote link via WhatsApp.
- Rate limits: 3 requests per 10 min per IP; 20 upload-URL requests per 10 min per IP.
- Big French strings on buttons at 320 px must wrap, not scroll sideways.

## Acceptance Criteria
- AC1: Given a valid form with 2 photos, when submitted, then an order of source custom_request exists with status Quote needed, number APB-nnnn, 2 photo rows, event `created`, and the customer is shown the confirmation with tracking link.
- AC2: Given the submit in AC1, then within 10 s admins with alerts on receive a push and email and the request shows in To review with its photos.
- AC3: Given the customer's language is FR, when submitted, then "Request received" is sent in French.
- AC4: Given two rapid submits with one idempotency key, then exactly one order exists.
- AC5: Given a PDF is chosen, then it is rejected client-side with the allowed-types message, and a crafted `submitCustomRequest` pointing at such an object returns `UPLOAD_REJECTED`.
- AC6: Given an 8 MB HEIC, when chosen, then it is converted and stored as a JPEG/WebP of at most 1 MB (target ≤ 300 KB).
- AC7: Given an 11 MB JPEG, then it is rejected before upload.
- AC8: Given 5 photos attached, when a 6th is added, then it is blocked client-side; a server call with 6 paths returns `UPLOAD_REJECTED`.
- AC9: Given Quote needed, when an admin sends a quote of Rs 4,500 with default expiry on 2026-11-10, then status is Quote sent, `quote_expires_on` is 2026-11-15, `total_rs` is 4500, event `quote_sent` names the admin, and the customer gets "Your quote" with amount, note, expiry and Accept/Decline.
- AC10: Given Quote needed, when an admin declines with a reason, then status is Declined and "Request declined" includes the reason and a menu link.
- AC11: Given Settings `quote_validity_days` = 3, then the send-quote sheet prefills expiry as today + 3.
- AC12: Given an expiry date in the past, when sending, then `VALIDATION_FAILED` and nothing changes.
- AC13: Given Quote sent and valid, when the customer accepts on the tracking page, then status is Approved, "Order confirmed" is sent with Juice number and payment reminder, admins are alerted, and the order appears on the calendar for its date.
- AC14: Given Quote sent, when the customer declines, then status is Closed, "Quote closed" is sent, and admins get push and email.
- AC15: Given `quote_expires_on` is yesterday, when Accept is called, then `QUOTE_EXPIRED` and status is unchanged.
- AC16: Given `quote_expires_on` is today, then Accept succeeds at 23:59 MU.
- AC17: Given Approved status, when `acceptQuote` is called again, then `INVALID_TRANSITION` (no second email).
- AC18: Given `quote_expires_on` = D, when the job ticks at any time after D 23:59 MU, then status is Closed, event `quote_expired` by system, "Quote closed" email queued, push sent to admins with push on, within 24 h of expiry.
- AC19: Given the job runs twice, then one email and one push only.
- AC20: Given the job runs and a customer accepted a moment earlier (stale read), then the versioned update fails and the order stays Approved.
- AC21: Given an admin with push off, then they receive no expiry push (FR-046).
- AC22: Given Quote sent, when the admin sends a new quote, then the amount, note and expiry are replaced, the old values are in the event, a second "Your quote" is sent, and Accept with the old `version` returns `ORDER_CHANGED`.
- AC23: Given status Approved, when `sendQuote` is called, then `INVALID_TRANSITION`.
- AC24: Given the gallery button "Request something similar", then `/custom-cake?fromGallery=<id>` shows the photo attached and it is saved as photo 1 on submit.
- AC25: Given a customer session, when opening `/admin`, then refused (FR-039); given a wrong tracking token, then "not found".

## Non-functional
- Performance: `/custom-cake` within project.yaml budgets (JS ≤ 170 kB gz initial); HEIC decoder and compressor lazy-loaded on first photo pick; each photo shrinks in under 3 s on a mid-range phone; submit action p95 ≤ 800 ms excluding uploads.
- Accessibility: WCAG 2.2 AA; labelled fields; photo tiles are buttons with names ("Remove photo 2"); upload progress announced politely; errors linked to fields; 44 px targets; quote Accept/Decline reachable by keyboard; destructive Decline/Cancel confirm in a dialog.
- Security: Turnstile + rate limits on public actions; MIME verified by signature client-side and by storage bucket restrictions server-side; private `request-photos` bucket, admin views via 10-min signed URLs; token long and random; amounts only from the server.
- Privacy: request holds name, phone, email, address and photos (may show faces or homes); visible to admins only; photos deleted 90 days after final status `[TO CONFIRM]`; photo location metadata stripped by re-encoding; emails carry first name and order number only where possible.

## Rollout / flags
Flag: none · Rollout: part of launch (Phase 4) · Rollback: standard redeploy; quotes in flight keep working because state is in the database.

## Open Questions
- Should the gallery photo copied in via "Request something similar" be copied into `request-photos` or referenced from `public-images`? Spec assumes referenced (`source_gallery_photo_id`) and counted toward the 5 — owner lead-backend.
- Should a customer be able to cancel a Quote sent request (FR-027 says no; they can Decline, which closes it)? Assumed no — owner product-director.
- Late accept on a date that has since been blocked is allowed (assumed). Confirm with owner Sabera.

## Open contract changes (applied 2026-11-10)
1. `admin/order` loader: add `quoteDefaults: { expiresOn: MuDate }` (today + `quote_validity_days`) so the sheet does not recompute on the client. — **Resolved in contracts.md (2026-11-10).**
2. `site/tracking` `acceptQuote` / `declineQuote`: explicitly state the `QUOTE_EXPIRED` check uses `todayMU > quote_expires_on` and runs before the version check. — **Resolved in contracts.md (2026-11-10).**
3. `site/custom-cake` `submitCustomRequest`: `photoPaths` plus `galleryPhotoId` together must be ≤ 5; add to the `UPLOAD_REJECTED` description. — **Resolved in contracts.md (2026-11-10).**
4. `admin/order` `sendQuote`: `amountRs` must be ≥ 1 (domain rule, not the zod `Rs` default). — **Resolved in contracts.md (2026-11-10).**
