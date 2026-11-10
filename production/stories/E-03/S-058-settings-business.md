# S-058: Owner edits delivery fee, contacts, Juice number and business rules
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#settings-owner
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, api-engineer, postgres-specialist

## Story
As the bakery Owner, I want to change the delivery fee, pickup address, contact details, Juice number and quote and message rules myself, so that the site is always correct without a developer.

## Acceptance Criteria
- [ ] AC1 (FR-067): Given the Owner, when I open `/admin/settings`, then I see the current delivery fee, pickup address and map link, contact phone, WhatsApp and email, Juice number, Instagram link, quote validity days, cake message maximum, evening reminder time and order number prefix.
- [ ] AC2 (FR-067, FR-019): Given delivery fee 250, when I save, then new delivery orders get Rs 250 and an existing order keeps its stored fee.
- [ ] AC3 (FR-067, FR-003): Given a changed pickup address, when saved, then checkout and the footer show it on the next request with no deployment.
- [ ] AC4 (FR-067): Given a changed Juice number, when saved, then the checkout summary and the tracking page show it on the next request.
- [ ] AC5 (FR-067): Given a fee outside 0 to 100,000, a malformed URL, phone or email, a Juice number over 30 characters, quote validity outside 1 to 60, cake message maximum outside 10 to 200, a time not in HH:mm, or a prefix not matching one to five capital letters with an optional dash, then `VALIDATION_FAILED` marks each field and nothing is saved.
- [ ] AC6 (FR-067): Given a changed order prefix, then only new orders use it and old orders keep their number display.
- [ ] AC7 (FR-067, FR-054): Given two Owners and a stale `version`, when the second saves, then `SETTINGS_CHANGED` shows "Someone changed this. Reload." and nothing is saved.
- [ ] AC8 (FR-041): Given an Admin session, when opening the page or posting `save`, then 403 "Owner only" or `FORBIDDEN`; given an anonymous or customer session, then a redirect and no data.
- [ ] AC9 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px, with one Save at the bottom that stays reachable.
- [ ] AC10 (NFR-002): Given the form, then every field has a visible label, correct input types and keyboards (`tel`, `email`, `url`, `numeric`), errors are linked and focus the summary, "Saved" is announced in a live region, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/admin/settings.test.ts
- AC2 → src/app/server/services/place-order.server.test.ts
- AC3 → src/app/routes/site/basket.test.ts
- AC4 → src/app/routes/site/tracking.test.ts
- AC5 → src/app/server/services/save-settings.server.test.ts
- AC6 → src/app/domain/order-number.test.ts
- AC7 → src/app/server/services/save-settings.server.test.ts
- AC8 → src/app/routes/admin/owner-only.test.ts
- AC9 → src/tests/e2e/admin-settings.spec.ts
- AC10 → src/tests/e2e/admin-settings.spec.ts

## Notes
- Depends on: S-022 (E-02), S-013, S-016 (E-01).
- Contract: `admin/settings` `save` with `SettingsInput` (the action validates the whole object; content fields S-059 and templates S-060 are added as further sections of the same form, so unchanged fields are posted back as loaded).
- Launch values to enter or confirm by the Owner before launch: delivery fee Rs 200 (seeded), pickup "Beau Bassin" with the full address (spec gap: only the area is known), the real Juice number (placeholder until deploy day).
- The loader also lists Resend daily usage (contracts); that figure is produced by notifications (E-10), so it shows "Not available yet" here.
