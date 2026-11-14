# S-227: Accessibility audit: WCAG 2.2 AA, keyboard, zoom, contrast, small screens
Status: in-progress
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 5 pts
Owner: accessibility-specialist, test-engineer

## Story
As a customer or admin who relies on a keyboard, zoom or a screen reader, I want every screen to be usable, so that I can order and run the bakery without help.

## Acceptance Criteria
- [x] AC1 (NFR-002): Given home, menu, product, basket, checkout, confirmation, tracking, custom request, account pages and the admin screens, then Lighthouse accessibility is >= 95 and axe-core reports no serious or critical issue (EN and FR).
- [ ] AC2 (NFR-002): Given keyboard only, then the full customer order (menu filter to confirmation) and the admin approve/prep flow complete with a logical focus order, visible focus and no trap (checked manually and recorded).
- [ ] AC3 (NFR-002, NFR-006): Given 200% browser zoom and viewports of 320 px and 375 px, then no content is lost or scrolls sideways on checkout, tracking, basket and admin order detail.
- [x] AC4 (NFR-002): Given the real contrast of sale prices, greyed/blocked dates, status chips and placeholders, then each meets WCAG AA; the allergen filter and statuses are not conveyed by colour alone.
- [ ] AC5 (NFR-002): Given a screen reader (VoiceOver iOS and TalkBack Android), then checkout, the quantity steppers, error messages and toasts are announced with correct names; prototype defects (stepper labels, copied aria-labels) are confirmed absent.
- [x] AC6 (NFR-002, NFR-006): Given every interactive element on mobile, then its tap target is >= 44 px and every form field has a visible label and the correct keyboard type (tel, email, number).
- [x] AC7 (NFR-002): Given `prefers-reduced-motion`, then motion stops.
- [x] AC8 (NFR-002): Given any failed check, then a finding is logged with a WCAG 2.2 criterion, severity and owner; no S1/S2 a11y finding remains open at launch.

## Tests
- AC1 → production/audits/a11y-2026.md
- AC2 → production/audits/a11y-2026.md
- AC3 → production/audits/a11y-2026.md
- AC4 → production/audits/a11y-2026.md
- AC5 → production/audits/a11y-2026.md
- AC6 → src/tests/e2e/a11y-audit.spec.ts
- AC7 → src/tests/e2e/a11y-audit.spec.ts
- AC8 → production/audits/a11y-2026.md

## Notes
- Covers the keyboard/zoom/contrast/device checks missing from the 2026-11-10 prototype session (its checklist was not completed). Per-story a11y ACs live in the UI epics; this is the integrated gate.
- Dependencies (R9): S-223, E-01..E-11. Not yet done; expected.

## Launchprep notes (2026-11-14)
- tests/e2e/a11y-audit.spec.ts: axe at 100% and 200% on every customer page (EN/FR) and admin screen, 100 tests pass at 320/375/1280. Five reflow defects fixed (admin product and promotion editors, options skeleton, New promotion button, French section title rule). Open: A11Y-06 French account pages at 320 px + 200% (E-11, S3, scoped in the spec); AC2 one keyboard-only end-to-end run (manual); AC5 VoiceOver/TalkBack on real phones. Report: production/audits/a11y-2026.md.
