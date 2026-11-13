# S-276: Photos come in phone sizes (responsive photo sizes)
Status: in-progress
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#non-functional
Estimate: 5 pts
Owner: performance-engineer, remix-specialist, baas-specialist, security-lead (upload checks)
Origin: S-063 AC6 and S-254 AC3 (LCP ~2.8 s on photo pages, every card loading the 1600 px photo)

## Story
As a customer on a phone over 4G, I want each photo to download at the size my screen shows it, so that the menu, gallery and home page appear quickly and do not use up my data.

## Acceptance Criteria
- [x] AC1 (NFR-001, NFR-009): Given an admin adds a product photo (S-047), a brand page photo (S-247) or a Settings hero/About image (S-059), when the browser has compressed it, then the same decoded image also gives 480 px and 960 px wide copies (only widths narrower than the photo), in the photo's own type (WebP, or JPEG where the browser cannot write WebP), smaller than the photo and without metadata; this code stays in the lazily loaded compression chunk (no editor route grows by more than 0.2 kB gz).
- [x] AC2 (FR-029, FR-062, security): Given the photo is uploaded, when its copies are uploaded, then they get signed URLs only for `<stem>-480w.<ext>` / `<stem>-960w.<ext>` beside an original issued to the same admin, session and scope, with the original's type, ≤ 1 MB; and when the form is saved, each copy found beside a new photo passes the same checks as the original (size, declared type, magic bytes) and must have the original's type: its width is stored with the row; a missing copy is left out; a copy that fails the checks refuses the save (`UPLOAD_REJECTED`) like a bad original. A kept photo keeps its stored widths.
- [x] AC3 (NFR-001): Given a photo with copies, when any customer page shows it (menu cards, Home hero, category cards, product rows and gallery preview, product page viewer, gallery page, Our story / Workshops / Custom order photos), then the `<img>` has `srcset` (copies, then the original, with their widths) and `sizes` for that place, explicit width/height; the LCP image (Home hero, first menu card, first gallery tile, product photo) is not lazy and has `fetchpriority="high"` (the Home hero preload carries the same `imagesrcset`/`imagesizes`), and photos below the fold are lazy. Basket and admin thumbnails load the smallest copy.
- [x] AC4 (UX): Given a photo without copies (stored before this story, a copy upload that failed, an old cached menu), when shown, then the original is used with no `srcset` and nothing looks broken; a copy that fails to encode or upload never fails or delays the photo beyond its own small upload and is never announced as an error.
- [x] AC5 (data): Given migration 0011, when applied, then `product_photo`, `gallery_photo`, `site_page_photo` have `variant_widths smallint[] NOT NULL DEFAULT '{}'` and `settings` has `hero_image_variants`, `about_image_variants` (same); additive and forward-only.
- [x] AC6 (S-045 AC6): Given a photo is removed (product deleted, photo removed on save, page photo or Settings image replaced, or retried by the `storage_purge` job), when Storage is asked, then the original and every possible copy are removed (a copy never made is a no-op).
- [ ] AC7 (NFR-001): Given staging on a Pixel 7 profile (412×915 @2.625, Lighthouse simulated slow 4G, 4× CPU, median of 3), when `/`, `/menu`, `/gallery` and a product page are measured before and after, then image bytes drop and LCP is at or under 2.5 s on each (see Notes for the measured numbers).
- [x] AC8 (ops): Given photos stored before this story, when the manual `photo-variants` workflow runs, then it is bound to the `staging` GitHub Environment, uses only STAGING_* secrets, refuses any APP_ENV but staging, makes the missing copies with sharp in CI (never in the Worker), records the widths that pass the save checks, reuses copies an earlier run stored, and a second run changes nothing.

