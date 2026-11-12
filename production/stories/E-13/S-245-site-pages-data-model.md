# S-245: Content pages: data, placeholder seed and public read
Status: ready
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/admin-menu-content.md (add "Pages" section) · Data: docs/architecture/data-model.md (add `site_page`, `site_page_photo`)
Estimate: 5 pts
Owner: postgres-specialist, api-engineer, data-engineer, remix-specialist, copywriter (placeholder text)

## Story
As a customer, I want the brand pages to show real, current words and photos in my language, so that I can learn about the bakery; and as the client, I want those words stored so I can change them without a developer.

## Acceptance Criteria
- [ ] AC1 (FR-078): Given the migration (expand-only, forward-only), then `site_page` holds one row per page key (`our_story`, `workshops`, `gallery`, `contact`, `custom_order`) with EN/FR text fields defined per page (our_story: intro, body; workshops: intro, body; gallery: intro; contact: intro, hours, pickup_note; custom_order: intro, body), `is_placeholder`, `version`, `updated_at`, `updated_by`; and `site_page_photo` holds path, width, height, alt EN/FR, `sort_order` per page with the page's photo limit enforced (our_story 4, workshops 6, custom_order 3, others 0).
- [ ] AC2 (FR-078): Given a fresh database, when the migration seed runs, then every page exists with neutral EN and FR placeholder text from the copywriter (no invented facts, no prices, no dates), `is_placeholder = true`, and re-running creates no duplicate.
- [ ] AC3 (FR-078, NFR-007): Given locale fr and a page field with an empty FR value, when the page is read, then the EN value is returned for that field only (fallback per field).
- [ ] AC4 (FR-078, NFR-003): Given stored text containing HTML such as `<script>`, when read for display, then it is returned unchanged and rendered only through the shared plain-text component (escaped, line breaks kept; blank line = new paragraph).
- [ ] AC5 (FR-078, NFR-001): Given repeated page reads, then they use the Settings cache pattern (60 s per isolate, cleared in the isolate that saved), one query for text and photos, and a read failure returns a typed error the page turns into the section error state, never a 500 white screen.
- [ ] AC6 (FR-078): Given a photo row, when its page is read, then the public URL, width, height and locale alt text (alt EN fallback) are returned in `sort_order`; a photo whose file is missing in Storage is skipped, not broken.
- [ ] AC7 (FR-078, FR-041): Given the public read, then it exposes only published columns (no `updated_by`), and the tables are written only through the admin action (S-246/S-247); anonymous or customer writes are refused (row-level security and server guard).
- [ ] AC8 (FR-078): Given contract-first, then `docs/architecture/api/contracts.md` has the page read and the `admin/pages` loader/action agreed by lead-backend and lead-frontend before S-246 starts.

## Tests
- AC1 → src/app/db/schema.test.ts, src/tests/db/site-page-migration.test.ts
- AC2 → src/app/db/seed.test.ts
- AC3 → src/app/server/services/site-page.server.test.ts
- AC4 → src/app/components/site/plain-text.test.tsx (existing) and src/app/server/services/site-page.server.test.ts
- AC5 → src/app/server/services/site-page.server.test.ts
- AC6 → src/app/server/services/site-page.server.test.ts
- AC7 → src/tests/db/site-page-rls.test.ts
- AC8 → docs review by lead-backend and lead-frontend (checklist in the PR)

## Notes
- Schema detail is the data-engineer's proposal; text fields may be a validated `jsonb` (`{ field: { en, fr } }`) instead of columns. Fixed by the ACs: the keys, limits, fallback and flags.
- Text limits: 10,000 characters per field (as S-059), intro 300.
- Photo upload path under `site/pages/<key>/` reusing S-047/S-059 helpers.
- Placeholder wording is deliberately neutral and marked sample text; E-12 S-222 replaces it.
- Migration is applied by the staging deploy; production only through the normal release (no run against a shared database from here).
