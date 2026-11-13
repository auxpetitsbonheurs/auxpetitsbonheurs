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
- [x] AC7 (NFR-001): Given staging on a Pixel 7 profile (412×915 @2.625, Lighthouse simulated slow 4G, 4× CPU, median of 3), when `/`, `/menu`, `/gallery` and a product page are measured before and after, then image bytes drop and LCP is at or under 2.5 s on each (see Notes for the measured numbers; closed 2026-11-13 by Seoul placement and deferred hydration, 366dcd3).
- [x] AC8 (ops): Given photos stored before this story, when the manual `photo-variants` workflow runs, then it is bound to the `staging` GitHub Environment, uses only STAGING_* secrets, refuses any APP_ENV but staging, makes the missing copies with sharp in CI (never in the Worker), records the widths that pass the save checks, reuses copies an earlier run stored, and a second run changes nothing.

## Tests
- AC1 → src/app/lib/image-compress.test.ts ("S-276 AC1" ×2, "S-276 AC4"); src/tests/e2e/admin-menu.spec.ts ("S-276 AC1, AC2, AC3"); JS budget: `npm run check:js-budget`
- AC2 → src/app/routes/admin/uploads.test.ts ("S-276 AC2" block); src/app/server/services/save-product.server.test.ts ("smaller copies (S-276 AC2, AC4)"); src/app/server/services/save-site-page.server.test.ts ("S-276 AC2" ×2); src/app/server/services/save-settings.server.test.ts ("S-276 AC2"); src/app/lib/photo-variants.test.ts
- AC3 → src/app/lib/images.test.ts; src/app/routes/site/menu.test.tsx ("S-276 AC3"); src/app/routes/home.test.tsx ("S-276 AC3"); src/app/routes/site/gallery.test.tsx ("S-276 AC3"); src/tests/e2e/admin-menu.spec.ts (product page srcset)
- AC4 → src/app/lib/images.test.ts ("AC4"); src/app/routes/site/menu.test.tsx ("S-276 AC4"); src/app/lib/photo-variants.test.ts (refusals never throw); src/app/lib/image-compress.test.ts ("S-276 AC4")
- AC5 → src/app/db/migrations.test.ts ("S-276 AC5" ×2)
- AC6 → src/app/domain/upload.test.ts ("removals (AC7)"); src/app/jobs/purge-storage.test.ts; src/app/server/services/delete-product.server.test.ts; save-product / save-site-page / save-settings removal tests
- AC7 → manual Lighthouse runs on staging (Notes); src/app/lib/photo-sizes.test.ts (which copy a Pixel 7 / 3x phone picks); src/app/lib/defer-hydration.test.ts; src/tests/e2e/defer-hydration.spec.ts
- AC8 → src/app/server/services/photo-variants-backfill.server.test.ts; src/app/lib/photo-variants-workflow.test.ts

## Design
- Copies are named by convention beside the original (`<stem>-480w.<ext>`), so removals need no lookup (`withVariantPaths`); which copies really exist is stored with the row (migration 0011), so a page never points `srcset` at a missing file.
- Widths are widths (not long edges), so the `w` descriptors are exact. `sizes` per place live in `app/lib/photo-sizes.ts`; two-column phone cards say their real width, `calc(50vw - 1.5rem)`, so a Pixel 7 (412 px @2.625) takes the 480 copy (47vw made it 508 px: the 960 copy).
- Browser: `compressPhoto` returns `variants`; `uploadVariants` (lib/photo-variants.ts, re-exported by the lazy image-compress chunk) asks `admin/uploads` with `variantOf` and PUTs each copy. Best effort.
- Server: `storedVariantWidths` / `checkNewPhoto` (product-photos.server) are shared by the three saves and the backfill.
- Settings images have no stored size: their copies are looked for up to the 1600 px edge and the hero renders `srcset` against the 1600 px box.
- Promotion images are out of scope (promotions job; migration 0012 is theirs).

- Full-width phone photos (hero, product viewer, brand page photos) say `20rem` below 30rem in `sizes`: every phone up to 3x takes the 960 px copy (2.3x on a Pixel 7) instead of a 1024-1600 px original two to three times its bytes (`90vw` still needed 973 px, so the 1024 px original won). From 30rem the real width again. `app/lib/photo-sizes.test.ts` checks the picks.
- The customer layout preconnects to the Supabase photo origin; the basket code prefetch and the menu warm-up wait for the load event, then idle (`lib/after-load.ts`).

