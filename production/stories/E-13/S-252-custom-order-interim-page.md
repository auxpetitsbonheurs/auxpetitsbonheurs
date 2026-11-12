# S-252: Custom order page (interim, until the request form)
Status: ready
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/custom-requests-quotes.md · Epic: E-08-custom-requests-quotes (S-151 form)
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist, copywriter

## Story
As a customer who wants a bespoke cake, I want to understand how custom orders work and reach the bakery easily, so that I can start my request even before an online form exists.

## Acceptance Criteria
- [ ] AC1 (FR-080): Given the stored page, when `/custom-cake` (and `/fr/custom-cake`) loads, then it shows `h1` "Custom order"/"Gâteau sur mesure", intro, body (what a custom cake is, how it works, notice needed) and up to 3 photos, with EN fallback per field.
- [ ] AC2 (FR-080): Given the page, then a primary "Contact us on WhatsApp"/"Nous contacter sur WhatsApp" button opens a `wa.me` chat with a pre-filled message in the visitor's language ("Hello, I'd like a custom cake."); given no WhatsApp number in Settings, then the phone number or a `/contact` link shows instead.
- [ ] AC3 (FR-080): Given the custom request form is not live (E-08 S-151 not released), then the page has no form; given S-151 ships, then the form replaces the WhatsApp-only call to action on the same route and the explanation stays (WhatsApp stays as a secondary link).
- [ ] AC4 (FR-080): Given the "Request something similar" link from the gallery (E-04 S-069, `?fromGallery=`), then the interim page ignores the parameter safely and shows the same content.
- [ ] AC5 (FR-080): Given placeholder content, then it is neutral (no prices or lead times that could mislead); the notice period text is read from Settings default notice days when shown ("at least 3 days"), never typed twice.
- [ ] AC6 (FR-080, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then the button is >= 44 px with a distinct name, no horizontal scroll, AA contrast, one `h1`; given the read fails, then an error state with Retry and WhatsApp shows.

## Tests
- AC1 → src/app/routes/site/custom-order.test.tsx
- AC2 → src/app/routes/site/custom-order.test.tsx, src/app/lib/whatsapp.test.ts
- AC3 → src/app/routes/site/custom-order.test.tsx
- AC4 → src/app/routes/site/custom-order.test.ts
- AC5 → src/app/routes/site/custom-order.test.tsx
- AC6 → src/tests/e2e/content-pages.spec.ts

## Notes
- Route and sitemap slug `/custom-cake` from docs/content/sitemap.md; nav label is "Custom order".
- Existing custom-cake epic: E-08 (S-151 form, S-154 request from gallery). This page is E-13's, the form is E-08's.
- Depends on: S-245, S-248 (`SitePageView`).
