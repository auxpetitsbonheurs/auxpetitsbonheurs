# S-241: Load the Owner's real menu on staging
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#product-editor-sections-order · Source: docs/content/menu-source/README.md
Estimate: 3 pts
Owner: data-engineer, baas-specialist, postgres-specialist, devops-lead

## Story
As the bakery owner, I want my real cookies and cakes already on the staging menu with their photos, sizes and box options, so that I only have to type the missing prices and switch each product on instead of building the menu from nothing.

## Acceptance Criteria
- [ ] AC1 (FR-061, FR-062): Given an empty staging menu (or only the S-011 sample), when `npm run seed:menu` runs with `APP_ENV=staging`, then these 7 products exist: Chocolate chip cookies, Signature Red Velvet Cake, Black Forest Cake, Génoise aux pêches, Chocolate Cake, Vanilla Cake, Pistachio Cake; English names and descriptions are copied from docs/content/menu-source/README.md without emoji; `name_fr` and `description_fr` stay empty (English fallback until the copywriter's French is approved by the Owner).
- [ ] AC2 (FR-062): Given the cookies, then the product has type `dessert`, base price Rs 420, status `available`, and one required single-choice option group "Box" / "Boîte" with choices Box of 6 (+Rs 0), Box of 12 (+Rs 360), Box of 18 (+Rs 660), so the customer prices read Rs 420 / 780 / 1080.
- [ ] AC3 (FR-062): Given each of the 6 cake flavours, then it is its own product of type `cake` with one required single-choice option group "Size" / "Taille" with choices in this order: "6 inch (5–10 people)" / "6 pouces (5 à 10 personnes)", "7 inch (10–15 people)" / "7 pouces (10 à 15 personnes)", "8 inch (15–20 people)" / "8 pouces (15 à 20 personnes)".
- [ ] AC4 (FR-062): Given a product whose price is still a placeholder in the menu source (all 6 cakes today), then it is seeded with base price Rs 0 and every size delta Rs 0, status `hidden`, and the run prints a "Prices to enter" list naming each such product; no placeholder-priced product is ever seeded `available`.
- [ ] AC5 (FR-062, NFR-001, NFR-009): Given the 5 photos in docs/content/menu-source/photos/, then each is resized to at most 1600 px on the long edge and re-encoded to at most 300 kB, uploaded to the `public-images` bucket, and linked as the product's first photo (`sort_order` 0) with its real width and height; Vanilla and Pistachio have no photo and stay `hidden` (a product with no photo cannot be available).
- [ ] AC6 (FR-061): Given the products are seeded, then within each type `sort_order` follows the menu-source order (cakes: Red Velvet, Black Forest, Génoise aux pêches, Chocolate, Vanilla, Pistachio) and slugs are generated from the English name with the same rule as S-046 (`[a-z0-9-]`).
- [ ] AC7 (FR-062): Given the seed ran before, when it runs again, then nothing is duplicated and no product the Owner has edited is changed (insert-only by slug; existing photos are not re-uploaded); the run reports "created" or "already present" per product.
- [ ] AC8 (FR-062): Given the S-011 sample "Chocolate cake" (slug `chocolate-cake`) is still unedited (its sample description and Rs 850 price), then the seed turns that row into the real Chocolate Cake (same id, so existing staging orders keep their link); given the Owner has edited it, then it is left alone and reported.
- [ ] AC9 (NFR-013): Given `APP_ENV=production`, then the seed refuses with a typed error and writes nothing; loading the real menu on production is decided at E-12 (launch content).
- [ ] AC10 (FR-062): Given the manual `seed-menu` GitHub workflow (staging environment only), when it runs, then it uses the staging database URL and Storage service key from the environment's secrets, never prints them, and if a needed secret is missing it names the missing secret and exits without writing.

## Tests
- AC1 → src/app/server/services/seed-menu.server.test.ts
- AC2 → src/app/server/services/seed-menu.server.test.ts
- AC3 → src/app/server/services/seed-menu.server.test.ts
- AC4 → src/app/server/services/seed-menu.server.test.ts
- AC5 → src/app/server/services/menu-photos.server.test.ts (resize and size limit on the real files, Storage client mocked)
- AC6 → src/app/server/services/seed-menu.server.test.ts
- AC7 → src/app/server/services/seed-menu.server.test.ts
- AC8 → src/app/server/services/seed-menu.server.test.ts
- AC9 → src/app/server/services/seed-menu.server.test.ts
- AC10 → src/tests/workflows/seed-menu-workflow.test.ts (workflow file assertions: environment, secret names, no echo)

## Notes
- Depends on: S-046 (product save rules, slug rule), S-047 (`public-images` upload path and the shared resize code), S-048 (option group shape), S-011 (sample product and `seed:sample` pattern).
- Data lives in `src/app/db/menu-data.ts` (dependency-free, like `sample-data.ts`), built from docs/content/menu-source/README.md; each entry carries `pricePlaceholder: boolean`. When the Owner sends prices, update the source README and the data file, or (preferred) the Owner types them in the editor on staging.
- Producer decisions 2026-11-11 (routine, recorded in production/sprints/sprint-02.md): cookies use type `dessert` (the type list has no cookie type; the Owner can change it in the editor); cookie box sizes are option choices with price deltas from the Rs 420 base; emoji are dropped from product names (screen readers, slugs); French text is left empty rather than machine-drafted; placeholder prices are Rs 0 on hidden products so they cannot be ordered.
- Separate manual workflow (not the deploy job) so a redeploy never re-runs it over the Owner's edits. `seed:sample` stays as is for e2e and the skeleton.
- The cake photos are cropped from catalogue screenshots (lower resolution); replace them in the editor when the Owner sends originals.
- Allergens and notice days are not in the source: left empty / Settings default; the Owner fills them in the editor.
