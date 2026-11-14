# S-283: Instagram and Facebook icons in the footer
Status: done
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md (footer, S-061) · contracts.md `admin/settings`, site layout `contacts` (v0.57)
Estimate: 2 pts
Owner: lead-frontend, lead-backend, ux-lead
Asked by: the Owner, 2026-11-14 (job "brand")

## Story
As a customer, I want small Instagram and Facebook icons in the footer, so that I can follow the bakery in one tap; and as the Owner, I want to set the Facebook page in Settings next to the Instagram link.

## Acceptance Criteria
- [x] AC1: Given Admin → More → For Owners → Settings → Contact, then there is an optional "Facebook page" / "Page Facebook" field under the Instagram link, saved by the existing Settings save (one form, one version check).
- [x] AC2: Given a Facebook value that is not an https address on facebook.com or fb.com (or a subdomain such as www. or m.), when the Owner saves, then the field is refused with a friendly message (EN/FR) and nothing is saved; an empty value clears it.
- [x] AC3: Given Instagram and/or Facebook are set, then the footer shows a small icon for each one under the logo badge, linking to it in a new tab with `rel="noopener noreferrer"`; an icon whose URL is not set (or no longer valid) is not shown, and with neither set there is no empty row.
- [x] AC4: Then the icons' accessible names are "Aux petits bonheurs on Instagram" / "Aux petits bonheurs on Facebook" (FR "Aux petits bonheurs sur Instagram" / "sur Facebook"), the new tab is announced as a description, each target is at least 44 × 44 px with a visible focus ring, and axe finds nothing at 320, 375 and 1280 px.
- [x] AC5: The footer is server-rendered: the icons are inline SVG in the HTML, and no JavaScript is added to browsing routes beyond the few bytes of the icons in the shared layout chunk (`check:js-budget` passes).

## Tests
- AC1, AC2 → app/domain/settings.test.ts (facebookPageUrl), app/server/services/save-settings.server.test.ts (saved, cleared), app/routes/admin/settings.test.ts (loader field), tests/e2e/admin-settings.spec.ts (refusal on a phone), tests/e2e/layout-footer.spec.ts (saved through the form)
- AC3, AC4 → app/components/shell/site-footer.test.tsx (links, rel, target, names EN/FR, hidden when unset), app/server/repos/settings.server.test.ts (only a valid Facebook URL reaches the footer), tests/e2e/layout-footer.spec.ts (names, 44 px, axe, 320/375/1280)
- AC5 → `npm run check:js-budget`

## Notes
- Data: `settings.facebook_url text` (nullable), next free migration. Contract: `SettingsInput.facebookUrl`, the layout's `contacts.facebookUrl`.
- Instagram moves from a text item in "Contact the bakery" to the icon row, so the footer never links it twice. Its Settings validation stays http(s) as before (S-058).
- Look (Owner, 2026-11-14): round 36 px marks in each network's own colours inside 44 px targets, 8 px apart, under the logo badge: Facebook a solid #1877F2 disc with a white "f"; Instagram the yellow-orange-pink-purple gradient with a white outlined camera. Inline SVG (lucide ships no brand marks); third-party colours, so not tokens. The band's cream focus ring follows the circle.
- Hint and error keep no long unbreakable address ("https://, on facebook.com") so the field fits 320 px at 200% zoom.
- Route JS (gz) with S-284, vs origin/main: home 146.8 → 148.1, menu 142.8 → 144.1, product 147.9 → 149.2 kB (limit 170).
