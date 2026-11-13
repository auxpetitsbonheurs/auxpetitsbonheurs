# S-192: Customer gets "ready", "on the way" and "thank you" emails, and no noise on internal steps
Status: done (2026-11-13; sending untested live: no sender domain yet)
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#email-catalogue
Estimate: 3 pts
Owner: email-specialist

## Story
As a customer, I want to hear when my order is ready or on its way and a thank-you afterwards, and not be emailed about internal steps, so that every email I get is useful.

## Acceptance Criteria
- [ ] AC1 (FR-070): Given status becomes Ready for pickup, then one `ready_for_pickup` email shows pickup address, date and window.
- [ ] AC2 (FR-070): Given status becomes Out for delivery, then one `on_the_way` email shows delivery window and address.
- [ ] AC3 (FR-070, FR-071): Given status becomes Completed, then one `thank_you` email links to order again and to Instagram.
- [ ] AC4 (FR-070): Given an admin uses Back one step, then no email is sent.
- [ ] AC5 (FR-070): Given Approved moves to In preparation, then no email is sent.
- [ ] AC6 (FR-070): Given Mark paid, then no email is sent.
- [ ] AC7 (FR-070): Given Back one step then Next again to the same status, then a new status email is sent only because the `dedupe_key` includes the order version; a double tap on the same version sends one.
- [ ] AC8 (FR-070): Given a manual order without an email moves through statuses, then no outbox rows are created.
- [ ] AC9 (FR-074): Given the cap is at 90, then `thank_you` is deferred while `ready_for_pickup` and `on_the_way` still send (see S-187).

## Tests
- AC1 → src/app/server/email/templates/fulfilment.test.ts
- AC2 → src/app/server/email/templates/fulfilment.test.ts
- AC3 → src/app/server/email/templates/thank-you.test.ts
- AC4 → src/app/server/orders/status-emails.test.ts
- AC5 → src/app/server/orders/status-emails.test.ts
- AC6 → src/app/server/orders/status-emails.test.ts
- AC7 → src/app/server/orders/status-emails.test.ts
- AC8 → src/app/server/orders/status-emails.test.ts
- AC9 → src/app/server/email/daily-cap.test.ts

## Notes
- Transition rules are PRD Appendix B; the status machine is E-06.
- Thank-you has no review ask (reviews are out of v1).
- Dependencies (R9): S-186, S-188, S-187, E-06. Not yet done; expected.
