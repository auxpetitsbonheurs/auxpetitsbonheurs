# S-246: Admin Pages: edit page text in English and French
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/admin-menu-content.md (add "Pages") · Permissions: docs/specs/features/admin-access-team.md (add row: Pages, Admin and Owner)
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, api-engineer, tailwind-shadcn-specialist

## Story
As the bakery Owner or an Admin, I want to edit the text of Our story, Workshops, Gallery, Contact hours and Custom order in English and French from my phone, so that the site says what I want without asking a developer.

## Acceptance Criteria
- [x] AC1 (FR-078): Given an Admin or Owner, when I open More > Pages (`/admin/pages`), then I see the 5 pages in a list with name, a "Sample text" badge while `is_placeholder` is true, the last edited date and who edited, and each row (>= 64 px, whole row a link) opens `/admin/pages/:key`.
- [x] AC2 (FR-078): Given a page editor, then it shows that page's fields (S-245 AC1) as labelled textareas with EN and FR side by side from `md` and stacked with a language label on phones, a live remaining-characters hint, and the same form pattern as S-059.
- [x] AC3 (FR-078): Given I change text and press Save, then it is stored, `is_placeholder` becomes false, the "Sample text" badge disappears, a success status is announced, and the public page shows the new text within 60 s (immediately in the serving isolate).
- [x] AC4 (FR-078, NFR-003): Given a field over its limit (10,000; intro 300), then `VALIDATION_FAILED` with a field message and nothing is saved; given HTML, then it is stored as text and shown escaped.
- [x] AC5 (FR-078): Given a stale `version` (another admin saved first), then `PAGE_CHANGED`, nothing is saved, and the page offers Reload without losing my typed text until I choose.
- [x] AC6 (FR-041): Given an Admin session, then Pages works (not Owner-only); given a customer or anonymous visitor, then `/admin/pages` redirects to sign-in and `save` returns `FORBIDDEN` or `UNAUTHENTICATED`; given an unknown page key, then a 404 admin state.
- [x] AC7 (FR-078): Given I leave the page with unsaved changes, then a leave prompt asks first (as S-059); given a French field left empty, then a hint says "English will show in French" and saving is allowed.
- [x] AC8 (FR-078, NFR-002): Given 320 px, 375 px and 200% zoom, keyboard only, then every control is reachable in order with a visible focus ring, nothing is clipped, targets >= 44 px, warnings are text not colour only, AA contrast, no serious axe violations.
- [x] AC9 (FR-078): Given the contact page, then its editor also states that WhatsApp, phone, address and map link are changed in Settings (Owner only) with a link shown to Owners and plain text to Admins.

## Tests
- AC1 → src/app/routes/admin/pages.test.ts
- AC2 → src/tests/e2e/admin-pages.spec.ts
- AC3 → src/app/server/services/save-site-page.server.test.ts, src/tests/e2e/admin-pages.spec.ts
- AC4 → src/app/server/services/save-site-page.server.test.ts
- AC5 → src/app/server/services/save-site-page.server.test.ts
- AC6 → src/app/routes/admin/pages.test.ts, src/app/routes/admin/route-guards.test.ts (walks routes.ts)
- AC7 → src/tests/e2e/admin-pages.spec.ts
- AC8 → src/tests/e2e/admin-pages.spec.ts
- AC9 → src/app/routes/admin/pages.test.ts

## Notes
- Permission (Owner + Admin) is a proposal pending the Owner's yes; if she wants Owner only, change the guard and the matrix row, nothing else.
- Admin More screen gets a "Pages" row (the bottom bar keeps 5 items).
- Depends on: S-245, S-033 (frame, More), S-059 (form pattern, plain-text component).

## Build notes (2026-11-12, review)
- Routes `admin/pages` and `admin/page-editor` (`/admin/pages/:key`), both `admin` in `ADMIN_MODULE_POLICY`; More lists Pages first for everyone. The editor is its own route chunk (164.7 kB gz); the product editor stays at 169.5 kB.
- Tests as built: AC1, AC6, AC9 → `src/app/routes/admin/pages.test.ts`, `route-guards.test.ts`, `layout.test.tsx`; AC3-AC5, AC7 server → `src/app/server/services/save-site-page.server.test.ts`; AC2, AC3, AC5, AC7, AC8 → `src/tests/e2e/admin-pages.spec.ts` (320, 375, 1280).
- AC4: the browser caps the fields with `maxLength`; the server refuses longer text per field.
