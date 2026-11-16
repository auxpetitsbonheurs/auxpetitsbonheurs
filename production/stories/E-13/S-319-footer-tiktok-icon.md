# S-319: TikTok icon in the footer
Status: done
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md (footer, S-061) · contracts.md `admin/settings`, site layout `contacts` (v0.63)
Estimate: 1 pt
Owner: lead-frontend, lead-backend, ux-lead
Asked by: the Owner, 2026-11-16

## Story
As a customer, I want a TikTok icon in the footer beside Instagram and Facebook, so that I can follow the bakery there in one tap; and as the Owner, I want to set the TikTok link in Settings.

## Acceptance Criteria
- [x] AC1: Given Admin → For Owners → Settings → Contact, then there is an optional "TikTok link" / "Lien TikTok" field under the Facebook page, saved by the existing Settings save.
- [x] AC2: Given a TikTok value that is not an https address on tiktok.com or www.tiktok.com, when the Owner saves, then the field is refused with a friendly message (EN/FR) and nothing is saved; an empty value clears it.
- [x] AC3: Given TikTok is set, then the footer shows a round TikTok icon after Instagram and Facebook, the same size and style, opening the account in a new tab with `rel="noopener noreferrer"`; unset (or no longer valid), it is not shown.
- [x] AC4: Its accessible name is "Aux petits bonheurs on TikTok" (FR "sur TikTok"), the new tab is announced as a description, the target is at least 44 × 44 px with a visible focus ring, and axe finds nothing at 320, 375 and 1280 px.
- [x] AC5: The mark is inline SVG (no external image, the CSP is unchanged) and `check:js-budget` passes.

## Tests
- AC1, AC2 → app/domain/settings.test.ts (tiktokAccountUrl), app/server/services/save-settings.server.test.ts (saved, cleared, refused), app/routes/admin/settings.test.ts, tests/e2e/admin-settings.spec.ts (refusal), tests/e2e/layout-footer.spec.ts (saved through the form)
- AC3, AC4 → app/components/shell/site-footer.test.tsx (order, names EN/FR, inline SVG, hidden when unset), app/server/repos/settings.server.test.ts (only a valid URL reaches the footer), tests/e2e/layout-footer.spec.ts (order, names, 44 px, focus, axe, 320/375/1280)
- AC5 → `npm run check:js-budget`

## Notes
- Data: `settings.tiktok_url text` (nullable, migration 0029). Contract v0.63.
- Hosts are exactly tiktok.com and www.tiktok.com (Owner brief); short links such as vm.tiktok.com are refused, so the Owner pastes the profile address.
- Look: a black 36 px disc with TikTok's note glyph in white over its cyan (#25F4EE, up-left) and red (#FE2C55, down-right) offsets, like the official mark; third-party colours, so not tokens.
- No JSON-LD `sameAs` exists on the site (the Contact page's Bakery data has none), so nothing was added there.
