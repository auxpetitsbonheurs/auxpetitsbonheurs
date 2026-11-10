# S-227: Accessibility audit: WCAG 2.2 AA, keyboard, zoom, contrast, small screens
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 5 pts
Owner: accessibility-specialist, test-engineer

## Story
As a customer or admin who relies on a keyboard, zoom or a screen reader, I want every screen to be usable, so that I can order and run the bakery without help.

## Acceptance Criteria
- [ ] AC1 (NFR-002): Given home, menu, product, basket, checkout, confirmation, tracking, custom request, account pages and the admin screens, then Lighthouse accessibility is >= 95 and axe-core reports no serious or critical issue (EN and FR).
- [ ] AC2 (NFR-002): Given keyboard only, then the full customer order (menu filter to confirmation) and the admin approve/prep flow complete with a logical focus order, visible focus and no trap (checked manually and recorded).
- [ ] AC3 (NFR-002, NFR-006): Given 200% browser zoom and viewports of 320 px and 375 px, then no content is lost or scrolls sideways on checkout, tracking, basket and admin order detail.
- [ ] AC4 (NFR-002): Given the real contrast of sale prices, greyed/blocked dates, status chips and placeholders, then each meets WCAG AA; the allergen filter and statuses are not conveyed by colour alone.
- [ ] AC5 (NFR-002): Given a screen reader (VoiceOver iOS and TalkBack Android), then checkout, the quantity steppers, error messages and toasts are announced with correct names; prototype defects (stepper labels, copied aria-labels) are confirmed absent.
- [ ] AC6 (NFR-002, NFR-006): Given every interactive element on mobile, then its tap target is >= 44 px and every form field has a visible label and the correct keyboard type (tel, email, number).
- [ ] AC7 (NFR-002): Given `prefers-reduced-motion`, then motion stops.
- [ ] AC8 (NFR-002): Given any failed check, then a finding is logged with a WCAG 2.2 criterion, severity and owner; no S1/S2 a11y finding remains open at launch.

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
