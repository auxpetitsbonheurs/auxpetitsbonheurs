# S-008: Language switch and remembered language
Status: review
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#i18n--locale
Estimate: 3 pts
Owner: i18n-specialist, remix-specialist

## Story
As a French-speaking or English-speaking visitor, I want the site to open in my language and let me switch on any page, so that I always read the site comfortably and my choice is remembered.

## Acceptance Criteria
- [x] AC1 (FR-001): Given a first visit with no `apb_locale` cookie and `Accept-Language: fr-FR`, when I open `/`, then I am redirected to `/fr/`; given `Accept-Language: en-GB`, then `/` stays in English.
- [x] AC2 (FR-001): Given I am on `/fr/basket?x=1`, when I use the language switch, then I land on `/basket?x=1` (same page, same query) and the `apb_locale=en` cookie is set for one year.
- [x] AC3 (FR-001): Given the cookie `apb_locale=en` and browser language French, when I open `/`, then there is no redirect (the cookie wins).
- [x] AC4 (FR-001): Given an invalid cookie value or an unknown prefix (`/it/`), then the invalid cookie is ignored (detection applies) and `/it/` returns 404.
- [x] AC5 (NFR-007, NFR-010): Given any page, then `<html lang>` matches the page locale and `link rel="alternate" hreflang` tags point to the EN and FR twins.
- [x] AC6 (NFR-002): Given the switch, then it is a link (not a button) whose text is the other language's own name ("Français" / "English") with a matching `lang` attribute, reachable by keyboard, at least 44 px tall, with visible focus, and French text that is longer wraps and is never truncated at 320 px.
- [x] AC7 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, then the switch is not clipped and the colours used meet WCAG AA contrast per docs/design/tokens.json.

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
- Decision: twin route trees (`routes.ts`: the same modules under no prefix and under an exact `fr` prefix, ids `*-en` / `*-fr`) instead of a `:lang?` segment (rationale: an optional dynamic segment would treat `/basket` as a language; with exact prefixes `/it/` and other unknown paths get a 404 page inside the shell). architecture.md "i18n & locale" updated.
- Decision: rules live in pure `app/lib/locale-detect.ts` (`decideLocale`, `twinPath`, `localeCookie`), applied by the site layout's server `middleware`: unprefixed URLs redirect (302) on a first visit by the first Accept-Language tag, or on a returning entry navigation by the cookie; `Sec-Fetch-Site: same-origin` never redirects (so the switch works even with cookies blocked); the page locale is written to `apb_locale` (1 year, Path=/, SameSite=Lax, Secure, HttpOnly) when it differs.
- Decision: the switch is a single plain `<a>` (full document navigation, works without JS) whose text is the other language's own name ("Français" / "English") with `lang` and `hreflang`, per this story's AC6. This differs from design-system.md's "EN / FR with accessible name Language / Langue" row; flagged for `design-director` to align the design system (not edited here).
- Decision: hreflang alternates (en, fr, x-default -> en) are absolute URLs of the twins without the query, rendered in the root `<head>` from the root loader.
- Decision: unknown customer paths render `routes/site/not-found.tsx` (status 404, `noindex`) inside the shell, so `/fr/basket?x=1` (basket page arrives in S-012) still offers the switch.
- Known limitation kept: the switch is a GET, so typed checkout fields are lost (checkout spec).
