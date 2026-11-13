# S-052: Promotions list with automatic Scheduled, Live and Ended
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#promotions
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, api-engineer

## Story
As a bakery admin, I want to see each promotion's state and end one early with a switch, so that offers start and stop on their own without me watching the clock.

## Acceptance Criteria
- [ ] AC1 (FR-063): Given a promotion starting tomorrow 09:00 Mauritius time, when I open `/admin/promotions`, then its badge says "Scheduled"; at 09:00 (fixed clock) the same promotion says "Live" with no job or admin action.
- [ ] AC2 (FR-063, FR-016): Given a promotion ending at 18:00, then at 17:59 it is Live and at 18:00 it is Ended (end is exclusive).
- [ ] AC3 (FR-063): Given a live promotion, when I turn the active switch off ("End early"), then it shows "Inactive" at once (inactive wins over dates) and its banner, card and discounts stop applying.
- [ ] AC4 (FR-063): Given a promotion that is Scheduled, Ended or Inactive, when I confirm Delete, then it is removed and orders that used it keep their promotion snapshot; given a Live one, then Delete is refused with "End it first".
- [ ] AC5 (FR-063): Given each row, then it shows title, start and end in Mauritius time, placement, discounted product count and a text status badge.
- [ ] AC6 (FR-063): Given no promotions, then "No promotions yet." and a "New promotion" button show; given a load failure, then an Alert with Retry shows.
- [ ] AC7 (FR-041): Given an Admin or Owner, then they can use the list and the switch; given a customer or anonymous visitor, then redirect or refusal.
- [ ] AC8 (NFR-002): Given the list at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC9 (NFR-002): Given the switch and delete buttons, then names include the promotion ("Active: Easter offer", "Delete Easter offer"), status is text not colour only, results are announced in a live region, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/domain/promotions.test.ts (`promotionStatus(now)`, fixed clock)
- AC2 → src/app/domain/promotions.test.ts
- AC3 → src/app/routes/admin/promotions.test.ts
- AC4 → src/app/routes/admin/promotions.test.ts
- AC5 → src/app/routes/admin/promotions.test.ts
- AC6 → src/tests/e2e/admin-promotions.spec.ts
- AC7 → src/app/routes/admin/promotions.test.ts
- AC8 → src/tests/e2e/admin-promotions.spec.ts
- AC9 → src/tests/e2e/admin-promotions.spec.ts

## Notes
- As built (2026-11-13): `/admin/promotions`, linked from More. Built: AC1, AC2 (domain `promotionStatus`), AC3 ("Turn off" / "Turn on"; status "Inactive"), AC4 (Delete hidden on a Live row and refused on the server: "End it first"), AC5, AC6 empty state (load failure uses the admin error boundary, no inline Retry), AC7. Buttons are named "Turn off: <title>" / "Delete: <title>" (AC9 wording differs). Tests: `src/app/routes/admin/promotion.test.ts`, `src/tests/e2e/admin-promotions.spec.ts`.
- Depends on: S-004 (E-01), S-033 (E-02 frame).
- Contract: `admin/promotions` loader and `setActive`, `delete`. "Live" is computed from `now` (data-model `promotion`), never stored; the predicate is shared with price rules (E-05).
- Delete of a Live promotion: the spec says delete is for Scheduled, Ended or Inactive only but gives no error code; decision: `VALIDATION_FAILED` with the message above.
