# S-224: Pretty share previews and good search basics
Status: in-progress
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: seo-specialist

## Story
As a customer sharing a cake on WhatsApp or Instagram, I want the link to show the photo and name, so that friends see what I am talking about.

## Acceptance Criteria
- [x] AC1 (NFR-010): Given home, menu and each product page, then each has a unique title, description, canonical URL and Open Graph/Twitter tags with the product photo and name, in the page language.
- [ ] AC2 (NFR-010): Given a product link pasted into a link-preview checker for WhatsApp/Facebook, then the photo and title appear.
- [ ] AC3 (NFR-010): Given Lighthouse SEO on home, menu and a product page on the live-like staging build, then the score is >= 95.
- [x] AC4 (NFR-010): Given EN and FR pages, then `hreflang` alternates and `<html lang>` are correct and `sitemap.xml` and `robots.txt` exist and exclude `/admin`, `/account`, tracking and order pages (`noindex` there).
- [x] AC5 (NFR-010): Given a renamed product, then the old URL redirects (301) to the new one and the sitemap lists only the new URL.
- [x] AC6 (NFR-010): Given a product with no photo, then a default share image is used and no broken image tag is emitted.
- [x] AC7 (NFR-004): Given a tracking or order link shared, then it is `noindex` and its preview shows no personal data.

## Tests
- AC1 → src/app/routes/meta.test.ts
- AC2 → production/audits/seo-2026.md
- AC3 → production/audits/seo-2026.md
- AC4 → src/app/routes/seo.test.ts
- AC5 → src/tests/e2e/slug-redirect.spec.ts
- AC6 → src/app/routes/meta.test.ts
- AC7 → src/app/routes/seo.test.ts

## Notes
- Audit file takes the actual run date. Slug redirect built in E-03/E-04; AC5 is a regression check only.
- Dependencies (R9): E-03, E-04, S-221. Not yet done; expected.

## Launchprep notes (2026-11-14)
- Product pages get full seoMeta (EN/FR title, description, canonical, OG/Twitter, photo ≤ 1200 px or the brand PNG); home's SVG hero no longer becomes og:image; sitemap lists product pages (visible, in season, current slug); robots.txt disallows basket, order, tracking and account in both languages. Tests: product-meta.test.ts, home-meta.test.ts, sitemap.test.ts. AC2: previews rendered from the real tags (production/audits/seo-2026.md); the Owner pastes a product link into WhatsApp once staging redeploys. AC3: staging fails only is-crawlable (noindex on purpose); re-run Lighthouse SEO on the live site. Domain switch needs no code: docs/runbooks/custom-domain.md.

## Tidy notes (2026-11-14)
- The sitemap now lists the workshop pages `/workshops/:slug` in EN and FR with the same hreflang alternates as products, while published and upcoming (today included, Mauritius date: the page's own `isOpen` rule, so a listed page is never noindex). Past, draft and cancelled events stay out. `/workshops` itself joins once an event is listed (it is indexable then, FR-081). Tests: `src/app/routes/hooks/sitemap.test.ts`, `src/tests/e2e/workshops.spec.ts` ("tidy (S-224)").