## Notes
- 2026-11-13: code on main (81a02d6), CI green (run 43407986032). The staging deploy (run 43410205227, also re-run) did not start: GitHub refused every job with "recent account payments have failed or your spending limit needs to be increased". Until that is fixed, staging runs the old build, so the backfill and the after-measurement (AC7) wait. Owner step: GitHub → Settings → Billing and plans → fix the payment or raise the Actions spending limit; then Actions → deploy → Re-run, then Actions → photo-variants → Run workflow (main).
- Before (staging, Lighthouse 12, Pixel 7 412×915 @2.625, simulated slow 4G + 4× CPU, 3 runs; median): `/` LCP 4.21 s, 727 kB total, 420 kB images · `/menu` 6.30 s, 950 kB, 646 kB images · `/menu/red-velvet` 4.27 s, 512 kB, 215 kB images · `/gallery` 1.83 s, 290 kB, 9 kB images (staging has no gallery photos yet, so nothing to gain there today). The LCP element was the photo on `/`, `/menu` and the product page.
- Expected after (copies made locally from the same staging files with the backfill's settings, sharp q78): the 3 staging photos are 210-231 kB originals; their 480 px copies are 25-35 kB and 960 px copies 81-108 kB. `/menu` cards take the 480 copies: ~94 kB of photos instead of ~646 kB (-85%). Home hero and product photo take the 960 copy: ~81 kB instead of ~210 kB. To be confirmed with the same Lighthouse runs once staging is deployed and backfilled.
- Production: the backfill is staging-only by design; production photos get copies when re-uploaded, or by a later run the Owner approves.
- 2026-11-13 AC7 follow-up (after the deploy and backfill; same Lighthouse method, median of 3). Copies alone (90vw, f630883): `/` 4.26 s (401 kB images), `/menu` 4.09 s (299 kB), `/menu/red-velvet` 4.04 s (215 kB): phones still took the 1024 px hero/product original (206 kB) and 960 copies for two-column cards. Fixed in 292d52a (sizes, preconnect) and a121a83 (prefetch and menu warm-up after load).

  | Page | LCP before S-276 | after copies (f630883) | after fixes (a121a83, Smart Placement `local-ORD`) | images before → now |
  |---|---|---|---|---|
  | `/` | 4.21 s | 4.26 s | 3.60 s | 420 → 148 kB (hero 79 kB 960 copy) |
  | `/menu` | 6.30 s | 4.09 s | 3.23 s | 646 → 103 kB (480 copies) |
  | `/menu/red-velvet` | 4.27 s | 4.04 s | 3.31 s | 215 → 89 kB (960 copy) |

  With the Worker placed in Sydney (704238d, trial): 3.44 / 2.93 / 3.25 s. AC7 stays open; two causes remain, neither in the photos:
  1. **Bytes before the LCP paint.** Lighthouse's simulation (1.6 Mbit/s) counts every request that starts before the photo paints except lazy images: ~160-190 kB of route JavaScript (modulepreloads, React + router ~110 kB of it), 55-78 kB of fonts (4 woff2), 13 kB CSS, 15 kB HTML and the photo(s): ~340-360 kB, about 2 s of transfer. Even a run with a 277 ms server response gave LCP 3.18 s on `/menu`. Reaching 2.5 s needs ~120 kB less before the photo: e.g. start hydration after the load event on customer pages (an Owner decision: pages work without JavaScript, but taps before load would be plain navigations/form posts), or fewer font files.
  2. **Server response from the test machine (US).** Every query takes 140-190 ms whether the Worker runs in Chicago, Mumbai or Sydney (ADR-0003 amendment 6), so the region in the runbook (Mumbai) is unconfirmed; Home runs 2-5 sequential queries (0.35-1.0 s). Owner step: Supabase → Project Settings → General → Region, then targeted placement there.
- 2026-11-13 AC7 closed. Two changes after the table above, same Lighthouse method (staging, Pixel 7, simulated slow 4G, 4x CPU, median of 3):
  1. Staging Worker placed in Seoul (861a958, ADR-0003 amendment 7; `cf-placement: remote-ICN`): per query ~190 ms to 6-12 ms; server time `/` ~1.0 s to 70-196 ms, `/menu` ~0.56 s to 14-19 ms, product ~0.60 s to 18-20 ms. LCP on 861a958 alone: `/` 3.47 s, `/menu` 3.10 s, `/menu/red-velvet` 3.32 s.
  2. Browsing pages start their JavaScript after the load event and an idle moment (Owner decision 2026-11-13; 366dcd3, `lib/defer-hydration.ts`): home, menu, menu-links, our-story, workshops, gallery, product and not-found. The server rewrites the document stream: modulepreloads wait (`rel="x-modulepreload"`), the module script is inert text, and a ~600 byte inline loader restores both after load + idle (8 s cap). Basket, contact, custom cake, order confirmed, tracking and every admin page keep their JavaScript at once.

  | Page | LCP before S-276 | after fixes (a121a83) | after Seoul (861a958) | after deferred JS (366dcd3), 3 runs | median | requests |
  |---|---|---|---|---|---|---|
  | `/` | 4.21 s | 3.60 s | 3.47 s | 2.47 / 2.38 / 2.48 s | **2.47 s** | 63 |
  | `/menu` | 6.30 s | 3.23 s | 3.10 s | 2.11 / 2.38 / 2.79 s | **2.38 s** | 62 |
  | `/menu/red-velvet` | 4.27 s | 3.31 s | 3.32 s | 2.44 / 2.49 / 2.23 s | **2.44 s** | 70 |
  | `/gallery` | 1.83 s | | | 0.95 / 0.96 / 0.96 s | **0.96 s** | |

  CLS 0.000 on all, performance score 96-100. Margins are thin (0.03-0.12 s under 2.5 s; `/menu` had one 2.79 s run), so keep an eye on it when the bundle grows. Remaining lever if it slips: fewer font files before the photo (4 woff2, 55-78 kB).
- UX of the deferral: until hydration every link, the language switch, the Add to basket form and the phone menu button (a link to `/menu-links`) are plain navigations and form posts; after it they are instant. The page is the same height before and after hydration at 375 px (home 2570 px, product 2066 px: no layout shift). A size or message chosen before hydration is read back from the form (`components/product/form-selection.ts`), so Add never says "Choose a size" for a size the customer can see (found by the e2e test, fixed in the same commit). Screenshots (scratchpad): `defer-home-before-hydration.png`, `defer-home-after-hydration.png`, `defer-product-before-hydration.png`, `defer-product-after-hydration.png`.
- Tests: `src/app/lib/defer-hydration.test.ts` (which pages defer, stream rewrite at any chunk cut, the loader's timing), `src/app/components/product/form-selection.test.ts`, `src/tests/e2e/defer-hydration.spec.ts` (HTML shape, a tap before hydration, no script before load, no-JS browse + Add + language switch + phone menu). Full e2e 1081 passed, 72 skipped; `check:js-budget` passes (largest route 149 kB of 170 kB).
