# S-059: Owner edits homepage, About, FAQ, policies and privacy text
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#settings-owner
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, api-engineer

## Story
As the bakery Owner, I want to edit the homepage tagline, About, FAQ, policies and privacy note in English and French, so that customers always read current information.

## Acceptance Criteria
- [x] AC1 (FR-067): Given hero tagline, About, FAQ, policies and privacy note each in EN and FR, when I save, then the values are stored and returned in the `{ en, fr }` shape; an EN-only value falls back to EN on French pages.
- [x] AC2 (FR-067): Given a text over 10,000 characters (or 200 for the tagline), then `VALIDATION_FAILED` and nothing is saved.
- [x] AC3 (FR-067, NFR-003): Given text with HTML such as `<script>`, then it is stored and rendered as plain text, escaped, with line breaks kept; no HTML is interpreted.
- [x] AC4 (FR-067, FR-010): Given policies saved without the words "cancellation" and "storage" (EN) or "annulation" and "conservation" (FR), then a warning "Keep the cancellation and storage entries" shows and the save still succeeds.
- [x] AC5 (FR-067): Given featured products (at most 6), when I choose a hidden or sold-out product, then it is flagged "hidden" or "sold out" in the list; a seventh is refused.
- [x] AC6 (FR-067): Given a hero image or About image, then it uses the same compression and upload rules as product photos (S-047) and a non-image is rejected.
- [x] AC7 (FR-067, FR-054): Given a stale `version`, then `SETTINGS_CHANGED` and nothing is saved.
- [x] AC8 (FR-041): Given an Admin, an anonymous visitor or a customer session, then 403 "Owner only", `FORBIDDEN` or a redirect, and no change.
- [x] AC9 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; EN and FR textareas are side by side from `md` up and stacked with a language label on phones.
- [x] AC10 (NFR-002): Given the form, then every textarea has a visible label with its language, a remaining-characters hint announced politely, warnings are text (not colour only), and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/admin/settings.test.ts
- AC2 → src/app/server/services/save-settings.server.test.ts
- AC3 → src/app/components/site/plain-text.test.tsx (the shared renderer; customer pages are E-04)
- AC4 → src/app/domain/settings.test.ts, src/app/server/services/save-settings.server.test.ts
- AC5 → src/app/routes/admin/settings.test.ts
- AC6 → src/app/server/services/save-settings.server.test.ts, src/app/routes/admin/uploads.test.ts
- AC7 → src/app/server/services/save-settings.server.test.ts
- AC8 → src/app/routes/admin/owner-only.test.ts, src/app/routes/admin/uploads.test.ts
- AC9 → src/tests/e2e/admin-settings.spec.ts
- AC10 → src/tests/e2e/admin-settings.spec.ts

## Notes
- Depends on: S-058, S-047.
- Contract: `admin/settings` `save` (`heroTagline`, `heroImagePath`, `featuredProductIds`, `about`, `aboutImagePath`, `faq`, `policies`, `privacyNote`).
- Spec gap/decision: the spec asks for a warning when "cancellation or storage entries" are missing but does not define how an entry is detected. Decision: a case-insensitive keyword check on the saved text (AC4); `product-director` may replace it with structured fields later.
- Customer pages that show this content (home, About, FAQ) are E-04; AC3 is tested on the shared text renderer.
