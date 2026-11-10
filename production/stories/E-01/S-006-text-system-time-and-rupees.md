# S-006: EN/FR text system, Mauritius time and Rs formatting
Status: review
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#i18n--locale
Estimate: 5 pts
Owner: i18n-specialist, remix-specialist

## Story
As a customer or admin using English or French, I want every text, date and price shown in my language and in Mauritius time, so that nothing is confusing or off by a day.

## Acceptance Criteria
- [x] AC1 (FR-001, NFR-007): Given key `checkout.title` exists in EN and FR, when `t(key, "fr")` is called, then the French text returns; given the FR text is missing, then the English text returns.
- [x] AC2 (NFR-007): Given a database field `{ en: "Cake", fr: null }` or `fr` blank/whitespace, when `localized(field, "fr")` is called, then "Cake" returns; given both present, then the French returns.
- [x] AC3 (NFR-007): Given the keys used by the skeleton screens (listed in `src/app/i18n/skeleton-keys.ts`), then every one has a non-empty text in both `en.json` and `fr.json`.
- [x] AC4 (NFR-007): Given a count of 0 or 1, when French plural text is chosen, then the singular form is used (0 and 1), and plural from 2; English uses singular only for 1.
- [x] AC5 (NFR-007): Given a page in EN, when the HTML and the JavaScript chunks are fetched, then they do not contain a French-only sentinel string (only the active locale's bundle ships).
- [x] AC6 (NFR-008): Given instants `2026-11-10T19:59:59Z` and `2026-11-10T20:00:00Z`, when `todayMU(now)` is called, then it returns `2026-11-10` then `2026-11-11` (UTC+4, no DST).
- [x] AC7 (NFR-008): Given `muDateTimeToInstant("2026-11-12T18:00")`, then it returns `2026-11-12T14:00:00.000Z`; given an impossible date like `2026-02-30`, then it throws a typed `DomainError` (no silent rollover).
- [x] AC8 (NFR-008): Given the amounts 0, 200, 1250 and 1000000, when `formatRupees` is called, then it returns "Rs 0", "Rs 200", "Rs 1,250" and "Rs 1,000,000" in both locales.
- [x] AC9 (NFR-008): Given instant `2026-11-12T10:05:00Z`, when formatted for the admin log in EN and FR, then it reads "12 Nov 14:05" (Mauritius time) in both, and the date `2026-11-12` formats as "Thu 12 Nov" in EN and "jeu. 12 nov." in FR.
- [x] AC10 (NFR-007): Given a missing key at runtime, then `t` returns the key text and logs a warning in development, and never throws in production.

## Tests
- AC1 → src/app/i18n/i18n.test.ts
- AC2 → src/app/i18n/localized.test.ts
- AC3 → src/app/i18n/i18n.test.ts
- AC4 → src/app/i18n/i18n.test.ts
- AC5 → src/tests/e2e/language.spec.ts
- AC6 → src/app/domain/time.test.ts
- AC7 → src/app/domain/time.test.ts
- AC8 → src/app/lib/locale.test.ts (extend)
- AC9 → src/app/domain/time.test.ts
- AC10 → src/app/i18n/i18n.test.ts

## Notes
- Depends on: S-001.
- Decision: the rupee format is "Rs 1,250" in both languages (NFR-008 gives one format; no French thousands space).
- `domain/time.ts` is the only code converting instants to Mauritius dates (architecture). ESLint `no-restricted-syntax` forbids `getDate`, `getHours` and `getDay` in `src/app/domain`.
- Admin UI uses the admin's `locale`; customer URLs use the `/fr` twin (S-008).
- i18next + react-i18next per architecture; copy for skeleton screens is drafted by the developer and reviewed by `copywriter` before launch (E-12).
- Decision: i18next core only, wrapped in a small `I18nProvider`/`useI18n` (app/i18n/react.tsx); react-i18next not added (rationale: same behaviour for our sync, single-namespace use, ~7 kB gz less under the 170 kB budget).
- Decision: messages use i18next JSON v4 (`{{name}}`, `_one`/`_other` plural keys resolved by Intl.PluralRules) rather than full ICU syntax (rationale: i18next-icu adds intl-messageformat; plural behaviour per AC4 is identical).
- Decision: both bundles are imported only by `app/i18n/catalog.server.ts`; the root loader sends the active locale's messages, already merged with English fallback (blank FR counts as missing), so the browser never needs the other bundle.
- Decision: `formatLogTime` and `formatDayLabel` live in domain/time.ts beside `todayMU`/`muDateTimeToInstant`; impossible dates throw `DomainError` with codes INVALID_DATE_TIME / INVALID_DATE.
- Decision: `formatRupees(amount, locale?)` keeps one format; the locale argument is accepted and ignored so call sites stay uniform.
- Added: ESLint `no-restricted-syntax` for getDate/getHours/getDay in app/domain (tested in eslint-boundaries.test.ts); `localeFromPathname` in lib/locale.ts (S-008 builds detection on it).
- Copy for skeleton screens is developer-drafted; FR to be reviewed by `copywriter` (E-12).
