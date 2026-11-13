# S-087: Date picker that explains unavailable days
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#ux-how-the-rules-surface-screens-belong-to-other-specs
Estimate: 5 pts
Owner: ui-engineer, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer, I want to pick a pickup or delivery date and see why some days are not available, so that I can choose another day without guessing.

## Acceptance Criteria
- [x] AC1 (FR-013, FR-014): Given the basket, when checkout loads, then the picker shows 90 days with an "Earliest date: {date}" header computed from the largest notice of the basket items.
- [x] AC2 (FR-014): Given a day that is too soon, closed or blocked or too far, when tapped or focused, then a message shows under the calendar: "Too soon: we need {N} days' notice", "Closed on {weekday}s" (weekday from Settings), or "Not available"; the private block reason is never shown and "Fully booked" never appears.
- [x] AC3 (FR-014): Given an unavailable day, when rendered, then it is struck through, focusable and announced as unavailable with its reason (not by colour alone).
- [x] AC4 (FR-013): Given all days in the horizon are unavailable, when the picker renders, then "No dates available, contact us on WhatsApp" with a WhatsApp button shows.
- [x] AC5 (FR-014): Given an unavailable date is posted, when `placeOrder` runs, then `DATE_UNAVAILABLE` (`fields.date` + reason) and the picker re-renders with fresh statuses, other fields kept, the typed selection survives.
- [x] AC6 (FR-006): Given a seasonal item until 25 Dec in the basket, when the picker renders, then dates after 25 Dec are unavailable with "Not available: {item} is only available {start} to {end}".
- [x] AC7 (FR-014): Given the page stays open across Mauritius midnight, when submitted, then the server re-judges the date against the new today (FR-015 in S-091).
- [x] AC8 (FR-014, NFR-002, NFR-006): Given the picker at 320 px and 375 px, 200% zoom and keyboard-only, when used, then arrow keys, PageUp/PageDown, Home/End and Enter operate it, unavailable days stay focusable, selected day and month are announced, day cells are >= 44 px, FR dates ("sam. 14 déc.") fit without clipping, contrast is AA per `docs/design/tokens.json`, `prefers-reduced-motion` honoured.
- [ ] AC9 (FR-014, NFR-001): Given the picker, when loaded, then it is lazy-loaded with a no-JS fallback (native date input constrained by server validation) and the date change interaction INP <= 200 ms.

## Tests
- AC1..AC4, AC6 → src/app/components/checkout/date-picker.test.tsx, src/tests/e2e/checkout-dates.spec.ts
- AC5 → src/app/server/services/place-order.server.test.ts, src/app/routes/site/basket.test.ts, src/tests/e2e/checkout-dates.spec.ts
- AC7 → src/app/server/services/place-order.server.test.ts (fixed clock either side of Mauritius midnight)
- AC8 → src/tests/e2e/checkout-dates.spec.ts (keyboard, 44 px, 320/375/1280, 200% zoom, axe light/dark, FR)
- AC9 → src/app/components/checkout/checkout-steps.test.tsx, src/tests/e2e/checkout-dates.spec.ts (no-JS field); JS budget by `npm run check:js-budget`

## Notes
- Depends on S-083 (`days: DayStatus[90]`) and S-084 (seasonal windows).
- Copy keys for reasons from the pricing spec UX table; FR strings from copywriter.
- Built 2026-11-13: `src/app/components/checkout/date-picker.tsx` (lazy chunk ~3.3 kB gz) and `date-picker-model.ts`; native date field before hydration and without JavaScript.
- Copy: blocked and too far both read "Not available" (AC2); a past day reads "This day has passed".
- At 200% zoom on a 320 px phone the grid becomes a list of 44 px days (weekday shown in each) so nothing scrolls sideways.
- AC9 caveat: lazy-loading and the no-JS fallback are built and tested; the INP <= 200 ms measurement has no perf spec yet (`perf-budgets.spec.ts` does not exist). Basket route initial JS is 168.9 / 170 kB gz.

## Implementation notes (2026-11-13, E-05 finish)
- AC9 partly met: the calendar is a lazy chunk swapped in after hydration, with a native `<input type=date>` fallback constrained by the server (e2e "S-087 AC9 without JavaScript"). Date statuses are now computed in one pass (`dayStatuses`, S-097 AC3). The INP figure of the date change has not been measured; it belongs with the S-098 AC9 Lighthouse run on staging. AC left open until then.
