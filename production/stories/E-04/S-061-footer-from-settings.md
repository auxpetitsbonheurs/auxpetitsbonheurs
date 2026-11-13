# S-061: Footer with contact details from Settings
Status: review
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#footer
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As a customer on any page, I want the bakery's WhatsApp, phone, email, Instagram, pickup address and links to FAQ and policies in the footer, so that I can reach the bakery without hunting for contact details.

## Acceptance Criteria
- [x] AC1 (FR-003): Given Settings contain WhatsApp, phone, email, Instagram and pickup address (Beau Bassin at launch), when any customer page loads in EN or FR, then the footer shows each value as a working link (`https://wa.me/`, `tel:`, `mailto:`, Instagram URL, map link) plus links to FAQ and policies (`/faq#cancellation`).
- [x] AC2 (FR-003): Given a Settings value is changed by the Owner, when the next request is made, then the footer shows the new value with no deployment (pages are `no-store`).
- [x] AC3 (FR-003): Given a Settings value is empty (for example no Instagram), when a page loads, then that footer item is omitted and no blank row or empty link remains.
- [x] AC4 (FR-003, NFR-007): Given the page locale is fr, when the footer renders, then labels are French and links point to `/fr/faq`.
- [x] AC5 (NFR-002, NFR-006): Given the footer at 320 px and 375 px, at 200% zoom and keyboard-only, when every link is focused, then each has a visible focus ring, a visible text label (icon-only links have an accessible name that is distinct per link, no copied aria-labels), a tap target >= 44 px, AA contrast per `docs/design/tokens.json`, and there is no horizontal scroll.
- [x] AC6 (FR-003): Given Settings text contains HTML tags, when rendered, then they are escaped as text (no HTML injection).

## Tests
- AC1 → src/app/components/shell/site-footer.test.tsx, src/tests/e2e/layout-footer.spec.ts
- AC2 → src/tests/e2e/layout-footer.spec.ts (Owner saves Instagram in Settings, next page load shows it)
- AC3 → src/app/components/shell/site-footer.test.tsx, src/app/server/repos/settings.server.test.ts
- AC4 → src/app/components/shell/site-footer.test.tsx, src/tests/e2e/layout-footer.spec.ts
- AC5 → src/tests/e2e/layout-footer.spec.ts (axe light and dark, 320/375/1280, 200% zoom, focus ring, 44 px)
- AC6 → src/app/components/shell/site-footer.test.tsx (escaped), settings.server.test.ts (Instagram and map: http/https only)

## Notes
- Depends on E-01 (root loader, settings table, i18n) and E-03 (Settings data); R9 expected until those are done.
- Pickup address and Juice number are launch values; Juice number is a fake placeholder until deploy day (not shown here).
- Self-check R1-R8 pass; no open question.

## Build notes (Sprint 4, 2026-11-13)
- Footer: logo badge (link home), "Contact the bakery" (WhatsApp, phone, email, Instagram), "Pickup" (address + "See it on the map" when Settings has an http(s) map link), "Explore" (the 6 site pages after Home, from `SITE_NAV_ITEMS`); stacked and centred on phones, 3 columns from md. Reviews link: later (E-14).
- AC1 caveat: there is no FAQ page yet (`/faq` is not built), so the footer has no FAQ/policies link; add it with the FAQ page. Policies stay shown in checkout.
- AC2 caveat: the frame's Settings are cached per isolate for 60 s (`getSiteSettings`); the Owner's save clears the cache of the isolate that saved, other isolates show the change within 60 s (same rule as Contact, S-251). Pages remain uncached by browsers.
- Instagram and map links: only http/https values are rendered (anything else is dropped); off-site links open in a new tab with a screen-reader cue.
