# S-202: Owner edits WhatsApp templates in Settings with a live preview
Status: done
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#whatsapp-templates
Estimate: 3 pts
Owner: ui-engineer, api-engineer

## Story
As the Owner, I want to edit my WhatsApp messages in English and French and see how they will look, so that messages sound like me.

## Acceptance Criteria
- [ ] AC1 (FR-073): Given Settings > WhatsApp templates, then the five templates are shown with EN and FR fields seeded with defaults, and a live preview with sample order values per language.
- [ ] AC2 (FR-073): Given the Owner saves valid templates, then they are stored in `settings.whatsapp_templates` and the next resolved message uses them.
- [ ] AC3 (FR-073): Given an unknown placeholder such as `{foo}`, when the Owner saves, then the save is rejected with an inline error on that template and language (`whatsappTemplates.<key>.<locale>`) and nothing is saved.
- [ ] AC4 (FR-073, NFR-003): Given an Admin who is not Owner, when saving templates, then 403 and the screen is hidden from them.
- [ ] AC5 (FR-073): Given another Owner saved first, then `SETTINGS_CHANGED` shows a Reload prompt and no overwrite.
- [ ] AC6 (FR-073): Given the page is loading, then a skeleton shows; given an empty FR field, then the preview says "EN text will be used".
- [ ] AC7 (NFR-002): Given keyboard only, then all fields, the preview and Save are reachable with visible focus; errors are tied to fields via `aria-describedby` and announced.
- [ ] AC8 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll and tap targets >= 44 px; labels are visible, contrast meets WCAG AA per `docs/design/tokens.json`.
- [ ] AC9 (NFR-007): Given the screen in EN and FR, then all labels exist in both languages.

## Tests
- AC1 → src/app/routes/admin/settings.whatsapp.test.tsx
- AC2 → src/app/routes/admin/settings.whatsapp.test.tsx
- AC3 → src/app/routes/admin/settings.whatsapp.test.tsx
- AC4 → src/tests/e2e/admin-settings-whatsapp.spec.ts
- AC5 → src/app/routes/admin/settings.whatsapp.test.tsx
- AC6 → src/app/routes/admin/settings.whatsapp.test.tsx
- AC7 → src/tests/e2e/admin-settings-whatsapp.spec.ts
- AC8 → src/tests/e2e/admin-settings-whatsapp.spec.ts
- AC9 → src/app/routes/admin/settings.whatsapp.test.tsx

## Notes
- Adds the WhatsApp section to the E-03 Settings screen and the placeholder validation to `admin/settings` `save` (contracts.md row). Placeholder allow-list: `{name} {order_number} {date} {window} {total} {juice_number} {pickup_address} {tracking_link}`.
- Dependencies (R9): S-201, E-03 (Settings), E-02 (Owner role). Not yet done; expected.

## Implementation notes
- Implemented 2026-11-13. Templates are posted as `whatsappTemplates.<key>.<en|fr>`; a Settings save without them keeps the stored ones (other forms are unaffected). English is required, French optional (empty = EN used). The loader returns `previewSample` (sample order values per language) and `settings.whatsappTemplates` with defaults filled in.
