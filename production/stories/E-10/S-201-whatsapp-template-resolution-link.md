# S-201: WhatsApp message and link built from templates in the order's language
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#whatsapp-templates
Estimate: 3 pts
Owner: api-engineer

## Story
As an admin, I want a WhatsApp chat to open with the customer's number and a ready message in their language, so that I can message them in two taps.

## Acceptance Criteria
- [ ] AC1 (FR-073): Given each template key (`approved`, `ready`, `on_the_way`, `payment_reminder`, `blank`) and each locale, when resolved for a delivery order, then all placeholders are replaced and no braces remain.
- [ ] AC2 (FR-073): Given an FR order with an empty FR template, then the EN text is used.
- [ ] AC3 (FR-073): Given a phone +23057123456, when calling `whatsappLink`, then the URL is `https://wa.me/23057123456?text=` followed by the URL-encoded message; no state change and no order event.
- [ ] AC4 (FR-073): Given a placeholder with no value (e.g. `{pickup_address}` on a delivery order), then it resolves to an empty string and double spaces are collapsed.
- [ ] AC5 (FR-073): Given `payment_reminder`, then it includes `{juice_number}` and `{total}` ("Rs 1,250") from Settings.
- [ ] AC6 (FR-073): Given an order with no phone, then `whatsappLink` returns `VALIDATION_FAILED` with a field message.
- [ ] AC7 (FR-073): Given a non-admin caller, then `whatsappLink` is refused (403/redirect) and returns nothing; given an unknown order id, `NOT_FOUND`.
- [ ] AC8 (NFR-003): Given customer names with `&`, `#`, emoji or newline, then the text is correctly encoded and cannot alter the URL host or path.
- [ ] AC9 (FR-073): Given a `whatsapp_link_opened` event, then a server-side counter is recorded with template key and locale only (no PII).

## Tests
- AC1 → src/app/domain/whatsapp.test.ts
- AC2 → src/app/domain/whatsapp.test.ts
- AC3 → src/app/routes/admin/order.whatsapp.test.ts
- AC4 → src/app/domain/whatsapp.test.ts
- AC5 → src/app/domain/whatsapp.test.ts
- AC6 → src/app/routes/admin/order.whatsapp.test.ts
- AC7 → src/app/routes/admin/order.whatsapp.test.ts
- AC8 → src/app/domain/whatsapp.test.ts
- AC9 → src/app/routes/admin/order.whatsapp.test.ts

## Notes
- Needs `domain/phone.ts` (S-204 or E-05). Customer-side "WhatsApp us" on tracking is owned by E-05 (spec row "Tracking WhatsApp"), not duplicated here.
- Dependencies (R9): S-204, E-06 (order detail loader). Not yet done; expected.
