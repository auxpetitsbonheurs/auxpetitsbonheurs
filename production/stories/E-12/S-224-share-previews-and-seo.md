# S-224: Pretty share previews and good search basics
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: seo-specialist

## Story
As a customer sharing a cake on WhatsApp or Instagram, I want the link to show the photo and name, so that friends see what I am talking about.

## Acceptance Criteria
- [ ] AC1 (NFR-010): Given home, menu and each product page, then each has a unique title, description, canonical URL and Open Graph/Twitter tags with the product photo and name, in the page language.
- [ ] AC2 (NFR-010): Given a product link pasted into a link-preview checker for WhatsApp/Facebook, then the photo and title appear.
- [ ] AC3 (NFR-010): Given Lighthouse SEO on home, menu and a product page on the live-like staging build, then the score is >= 95.
- [ ] AC4 (NFR-010): Given EN and FR pages, then `hreflang` alternates and `<html lang>` are correct and `sitemap.xml` and `robots.txt` exist and exclude `/admin`, `/account`, tracking and order pages (`noindex` there).
- [ ] AC5 (NFR-010): Given a renamed product, then the old URL redirects (301) to the new one and the sitemap lists only the new URL.
- [ ] AC6 (NFR-010): Given a product with no photo, then a default share image is used and no broken image tag is emitted.
- [ ] AC7 (NFR-004): Given a tracking or order link shared, then it is `noindex` and its preview shows no personal data.

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
