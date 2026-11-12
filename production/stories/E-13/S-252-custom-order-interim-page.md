# S-252: Custom order page (interim, until the request form)
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/custom-requests-quotes.md · Epic: E-08-custom-requests-quotes (S-151 form)
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist, copywriter

## Story
As a customer who wants a bespoke cake, I want to understand how custom orders work and reach the bakery easily, so that I can start my request even before an online form exists.

## Acceptance Criteria
- [x] AC1 (FR-080): Given the stored page, when `/custom-cake` (and `/fr/custom-cake`) loads, then it shows `h1` "Custom order"/"Gâteau sur mesure", intro, body (what a custom cake is, how it works, notice needed) and up to 3 photos, with EN fallback per field.
- [x] AC2 (FR-080): Given the page, then a primary "Contact us on WhatsApp"/"Nous contacter sur WhatsApp" button opens a `wa.me` chat with a pre-filled message in the visitor's language ("Hello, I'd like a custom cake."); given no WhatsApp number in Settings, then the phone number or a `/contact` link shows instead.
- [x] AC3 (FR-080): Given the custom request form is not live (E-08 S-151 not released), then the page has no form; given S-151 ships, then the form replaces the WhatsApp-only call to action on the same route and the explanation stays (WhatsApp stays as a secondary link).
- [x] AC4 (FR-080): Given the "Request something similar" link from the gallery (E-04 S-069, `?fromGallery=`), then the interim page ignores the parameter safely and shows the same content.
- [x] AC5 (FR-080): Given placeholder content, then it is neutral (no prices or lead times that could mislead); the notice period text is read from Settings default notice days when shown ("at least 3 days"), never typed twice.
- [x] AC6 (FR-080, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then the button is >= 44 px with a distinct name, no horizontal scroll, AA contrast, one `h1`; given the read fails, then an error state with Retry and WhatsApp shows.

## Tests
- AC1 → src/app/routes/site/custom-order.test.tsx
- AC2 → src/app/routes/site/custom-order.test.tsx, src/app/lib/contact.test.ts
- AC3 → src/app/routes/site/custom-order.test.tsx
- AC4 → src/app/routes/site/custom-order.test.ts
- AC5 → src/app/routes/site/custom-order.test.tsx
- AC6 → src/tests/e2e/content-pages.spec.ts

## Notes
- Route and sitemap slug `/custom-cake` from docs/content/sitemap.md; nav label is "Custom order".
- Existing custom-cake epic: E-08 (S-151 form, S-154 request from gallery). This page is E-13's, the form is E-08's.
- Depends on: S-245, S-248 (`SitePageView`).

## Build notes (2026-11-12)
- Built: `routes/site/custom-order.tsx` at `/custom-cake` and `/fr/custom-cake` (replaces the batch A placeholder). Header with h1, intro and the call to action; "What is a custom cake?", "How it works" (3 numbered steps), "When to ask" (notice from Settings `default_notice_days`, plural-aware, "as early as you can" at 0); the call to action repeats at the end.
- AC2: "Contact us on WhatsApp" pre-fills "Hello, I'd like a custom cake." / "Bonjour, je voudrais un gâteau sur mesure."; no WhatsApp → "Call +230 …"; neither → link to Contact us.
- AC4: the loader ignores the query; canonical has no query (S-253).
- AC5: `SiteSettings.noticeDays` added to the cached Settings read (one source, never typed twice).
- **AC1 (integrated with S-245/S-247, 2026-11-12):** intro, body and up to 3 photos come from the stored `custom_order` page (admin Pages; seeded with the copy below); `custom-order.test.tsx` covers the photos. Superseded:  no photos are shown yet: the photos come from `site_page_photo` (S-245/S-247). The intro and body come from the i18n catalogue (`customOrderPage.intro`, `customOrderPage.what`) via `placeholderText()` until S-245; swap it for the `site_page` read for key `custom_order` and render its photos (max 3) when S-245/S-248 (`SitePageView`) land.
- AC3: no form; when E-08 S-151 ships, `CallToAction` is the place the form replaces (WhatsApp becomes secondary).
- Tests: `app/routes/site/custom-order.test.ts`, `app/routes/site/custom-order.test.tsx`, `app/lib/contact.test.ts`, `tests/e2e/content-pages.spec.ts`.
