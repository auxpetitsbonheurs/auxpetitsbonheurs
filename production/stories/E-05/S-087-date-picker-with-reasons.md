# S-087: Date picker that explains unavailable days
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#ux-how-the-rules-surface-screens-belong-to-other-specs
Estimate: 5 pts
Owner: ui-engineer, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer, I want to pick a pickup or delivery date and see why some days are not available, so that I can choose another day without guessing.

## Acceptance Criteria
- [ ] AC1 (FR-013, FR-014): Given the basket, when checkout loads, then the picker shows 90 days with an "Earliest date: {date}" header computed from the largest notice of the basket items.
- [ ] AC2 (FR-014): Given a day that is too soon, closed or blocked or too far, when tapped or focused, then a message shows under the calendar: "Too soon: we need {N} days' notice", "Closed on {weekday}s" (weekday from Settings), or "Not available"; the private block reason is never shown and "Fully booked" never appears.
- [ ] AC3 (FR-014): Given an unavailable day, when rendered, then it is struck through, focusable and announced as unavailable with its reason (not by colour alone).
- [ ] AC4 (FR-013): Given all days in the horizon are unavailable, when the picker renders, then "No dates available, contact us on WhatsApp" with a WhatsApp button shows.
- [ ] AC5 (FR-014): Given an unavailable date is posted, when `placeOrder` runs, then `DATE_UNAVAILABLE` (`fields.date` + reason) and the picker re-renders with fresh statuses, other fields kept, the typed selection survives.
- [ ] AC6 (FR-006): Given a seasonal item until 25 Dec in the basket, when the picker renders, then dates after 25 Dec are unavailable with "Not available: {item} is only available {start} to {end}".
- [ ] AC7 (FR-014): Given the page stays open across Mauritius midnight, when submitted, then the server re-judges the date against the new today (FR-015 in S-091).
- [ ] AC8 (FR-014, NFR-002, NFR-006): Given the picker at 320 px and 375 px, 200% zoom and keyboard-only, when used, then arrow keys, PageUp/PageDown, Home/End and Enter operate it, unavailable days stay focusable, selected day and month are announced, day cells are >= 44 px, FR dates ("sam. 14 déc.") fit without clipping, contrast is AA per `docs/design/tokens.json`, `prefers-reduced-motion` honoured.
- [ ] AC9 (FR-014, NFR-001): Given the picker, when loaded, then it is lazy-loaded with a no-JS fallback (native date input constrained by server validation) and the date change interaction INP <= 200 ms.

## Tests
- AC1 → src/app/components/checkout/date-picker.test.tsx
- AC2 → src/app/components/checkout/date-picker.test.tsx
- AC3 → src/app/components/checkout/date-picker.test.tsx
- AC4 → src/app/components/checkout/date-picker.test.tsx
- AC5 → src/app/routes/site/basket.place-order.test.ts
- AC6 → src/app/components/checkout/date-picker.test.tsx
- AC7 → src/app/routes/site/basket.place-order.test.ts (fixed clock)
- AC8 → src/tests/e2e/checkout-a11y.spec.ts
- AC9 → src/tests/e2e/perf-budgets.spec.ts

## Notes
- Depends on S-083 (`days: DayStatus[90]`) and S-084 (seasonal windows).
- Copy keys for reasons from the pricing spec UX table; FR strings from copywriter.
