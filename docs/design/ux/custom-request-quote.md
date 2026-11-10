# UX Flow — Custom cake request and quote

PRD: FR-009, 028..033, 070, 072 · Journey: J5 · Specs: `custom-requests-quotes`, `notifications`, `admin-orders` · Personas: P1 customer; P2/P3 admin · Critical journey: yes · Updated: 2026-11-10

## Goal
Customer describes a bespoke cake, gets a price, and accepts it. Success = Approved order on the admin calendar (or a clean Closed/Declined outcome with no dangling state).

## Entry points
- Gallery photo "Request something similar" (`/custom-cake?fromGallery=<uuid>`); home "Custom cake" button; menu/FAQ link; WhatsApp.
- Quote email link / tracking page `/t/:token` for the response step.

## Happy path
```mermaid
flowchart TD
  A[Gallery / Home] --> B[/custom-cake form]
  B --> C[Upload up to 5 photos]
  C --> D[Submit request]
  D -->|errors| B
  D -->|ok| E[Confirmed: Request received + tracking link]
  E --> F[Admin: Quote needed]
  F --> G{Admin}
  G -->|Send quote| H[Quote sent: email Your quote]
  G -->|Decline + reason| X[Declined email]
  H --> I{Customer}
  I -->|Accept| J[Approved on calendar]
  I -->|Decline| K[Closed]
  I -->|No reply by expiry| L[Auto Closed + Quote closed email]
  H --> M[Admin re-quotes: old quote void]
  M --> H
```
| # | Screen | Action | System response |
|---|---|---|---|
| 1 | `/custom-cake` | Fill occasion, date, servings, flavours, theme/colours, text on cake, optional budget, pickup/delivery, contact, details | Same date rules as checkout; gallery photo pre-attached if from gallery |
| 2 | same | Add photos (JPEG/PNG/WebP/HEIC) | Shrunk to <= 300 kB in browser; per-photo progress; thumbnails with remove; count "3 of 5" (gallery photo counts) |
| 3 | same | Tick policies, Send | Idempotent; redirect to `/order/:token/confirmed` ("Request received", not an order yet) |
| 4 | Admin `/admin/orders/:id` | Review photos, Send quote (amount incl. delivery, note, expiry default today + 5) | Status Quote sent; email "Your quote" |
| 5 | `/t/:token` or email | Read amount, note, expiry; Accept / Decline | Accept: Approved, calendar, admin alert. Decline: Closed |

## Alternative and error paths
| Trigger | What the user sees | Recovery |
|---|---|---|
| PDF/other file, >10 MB source, 6th photo | `UPLOAD_REJECTED`: "Photos only (JPEG, PNG, WebP, HEIC), up to 5" at the uploader | Remove/replace; other fields kept |
| Upload fails mid-way | Per-photo "Retry" | Retry or remove; Send disabled while uploading |
| Date unavailable | `DATE_UNAVAILABLE` at date field with reason | Pick another |
| Invalid servings (1..500), text >200 | Inline | Fix |
| Network/5xx on send | "Not sent; your photos and answers are kept" | Retry, same key |
| Bot check / rate limit | Friendly retry message | Wait |
| Accept after expiry | `QUOTE_EXPIRED`: "This quote has ended. Contact us on WhatsApp for a new one" | WhatsApp button |
| Accept an old quote after re-quote | Page shows only the newest quote; old link says "replaced" | Use latest |
| Double tap Accept / two tabs | Second gets `ORDER_CHANGED`; page refreshes to Approved | None |
| Admin declines | Customer email + tracking shows reason | Start a new request / WhatsApp |
| Admin cancels while quote_sent | Allowed (owner Q6): quote withdrawn, tracking shows Cancelled, cancellation email sent | None |
| Date blocked after quote sent | Customer may still accept (owner-approved Q10); admin sees warning | Admin follows up |
| Admin sees expired quote | Auto-closed within 24 h, push + email to admins | Re-request |

## States per screen
- Loading: upload progress bars; send button spinner.
- Empty (admin): To review tab empty = "Nothing to review. Enjoy the quiet."
- Permission: customer routes public/token; admin actions need admin session (customer session redirected to `/admin/login`).

## EN/FR notes
Form labels, quote email, tracking text bilingual; admin's own note to customer is free text written in the order's language (hint under the field shows the customer's language). Quote expiry shown as a date ("Valid until 14 Nov").

## Accessibility notes
- Uploader is a real file input with label + keyboard "Add photos"; thumbnails have alt "Reference photo n"; remove buttons named "Remove photo n".
- Errors announced via live region; Accept/Decline are buttons (not links) with confirm dialog.
- Photo count and progress exposed with `aria-live=polite`.

## Analytics events
custom_form_started, custom_request_sent, quote_accepted, quote_declined, quote_expired (counts).

## Open questions
- Late acceptance after day blocked (Q10): allowed. Cancelling a sent quote (Q6): allowed for admins (owner decisions 2026-11-10).
