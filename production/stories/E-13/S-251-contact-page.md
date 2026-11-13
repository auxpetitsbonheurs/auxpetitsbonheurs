# S-251: Contact us page
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md#content-pages-fr-010 (Contact) · Settings: E-03 S-058
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, copywriter

## Story
As a customer, I want to reach the bakery by WhatsApp or phone and know where to collect and when it is open, so that I can ask a question or plan my pickup.

## Acceptance Criteria
- [x] AC1 (FR-079): Given Settings and page content, when `/contact` (and `/fr/contact`) loads, then it shows `h1` "Contact us"/"Contact", the intro, a WhatsApp button, a phone link (`tel:`), the pickup area "Beau Bassin" with the address from Settings when set, and the opening hours text.
- [x] AC2 (FR-079): Given the WhatsApp number in Settings, when I press WhatsApp, then a `wa.me` chat opens with a pre-filled greeting in the visitor's language; given no WhatsApp number or phone in Settings, then that button is omitted and the page still shows area and hours.
- [x] AC3 (FR-079): Given a map URL in Settings (http or https only), then a "View on map"/"Voir sur la carte" link opens it in a new tab; given none, then no map link shows (no embedded map and no third-party script).
- [x] AC4 (FR-079, amended 2026-11-13): Given the page, then there is no contact form; the email shows as a `mailto:` link only when Settings has one, the same value the footer shows (it was omitted until the custom domain; the footer already showed it, which was inconsistent).
- [x] AC5 (FR-079, NFR-007): Given a missing FR hours or area text, then EN shows for that field; the opening hours and pickup note are plain text with line breaks (escaped).
- [x] AC6 (FR-079): Given the values in Settings change, then Contact shows them on the next request after the cache window (60 s); given placeholder content, then the Beau Bassin area line shows and exact address is omitted until the Owner enters it.
- [x] AC7 (FR-079): Given the page read fails, then an error state with Retry shows.
- [x] AC8 (FR-079, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then buttons are >= 44 px with distinct names ("Message us on WhatsApp", "Call +230 ..."), the phone number is real text, external links say "(opens in a new tab)", no horizontal scroll, AA contrast, one `h1`.
- [x] AC9 (FR-081): Given the page, then LocalBusiness data is not added unless the address and hours are real (not placeholder); see S-253.

## Tests
- AC1 → src/app/routes/site/contact.test.tsx
- AC2 → src/app/routes/site/contact.test.tsx, src/app/lib/contact.test.ts
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

## Build notes (2026-11-12)
- Built: `routes/site/contact.tsx` at `/contact` and `/fr/contact` (replaces the batch A placeholder). Loader reads Settings through the isolate cache (`getSiteSettings`, 60 s) and the placeholder flag from `server/seo-pages.server.ts`. Cards: "Message or call us" (WhatsApp primary, `tel:` outline with the number as text), "Pickup" (Beau Bassin line, exact address only when Settings holds more than the area name, pickup note, map link), "Opening hours". One column on phones, two from md.
- AC2: `whatsappHref(number, text)` in `lib/contact.ts` pre-fills the greeting in the page language. No WhatsApp and no phone: the reach card is left out; pickup and hours remain.
- AC3: `safeWebUrl` keeps only http/https map URLs; the link opens in a new tab with "(opens in a new tab)" for screen readers and `rel="noopener noreferrer"`.
- AC4: the loader never reads the Settings email; no form.
- AC4 amended (leftovers job, 2026-11-13): the footer showed the Settings email on every page while Contact omitted it. Both now read `settings.footer.email` (blank = omitted), so the page and the footer always agree; the Owner clears the Settings value to hide it everywhere.
- AC7: `components/site/page-error.tsx` (`SitePageError`, reusable by S-248..S-250): h1, alert, Retry, WhatsApp.
- AC9: `bakeryJsonLd` emits `Bakery` JSON-LD only when the page is not placeholder AND an exact address exists; no rating.
- **Since S-245 (integrated 2026-11-12):** intro, hours and pickup note are the stored `contact` page (admin Pages), seeded with this same copy; a failed read is the error state (503). Superseded:  intro, hours and pickup note come from the i18n catalogue (`contactPage.intro|hours|pickupNote`, neutral copy, EN fallback per field) via `placeholderText()` in the route. When S-245 merges, replace `placeholderText(locale)` with the `site_page` read for key `contact` and drop those three catalogue keys. `isPlaceholder` is already read from the shared seam.
- Tests: `app/lib/contact.test.ts`, `app/routes/site/contact.test.ts`, `app/routes/site/contact.test.tsx`, `tests/e2e/content-pages.spec.ts` (src/ paths). The story's `lib/whatsapp.test.ts` is `lib/contact.test.ts` (the helper already lived there).
