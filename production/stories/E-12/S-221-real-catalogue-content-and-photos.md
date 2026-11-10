# S-221: The real menu, prices and photos replace the sample data
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#11-release-plan
Estimate: 3 pts
Owner: ui-engineer, baas-specialist

## Story
As the Owner, I want my real products, prices and photos on the site, so that customers see my actual bakery at launch.

## Acceptance Criteria
- [ ] AC1 (NFR-009): Given the Owner's real products (types, sizes, flavours, add-ons, prices, notice, seasonal windows), when entered through the admin Menu, then the live and staging catalogue contains them and the sample data is removed or hidden; the count entered equals the Owner's signed-off list.
- [ ] AC2 (NFR-001, NFR-009): Given each real photo, then it is compressed to <= 300 kB at <= 1600 px, has alt text (product name by default), and total stored photos stay under 1 GB of the free plan.
- [ ] AC3 (NFR-007): Given each product and gallery item, then name and description exist in both EN and FR (customer-visible fields stored in both languages).
- [ ] AC4 (FR-011, NFR-008): Given each price, then it is a whole rupee amount shown as "Rs 1,250" and the delivery fee is Rs 200 as set by the Owner.
- [ ] AC5 (NFR-001): Given the real home and menu pages on a mid-range phone over 4G, then images are lazy-loaded below the fold with explicit dimensions and no layout shift above 0.1.
- [ ] AC6 (NFR-009): Given a photo that exceeds 1 MB or is not an image, then the upload is rejected with a friendly error and nothing is stored.
- [ ] AC7 (NFR-004): Given the gallery photos, then no photo shows a customer's face or address without the Owner's confirmation recorded in the sign-off list.

## Tests
- AC1 → production/audits/content-sign-off.md
- AC2 → production/audits/content-sign-off.md
- AC3 → src/app/i18n/catalogue-parity.test.ts
- AC4 → src/tests/e2e/launch-content.spec.ts
- AC5 → production/audits/perf-real-phone.md
- AC6 → src/app/routes/admin/upload.test.ts
- AC7 → production/audits/content-sign-off.md

## Notes
- Needs Owner time (epic risk: real content arriving late). Content is entered by the Owner/builder through the admin, not in code.
- Dependencies (R9): E-03, E-04, E-05. Not yet done; expected.
