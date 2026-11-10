# S-056: Owner sets notice days, closed days and time windows
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#availability-owner
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, api-engineer, postgres-specialist

## Story
As the bakery Owner, I want to set how many days of notice I need, which weekdays I am closed and the delivery and pickup time windows, so that customers can only choose times I can really serve.

## Acceptance Criteria
- [ ] AC1 (FR-066): Given the Owner, when I open `/admin/availability`, then I see default notice days (3), closed weekdays (Sunday), and separate delivery and pickup window lists (Morning 09:00-12:00, Afternoon 12:00-17:00, Evening 17:00-20:00), each window with a label in EN and FR, start and end.
- [ ] AC2 (FR-066): Given notice days 0 to 60, closed weekdays not all 7 and windows with start before end, when I save, then the rules are stored and the version increases by 1.
- [ ] AC3 (FR-066): Given overlapping windows in a list, a window with start not before end, a list with no window or more than 6, all 7 weekdays closed, or notice days of 61, then `VALIDATION_FAILED` marks the field and nothing is saved.
- [ ] AC4 (FR-066, FR-020): Given edited windows, when a guest opens checkout (S-013), then the window choices show the new delivery and pickup lists separately, and a window id that is no longer listed is refused on submit.
- [ ] AC5 (FR-066): Given existing windows, then their ids are kept when I edit them (stable ids), and an order placed earlier keeps its window snapshot after the window is renamed or removed.
- [ ] AC6 (FR-066): Given I close a weekday that has active orders, then the response lists those orders (`affectedOrders`) as a warning, the rules are saved, and the orders are unchanged.
- [ ] AC7 (FR-066): Given two Owners and a stale `version`, when the second saves, then `SETTINGS_CHANGED` shows "Someone changed this. Reload." and nothing is saved.
- [ ] AC8 (FR-041): Given an Admin session, when opening the page or posting `saveRules`, then 403 "Owner only" or `FORBIDDEN`; given an anonymous or customer session, then a redirect and no data.
- [ ] AC9 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC10 (NFR-002): Given the weekday toggles and window rows, then each has a visible label and distinct name ("Closed on Sunday", "Delivery window 2 start"), times use a text format hint (HH:mm), errors are linked and focus the summary, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/admin/availability.test.ts
- AC2 → src/app/server/services/save-availability.server.test.ts
- AC3 → src/app/server/services/save-availability.server.test.ts
- AC4 → src/app/server/services/place-order.server.test.ts and src/tests/e2e/admin-availability.spec.ts
- AC5 → src/app/server/services/save-availability.server.test.ts
- AC6 → src/app/server/services/save-availability.server.test.ts
- AC7 → src/app/server/services/save-availability.server.test.ts
- AC8 → src/app/routes/admin/owner-only.test.ts
- AC9 → src/tests/e2e/admin-availability.spec.ts
- AC10 → src/tests/e2e/admin-availability.spec.ts

## Notes
- Depends on: S-022 (E-02 Owner guard), S-004, S-013 (E-01).
- Contract: `admin/availability` loader and `saveRules` with `AvailabilityInput` (contracts.md). How notice and closed days disable dates for customers (spec AC31, AC32) is the pricing and availability domain in E-05; this story stores the rules.
- Blocked dates are S-057 (same page).
