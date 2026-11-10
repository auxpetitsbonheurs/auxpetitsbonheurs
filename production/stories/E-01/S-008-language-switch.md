# S-008: Language switch and remembered language
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#i18n--locale
Estimate: 3 pts
Owner: i18n-specialist, remix-specialist

## Story
As a French-speaking or English-speaking visitor, I want the site to open in my language and let me switch on any page, so that I always read the site comfortably and my choice is remembered.

## Acceptance Criteria
- [ ] AC1 (FR-001): Given a first visit with no `apb_locale` cookie and `Accept-Language: fr-FR`, when I open `/`, then I am redirected to `/fr/`; given `Accept-Language: en-GB`, then `/` stays in English.
- [ ] AC2 (FR-001): Given I am on `/fr/basket?x=1`, when I use the language switch, then I land on `/basket?x=1` (same page, same query) and the `apb_locale=en` cookie is set for one year.
- [ ] AC3 (FR-001): Given the cookie `apb_locale=en` and browser language French, when I open `/`, then there is no redirect (the cookie wins).
- [ ] AC4 (FR-001): Given an invalid cookie value or an unknown prefix (`/it/`), then the invalid cookie is ignored (detection applies) and `/it/` returns 404.
- [ ] AC5 (NFR-007, NFR-010): Given any page, then `<html lang>` matches the page locale and `link rel="alternate" hreflang` tags point to the EN and FR twins.
- [ ] AC6 (NFR-002): Given the switch, then it is a link (not a button) whose text is the other language's own name ("Français" / "English") with a matching `lang` attribute, reachable by keyboard, at least 44 px tall, with visible focus, and French text that is longer wraps and is never truncated at 320 px.
- [ ] AC7 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, then the switch is not clipped and the colours used meet WCAG AA contrast per docs/design/tokens.json.

## Tests
- AC1 → src/app/lib/locale-detect.test.ts and src/tests/e2e/language.spec.ts
- AC2 → src/tests/e2e/language.spec.ts
- AC3 → src/app/lib/locale-detect.test.ts
- AC4 → src/app/lib/locale-detect.test.ts
- AC5 → src/tests/e2e/language.spec.ts
- AC6 → src/tests/e2e/language.spec.ts (axe + keyboard)
- AC7 → src/tests/e2e/language.spec.ts

## Notes
- Depends on: S-006, S-007.
- Order `locale` is stored at submit (S-013). Language switch is a GET, so typed checkout fields are lost; known limitation (checkout spec, Open Questions).
- Route twin approach: `:lang?` segment in `routes.ts`, same route modules.
