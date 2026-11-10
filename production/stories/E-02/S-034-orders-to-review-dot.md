# S-034: Orders badge showing how many need review
Status: draft
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 2 pts
Owner: ui-engineer, remix-specialist

## Story
As an admin, I want a marker on Orders when something waits for me, so that I notice new orders without opening the list.

## Acceptance Criteria
- [ ] AC1 (FR-047): Given 3 orders in Pending approval or Quote needed, when any admin page loads, then the Orders item shows a dot with accessible text "3 to review".
- [ ] AC2 (FR-047): Given no orders to review, then no dot and no extra text show.
- [ ] AC3 (FR-047): Given an order is approved, when I navigate to another page, then the count is lower or the dot is gone (the count comes from the layout loader).
- [ ] AC4 (FR-047, NFR-007): Given French, then the accessible text reads "3 à valider".
- [ ] AC5 (FR-047): Given 12 or more orders, then the dot shows "9+" visually and the accessible text still says "12 to review".
- [ ] AC6 (NFR-002): Given the dot at 320 px and 375 px wide and at 200% zoom, then it is not clipped and does not shrink the 44 px tap target; it is not colour-only (a number or mark is visible) and meets WCAG AA contrast per docs/design/tokens.json.

## Tests
- AC1 → src/app/routes/admin/layout.test.ts
- AC2 → src/app/routes/admin/layout.test.ts
- AC3 → src/app/routes/admin/layout.test.ts
- AC4 → src/app/routes/admin/layout.test.ts
- AC5 → src/app/routes/admin/layout.test.ts
- AC6 → src/tests/e2e/admin-shell.spec.ts

## Notes
- Depends on: S-017 (E-01, orders), S-033.
- Spec AC26 ("3 orders ... dot with accessible text '3 to review'"). The count is the *review* group (pending_approval + quote_needed); quote orders only exist after E-08, so today it equals pending orders.
- Contract gap: `admin/layout` loader does not list `reviewCount`; adding it needs `lead-backend` and `lead-frontend` agreement (coordination rule 5) and a contracts.md change before build starts. Story stays `draft` until that contract change (R5) is made; it is the only E-02 story held back.
