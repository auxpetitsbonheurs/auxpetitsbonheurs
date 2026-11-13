# S-218: Account screens pass an accessibility and language sweep
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#non-functional
Estimate: 3 pts
Owner: accessibility-specialist, test-engineer

## Story
As a customer using a keyboard, a screen reader or a small phone, I want every account screen to work for me in English and French, so that accounts do not exclude anyone.

## Acceptance Criteria
- [ ] AC1 (NFR-002): Given each account route (sign-in, sign-up, reset, link landing, profile, addresses, My orders, Save my details) in EN and FR, then axe-core reports no serious or critical violations.
- [ ] AC2 (NFR-002): Given keyboard only, then every flow (sign up, sign in, reset, edit profile, add address, reorder) completes without a mouse and without keyboard traps; focus is always visible.
- [ ] AC3 (NFR-002, NFR-006): Given 320 px and 375 px viewports and a reflow test equal to 200% zoom, then no screen has horizontal scroll or clipped content.
- [ ] AC4 (NFR-002): Given the colour pairs used on these screens, then all meet WCAG AA 4.5:1 (3:1 for large text and UI components) per `docs/design/tokens.json`.
- [ ] AC5 (NFR-002, NFR-006): Given each interactive element, then its tap target is >= 44 px and every field has a visible label, correct `autocomplete`, and errors tied via `aria-describedby`.
- [ ] AC6 (NFR-007): Given every string on these screens and the account emails, then an EN/FR parity test finds no missing key and no hard-coded text.
- [ ] AC7 (NFR-002): Given the prototype defects (unlabelled steppers, copied aria-labels), then none is present on these screens.
- [ ] AC8 (FR-034): Given generic messages (sign-in failure, magic link sent, reset sent, existing email), then wording is identical for existing and unknown emails in both languages.

## Tests
- AC1 → src/tests/e2e/account-a11y.spec.ts
- AC2 → src/tests/e2e/account-a11y.spec.ts
- AC3 → src/tests/e2e/account-a11y.spec.ts
- AC4 → src/tests/e2e/account-a11y.spec.ts
- AC5 → src/tests/e2e/account-a11y.spec.ts
- AC6 → src/app/i18n/account-parity.test.ts
- AC7 → src/tests/e2e/account-a11y.spec.ts
- AC8 → src/app/routes/account/no-enumeration.test.ts

## Notes
- Verification story: individual UI stories carry their own a11y ACs; this is the epic-wide gate, run last. Findings route to the owning story.
- Dependencies (R9): S-206..S-216. Not yet done; expected.

## Build notes (2026-11-14)
- AC1, AC3, AC4, AC5: src/tests/e2e/account-a11y.spec.ts sweeps sign-in (both methods), sign-up, reset, Save my details, profile, My orders and addresses in EN and FR at 320/375/1280 px and 200% zoom (no sideways scroll or clipping, 44 px targets, keyboard order with visible focus, axe light and dark). Findings fixed: at 200% zoom on a 320 px phone the French account title, the Sign out button, the profile's Save button with the card padding, the language radios and the empty My orders button were wider than the screen.
- AC2: keyboard flows are in account.spec.ts (sign up, sign in, link, reset, profile, addresses sheet) and account-checkout.spec.ts (saved-address radios by arrow keys).
- AC6: src/app/i18n/account-parity.test.ts (account, reviews, account emails, reorder note: same keys, none empty, same placeholders). AC8: src/app/routes/account/no-enumeration.test.ts (EN and FR).
- AC7: steppers and copied labels are not used on these screens (the reorder buttons and address actions carry distinct names).
