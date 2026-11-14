# S-230: Browsers and phones matrix, including admin push on iPhone and Android
Status: in-progress
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: test-engineer, mobile-specialist

## Story
As a customer or admin on whatever phone or browser I own, I want the site to behave the same, so that nothing breaks for me.

## Acceptance Criteria
- [ ] AC1 (NFR-006): Given the last 2 versions of Safari iOS, Chrome Android and desktop Chrome, Safari, Firefox and Edge, when running the customer order journey (browse, basket, checkout, tracking), then it completes on each with no sideways scroll; results are in a matrix.
- [ ] AC2 (NFR-006): Given 375 px first, then tablet and desktop widths, then layouts hold with no overlap; phone, email and number fields show the correct mobile keyboard.
- [ ] AC3 (NFR-006): Given the installed admin app on a real iPhone and Android phone, then sign-in, approve, and a test push work on both and a push tap opens the right order.
- [x] AC4 (NFR-007): Given EN and FR language switching on each device, then the language is kept across pages and the order stores the page language.
- [x] AC5 (NFR-008): Given a device set to a different time zone, then dates, deadlines and the evening reminder still follow Mauritius time (UTC+4).
- [ ] AC6 (NFR-006): Given a failure on a supported browser, then a finding is logged with browser, version and severity, and no S1/S2 remains open at launch.

## Tests
- AC1 → production/audits/device-matrix.md
- AC2 → src/tests/e2e/responsive.spec.ts
- AC3 → production/audits/device-matrix.md
- AC4 → src/tests/e2e/i18n-switch.spec.ts
- AC5 → src/tests/e2e/timezone.spec.ts
- AC6 → production/audits/device-matrix.md

## Notes
- Playwright covers Chromium, WebKit, Firefox; real devices are manual. Physical device availability may need the Owner's or Sarah's phone.
- Dependencies (R9): S-196, E-01..E-11. Not yet done; expected.

## Launchprep notes (2026-11-14)
- Chromium (CI) and Google Chrome 153 (checkout, tracking, language, time zone: 250 passed); WebKit and Firefox not installable in this environment. New timezone.spec.ts (AC5). Real-phone checklist incl. admin install and push: production/audits/device-matrix.md.
