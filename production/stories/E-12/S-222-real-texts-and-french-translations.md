# S-222: Real texts and natural French, reviewed by the Owner
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: copywriter, ui-engineer

## Story
As a French-speaking Mauritian customer, I want the site and emails to read naturally in French, so that I trust the bakery.

## Acceptance Criteria
- [ ] AC1 (NFR-007): Given every key in the EN and FR dictionaries (site, emails, push, WhatsApp templates), then none is missing and no customer-facing text is hard-coded in components; the parity test passes.
- [ ] AC2 (NFR-007): Given the Owner and Sarah review the FR text of home, FAQ, checkout, tracking, emails, push and WhatsApp templates, then each item is marked accepted or corrected in a review sheet, and every correction is applied.
- [ ] AC3 (NFR-007): Given the FAQ and info pages, then they contain the Owner's real cancellation policy (free by WhatsApp until 48 h before, none after) and storage advice (refrigerate, out 30 min before serving, best within 2-3 days) in both languages.
- [ ] AC4 (NFR-008): Given dates, money and deadlines in either language, then they use Mauritius time and "Rs" formats.
- [ ] AC5 (NFR-007): Given a string left untranslated, then the build/test run fails (not silently EN), except an intentional fallback logged in the sheet.
- [ ] AC6 (NFR-007): Given French strings 30-40% longer, then no button or heading overflows at 320 px (checked on checkout, tracking and basket).
- [ ] AC7 (NFR-004): Given the placeholder copy `[TO CONFIRM]`, then none remains in customer-facing text.

## Tests
- AC1 → src/app/i18n/parity.test.ts
- AC2 → production/audits/french-review-sheet.md
- AC3 → src/tests/e2e/launch-content.spec.ts
- AC4 → src/app/domain/format.test.ts
- AC5 → src/app/i18n/parity.test.ts
- AC6 → src/tests/e2e/i18n-overflow.spec.ts
- AC7 → src/tests/e2e/launch-content.spec.ts

## Notes
- Wording of admin alerts and WhatsApp templates is Owner-reviewed before launch (notifications spec Copy).
- Dependencies (R9): E-04, E-10, E-11. Not yet done; expected.
