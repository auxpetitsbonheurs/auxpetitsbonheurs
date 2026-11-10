# S-071: Titles, descriptions, share previews and sitemap
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#acceptance-criteria
Estimate: 2 pts
Owner: seo-specialist, remix-specialist

## Story
As the bakery owner, I want my pages to show good titles and photo previews when shared or searched, so that customers find and click my cakes on WhatsApp and Google.

## Acceptance Criteria
- [ ] AC1 (NFR-010): Given a product page, when rendered, then `<title>`, meta description, `og:title`, `og:description`, `og:image` (main photo; brand default if none), canonical and `hreflang` en/fr/x-default are present in the page locale.
- [ ] AC2 (NFR-010): Given Home, Menu, Gallery, About, Contact and FAQ, when rendered, then each has a unique title and description in EN and FR and `<html lang>` matches.
- [ ] AC3 (NFR-010): Given token routes (`/t/:token`, `/order/:token/*`) and admin routes, when requested, then `robots` is `noindex` and they are excluded from the sitemap.
- [ ] AC4 (NFR-010): Given `/sitemap.xml`, when requested, then it lists EN and FR URLs of home, menu, live products (not hidden or out of season), gallery, about, contact, faq, with `hreflang` alternates.
- [ ] AC5 (NFR-010): Given a hidden product, when its URL is requested, then 404 and no meta tags expose its name.
- [ ] AC6 (NFR-010): Given Lighthouse SEO on Home, Menu and a product page, when run, then score >= 95.

## Tests
- AC1 → src/app/routes/site/seo.test.ts
- AC2 → src/app/routes/site/seo.test.ts
- AC3 → src/app/routes/site/seo.test.ts
- AC4 → src/app/routes/sitemap.test.ts
- AC5 → src/app/routes/site/seo.test.ts
- AC6 → src/tests/e2e/perf-budgets.spec.ts (Lighthouse SEO)

## Notes
- No UI of its own, so no a11y ACs. Sitemap is Could in the spec; included since cheap and NFR-010 asks for SEO >= 95; first to drop if a sprint is tight.
- Depends on S-064, S-065 and E-01 i18n.
