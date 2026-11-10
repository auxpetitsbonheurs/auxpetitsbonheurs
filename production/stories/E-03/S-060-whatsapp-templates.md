# S-060: Owner edits WhatsApp message templates with a live preview
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#settings-owner
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, api-engineer

## Story
As the bakery Owner, I want ready-made WhatsApp messages in English and French that fill in the customer's name and order details, so that my helpers answer customers quickly and consistently.

## Acceptance Criteria
- [ ] AC1 (FR-067, FR-073): Given the five templates approved, ready, on_the_way, payment_reminder and blank, each in EN and FR (up to 1000 characters), when I save, then they are stored.
- [ ] AC2 (FR-067): Given a template containing `{name}` and `{unknown}`, when I save, then `VALIDATION_FAILED` names the bad placeholder on `whatsappTemplates.<key>.<locale>` and nothing is saved; the allowed placeholders are `{name}`, `{order_number}`, `{date}`, `{window}`, `{total}`, `{juice_number}`, `{pickup_address}`, `{tracking_link}`.
- [ ] AC3 (FR-067): Given valid templates, then a live preview resolves the placeholders with sample data in EN and in FR, and updates as I type (and works without JavaScript after Save).
- [ ] AC4 (FR-073): Given `renderTemplate(template, values)`, then every placeholder is replaced, a missing French template falls back to the English one, and a value containing `{name}` text is not expanded twice.
- [ ] AC5 (FR-067): Given the Juice number was changed in Settings, then the payment reminder preview shows the new number.
- [ ] AC6 (FR-067): Given a template over 1000 characters, then `VALIDATION_FAILED` and nothing is saved.
- [ ] AC7 (FR-067, FR-054): Given a stale `version`, then `SETTINGS_CHANGED`; given an Admin, an anonymous visitor or a customer, then 403 "Owner only", `FORBIDDEN` or a redirect.
- [ ] AC8 (NFR-002): Given the editor at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; placeholder insert buttons are named ("Insert {name}").
- [ ] AC9 (NFR-002): Given the form, then each textarea has a visible label with template and language, the preview is a labelled region updated politely, errors are linked and focus the summary, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/save-settings.server.test.ts
- AC2 → src/app/domain/whatsapp.test.ts and src/app/server/services/save-settings.server.test.ts
- AC3 → src/tests/e2e/admin-settings.spec.ts
- AC4 → src/app/domain/whatsapp.test.ts
- AC5 → src/app/routes/admin/settings.test.ts
- AC6 → src/app/server/services/save-settings.server.test.ts
- AC7 → src/app/routes/admin/owner-only.test.ts and src/app/server/services/save-settings.server.test.ts
- AC8 → src/tests/e2e/admin-settings.spec.ts
- AC9 → src/tests/e2e/admin-settings.spec.ts

## Notes
- Depends on: S-058.
- Contract: `SettingsInput.whatsappTemplates`, `TemplateKey`, `Placeholder`, loader `previewSample`. The "send via WhatsApp" button on the order screen is E-06 (FR-073).
- Default wording of the five templates in EN and FR is drafted by `copywriter` before launch (E-12); seeded defaults are simple placeholders until then.