## Tests
- AC1 → src/app/lib/image-compress.test.ts ("S-276 AC1" ×2, "S-276 AC4"); src/tests/e2e/admin-menu.spec.ts ("S-276 AC1, AC2, AC3"); JS budget: `npm run check:js-budget`
- AC2 → src/app/routes/admin/uploads.test.ts ("S-276 AC2" block); src/app/server/services/save-product.server.test.ts ("smaller copies (S-276 AC2, AC4)"); src/app/server/services/save-site-page.server.test.ts ("S-276 AC2" ×2); src/app/server/services/save-settings.server.test.ts ("S-276 AC2"); src/app/lib/photo-variants.test.ts
- AC3 → src/app/lib/images.test.ts; src/app/routes/site/menu.test.tsx ("S-276 AC3"); src/app/routes/home.test.tsx ("S-276 AC3"); src/app/routes/site/gallery.test.tsx ("S-276 AC3"); src/tests/e2e/admin-menu.spec.ts (product page srcset)
- AC4 → src/app/lib/images.test.ts ("AC4"); src/app/routes/site/menu.test.tsx ("S-276 AC4"); src/app/lib/photo-variants.test.ts (refusals never throw); src/app/lib/image-compress.test.ts ("S-276 AC4")
- AC5 → src/app/db/migrations.test.ts ("S-276 AC5" ×2)
- AC6 → src/app/domain/upload.test.ts ("removals (AC7)"); src/app/jobs/purge-storage.test.ts; src/app/server/services/delete-product.server.test.ts; save-product / save-site-page / save-settings removal tests
- AC7 → manual Lighthouse runs on staging (Notes)
- AC8 → src/app/server/services/photo-variants-backfill.server.test.ts; src/app/lib/photo-variants-workflow.test.ts

## Design
- Copies are named by convention beside the original (`<stem>-480w.<ext>`), so removals need no lookup (`withVariantPaths`); which copies really exist is stored with the row (migration 0011), so a page never points `srcset` at a missing file.
- Widths are widths (not long edges), so the `w` descriptors are exact. `sizes` per place live in `app/lib/photo-sizes.ts`; Chrome's density rounding then picks the 480 copy for two-column phone cards and the 960 copy for full-width phone photos at DPR 2.6.
- Browser: `compressPhoto` returns `variants`; `uploadVariants` (lib/photo-variants.ts, re-exported by the lazy image-compress chunk) asks `admin/uploads` with `variantOf` and PUTs each copy. Best effort.
- Server: `storedVariantWidths` / `checkNewPhoto` (product-photos.server) are shared by the three saves and the backfill.
- Settings images have no stored size: their copies are looked for up to the 1600 px edge and the hero renders `srcset` against the 1600 px box.
- Promotion images are out of scope (promotions job; migration 0012 is theirs).

- Full-width phone photos (hero, product viewer, single page photos) use `90vw` in `sizes`, which caps a 412 px, 2.6x phone near 2.3x: it takes the 960 px copy instead of a 1200 px original only ~10% wider.

## Notes
- 2026-11-13: code on main (81a02d6), CI green (run 43407986032). The staging deploy (run 43410205227, also re-run) did not start: GitHub refused every job with "recent account payments have failed or your spending limit needs to be increased". Until that is fixed, staging runs the old build, so the backfill and the after-measurement (AC7) wait. Owner step: GitHub → Settings → Billing and plans → fix the payment or raise the Actions spending limit; then Actions → deploy → Re-run, then Actions → photo-variants → Run workflow (main).
- Before (staging, Lighthouse 12, Pixel 7 412×915 @2.625, simulated slow 4G + 4× CPU, 3 runs; median): `/` LCP 4.21 s, 727 kB total, 420 kB images · `/menu` 6.30 s, 950 kB, 646 kB images · `/menu/red-velvet` 4.27 s, 512 kB, 215 kB images · `/gallery` 1.83 s, 290 kB, 9 kB images (staging has no gallery photos yet, so nothing to gain there today). The LCP element was the photo on `/`, `/menu` and the product page.
- Expected after (copies made locally from the same staging files with the backfill's settings, sharp q78): the 3 staging photos are 210-231 kB originals; their 480 px copies are 25-35 kB and 960 px copies 81-108 kB. `/menu` cards take the 480 copies: ~94 kB of photos instead of ~646 kB (-85%). Home hero and product photo take the 960 copy: ~81 kB instead of ~210 kB. To be confirmed with the same Lighthouse runs once staging is deployed and backfilled.
- Production: the backfill is staging-only by design; production photos get copies when re-uploaded, or by a later run the Owner approves.
