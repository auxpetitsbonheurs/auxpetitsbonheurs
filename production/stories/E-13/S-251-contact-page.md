# S-251: Contact us page
Status: ready
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md#content-pages-fr-010 (Contact) · Settings: E-03 S-058
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, copywriter

## Story
As a customer, I want to reach the bakery by WhatsApp or phone and know where to collect and when it is open, so that I can ask a question or plan my pickup.

## Acceptance Criteria
- [ ] AC1 (FR-079): Given Settings and page content, when `/contact` (and `/fr/contact`) loads, then it shows `h1` "Contact us"/"Contact", the intro, a WhatsApp button, a phone link (`tel:`), the pickup area "Beau Bassin" with the address from Settings when set, and the opening hours text.
- [ ] AC2 (FR-079): Given the WhatsApp number in Settings, when I press WhatsApp, then a `wa.me` chat opens with a pre-filled greeting in the visitor's language; given no WhatsApp number or phone in Settings, then that button is omitted and the page still shows area and hours.
- [ ] AC3 (FR-079): Given a map URL in Settings (http or https only), then a "View on map"/"Voir sur la carte" link opens it in a new tab; given none, then no map link shows (no embedded map and no third-party script).
- [ ] AC4 (FR-079): Given the page, then there is no contact form and no email address or `mailto:` link (until a custom domain exists, Resend deferred).
- [ ] AC5 (FR-079, NFR-007): Given a missing FR hours or area text, then EN shows for that field; the opening hours and pickup note are plain text with line breaks (escaped).
- [ ] AC6 (FR-079): Given the values in Settings change, then Contact shows them on the next request after the cache window (60 s); given placeholder content, then the Beau Bassin area line shows and exact address is omitted until the Owner enters it.
- [ ] AC7 (FR-079): Given the page read fails, then an error state with Retry shows.
- [ ] AC8 (FR-079, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then buttons are >= 44 px with distinct names ("Message us on WhatsApp", "Call +230 ..."), the phone number is real text, external links say "(opens in a new tab)", no horizontal scroll, AA contrast, one `h1`.
- [ ] AC9 (FR-081): Given the page, then LocalBusiness data is not added unless the address and hours are real (not placeholder); see S-253.

## Tests
- AC1 → src/app/routes/site/contact.test.tsx
- AC2 → src/app/routes/site/contact.test.tsx, src/app/lib/whatsapp.test.ts
- AC3 → src/app/routes/site/contact.test.tsx
- AC4 → src/app/routes/site/contact.test.tsx
- AC5 → src/app/routes/site/contact.test.tsx
- AC6 → src/app/routes/site/contact.test.ts
- AC7 → src/app/routes/site/contact.test.tsx
- AC8 → src/tests/e2e/content-pages.spec.ts
- AC9 → src/app/routes/site/contact.test.ts

## Notes
- Contact details (WhatsApp, phone, address, map) come from Settings (Owner only, S-058); opening hours and area note are page text edited by Owner or Admin (S-246). Hours as free text per language (open question Q8).
- Supersedes the Contact half of E-04 S-070.
- Depends on: S-245, S-058, S-061 (shared contact helpers).
