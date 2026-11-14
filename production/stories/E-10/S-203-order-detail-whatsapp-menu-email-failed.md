# S-203: Admin opens WhatsApp from an order and sees failed emails in the log
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#ux
Estimate: 3 pts
Owner: ui-engineer

## Story
As an admin on an order, I want a WhatsApp menu with the right message and a clear note when an email did not go through, so that I can reach the customer another way.

## Acceptance Criteria
- [ ] AC1 (FR-073): Given an order with a phone, when I pick a template in the WhatsApp menu, then `wa.me` opens with the message prefilled and editable in WhatsApp; the app records nothing about what was sent.
- [ ] AC2 (FR-073): Given an order with no phone, then the WhatsApp button is disabled with a visible reason.
- [ ] AC3 (FR-074): Given an outbox row went `dead`, then the activity log shows an `email_failed` entry with the reason and a hint to send the tracking link by WhatsApp; the order itself is unaffected.
- [ ] AC4 (FR-074): Given all emails were sent, then the log shows no failure entry.
- [ ] AC5 (FR-073): Given an FR order, then the menu uses the FR template text; given an EN order, EN.
- [ ] AC6 (FR-073): Given a customer or anonymous user, when opening an admin order, then they are redirected to `/admin/login` and no data is returned.
- [ ] AC7 (NFR-002): Given keyboard only, then the menu opens with Enter/Space, arrow keys move between templates, Escape closes and returns focus to the trigger; menu items have accessible names.
- [ ] AC8 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then the menu and log wrap without horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`; the disabled reason is not conveyed by colour alone.
- [ ] AC9 (NFR-007): Given EN and FR admin locales, then template labels and the failure text exist in both.

## Tests
- AC1 → src/tests/e2e/admin-order-whatsapp.spec.ts
- AC2 → src/app/routes/admin/order.whatsapp.test.tsx
- AC3 → src/app/routes/admin/order.whatsapp.test.tsx
- AC4 → src/app/routes/admin/order.whatsapp.test.tsx
- AC5 → src/app/routes/admin/order.whatsapp.test.tsx
- AC6 → src/tests/e2e/admin-order-whatsapp.spec.ts
- AC7 → src/tests/e2e/admin-order-whatsapp.spec.ts
- AC8 → src/tests/e2e/admin-order-whatsapp.spec.ts
- AC9 → src/app/routes/admin/order.whatsapp.test.tsx

## Notes
- UX: spec UX table rows "Order detail > WhatsApp menu" and "activity log"; `docs/design/ux/admin-order-day.md`. Adds to the E-06 order detail screen.
- Dependencies (R9): S-201, S-186, E-06. Not yet done; expected.
