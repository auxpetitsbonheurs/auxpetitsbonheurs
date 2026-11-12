# S-048: Add sizes, flavours, add-ons and a message field to a product
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#product-editor-sections-order
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist, api-engineer

## Story
As a bakery admin, I want to add choices like sizes, flavours and add-ons with their price changes, so that customers can order the cake exactly as they want it.

## Acceptance Criteria
- [x] AC1 (FR-062): Given the quick-add buttons "+ Size", "+ Flavour", "+ Add-ons" and "+ Message", when I press one, then a group card is added with a sensible kind (pick one, pick one, pick several, text), required for Size, and focus moves to its name field.
- [x] AC2 (FR-062): Given a group, then I can set name EN (required) and FR, kind (pick one, pick several, text, quantity), required, and, for text, a max length (blank = Settings default, at most 200), for quantity, min and max (min at most max).
- [x] AC3 (FR-062): Given choices, then each has name EN and FR and a price change in whole rupees that may be 0 or negative (within plus or minus 100,000); a choice with Rs 0 saves and the customer price equals the base.
- [x] AC4 (FR-062): Given a required group with no choices, or a pick-one or pick-several group with no choices, when I save, then `VALIDATION_FAILED` highlights that group, the summary focuses and links to it, and nothing is saved.
- [x] AC5 (FR-062): Given 10 groups, then "Add group" is disabled with the reason; given 30 choices in a group, then "Add choice" is disabled; the server refuses 11 groups or 31 choices.
- [x] AC6 (FR-062): Given I reorder groups and choices with the up/down buttons (and drag), then the order is saved and returned in that order by the product loader.
- [x] AC7 (FR-062): Given a base price Rs 500 and a choice of minus Rs 600, when I edit, then the editor warns "This option can make the price below Rs 0"; saving is allowed (the order step checks the line total).
- [x] AC8 (FR-008, FR-062): Given a text group with max 25, when a customer enters 26 characters, then it is rejected both in the browser and on the server; a blank max uses the Settings value.
- [ ] AC9 (FR-062): Given the scripted task "a cake with 2 sizes, 3 flavours, add-ons and a message field" on a 375 px phone, when a tester who has not seen the editor does it, then it is done in under 5 minutes (the epic's usability criterion).
- [x] AC10 (NFR-002): Given the group cards at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [x] AC11 (NFR-002): Given each group and choice, then fields have visible labels, repeated controls have distinct names ("Remove choice 2 of Size", "Move group Flavour earlier"), add/remove/reorder results are announced in a live region, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/tests/e2e/admin-menu.spec.ts "S-048 … AC1" (each quick-add button, kind, Size required, focus to the name, announced)
- AC2 → src/app/server/services/save-product.server.test.ts "option groups (S-048)" (names, kinds, required, text max ≤ 200 / blank = Settings, quantity min ≤ max)
- AC3 → src/app/server/services/save-product.server.test.ts (Rs 0, negative, ±100,000; paise and over-limit refused) and src/tests/e2e/admin-menu.spec.ts ("Customers pay Rs 1,200" = base with a Rs 0 choice)
- AC4 → src/app/server/services/save-product.server.test.ts (required / optional pick-one and pick-several with no choices) and src/tests/e2e/admin-menu.spec.ts (summary focused, link focuses the highlighted group)
- AC5 → src/app/server/services/save-product.server.test.ts (10 groups and 30 choices save; 11 and 31 refused) and src/tests/e2e/admin-menu.spec.ts (buttons disabled with the reason)
- AC6 → src/app/server/services/save-product.server.test.ts (order and ids kept through findAdminProduct, the loader's read) and src/tests/e2e/admin-menu.spec.ts (Move buttons; dragging a group by its grip, with edge auto-scroll)
- AC7 → src/app/domain/pricing.test.ts (`optionsCanGoBelowZero`) and src/tests/e2e/admin-menu.spec.ts (warning shown, save allowed)
- AC8 → src/app/domain/pricing.test.ts (`textOptionProblem`: 26 of 25 refused, blank max = Settings). Caveat: the customer basket and placeOrder do not handle options yet (E-04/E-05); they must call this shared rule.
- AC9 → manual session production/test-sessions/S-048-option-group-timing.md (not run yet: needs a tester who has not seen the editor; the scripted path itself is automated in admin-menu.spec.ts "AC9 path")
- AC10 → src/tests/e2e/admin-menu.spec.ts (320, 375, 1280 at 100% and 200%: keyboard order, focus, 44 px, nothing clipped, no sideways scroll)
- AC11 → src/tests/e2e/admin-menu.spec.ts (distinct control names, live region, linked errors, axe light and dark)
- Also: `minQuantity` ("Fewest per order") is now editable (contract `ProductInput.minQuantity`), tested in save-product.server.test.ts.

## Notes
- Depends on: S-046.
- Contract: `ProductInput.optionGroups` (contracts.md `admin/product`). The 10 groups and 30 choices limits are the owner's answer Q18 ("enough").
- Customer-side handling of these groups (price, validation at checkout) is E-04 and E-05; this story only stores them and enforces the editing rules.
- Phone-first editor complexity is the epic's risk; if AC9 fails in the session, the fix is a follow-up story, not a larger estimate here.
