# S-067: Message on cake with enforced character limit
Status: review
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#product-page-fr-007-fr-008
Estimate: 2 pts
Owner: remix-specialist, api-engineer, accessibility-specialist

## Story
As a customer ordering a birthday cake, I want to type a message for the cake and see how many characters I have left, so that the text fits and is never silently cut off.

## Acceptance Criteria
- [x] AC1 (FR-008): Given a limit of 40 (Settings default), when the 41st character is typed, then it is not accepted and the counter turns the danger colour and reads "40 / 40" with text (not colour only).
- [x] AC2 (FR-008): Given a posted 41-character message, when `addToBasket` runs, then `VALIDATION_FAILED` with `fields.cakeMessage`; the server never truncates.
- [x] AC3 (FR-008): Given exactly 40 characters, when posted, then it is accepted; a message of 40 emoji, or a family emoji or "é" in composed or decomposed form, counts 1 per grapheme cluster after NFC normalisation and trimming.
- [x] AC4 (FR-008): Given a message of spaces only, when posted, then it is treated as absent.
- [x] AC5 (FR-008): Given an option group of kind text with `textMaxLength` 20, when 21 characters are posted, then `VALIDATION_FAILED` `too_long` for that group; the cake message uses `cakeMessageMax` from Settings.
- [x] AC6 (FR-008): Given the Owner changes `cake_message_max` to 60, when the page loads next, then the field and counter use 60.
- [x] AC7 (NFR-002, NFR-006): Given the field at 320 px and 375 px, 200% zoom, keyboard-only and a screen reader, when typing, then the field has a visible label, the counter is associated via `aria-describedby` and announces politely at thresholds (not on every keystroke), contrast is AA per `docs/design/tokens.json`, and `maxlength` does not silently drop pasted text without notice (a paste over the limit shows the error).

## Tests
- AC1 → src/app/components/product/message-field.test.tsx
- AC2 → src/app/routes/site/product-options.test.ts
- AC3 → src/app/domain/pricing.test.ts (T-PR-18, T-PR-19)
- AC4 → src/app/domain/pricing.test.ts (T-PR-20)
- AC5 → src/app/domain/pricing.test.ts (T-PR-17)
- AC6 → src/app/routes/site/product-options.test.ts
- AC7 → src/tests/e2e/product-options.spec.ts

## Notes
- Prototype defect fixed: prototype `slice` truncated silently.
- Server rule lives in `validateSelection` (S-081); this story wires the UI and the action.

## Done notes (2026-11-13, Sprint 4 job 1)
- Field: `src/app/components/product/message-field.tsx` (no native maxlength; refused input keeps the text and a paste over the limit says why). Shown on cakes without their own text group.
- Tests as built: AC2, AC6 in `src/app/routes/site/product-options.test.ts`; AC3-AC5 in `src/app/domain/pricing.test.ts`; AC1, AC7 in `message-field.test.tsx` and `src/tests/e2e/product-options.spec.ts`.
