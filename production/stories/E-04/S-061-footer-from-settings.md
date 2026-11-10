# S-061: Footer with contact details from Settings
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#footer
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As a customer on any page, I want the bakery's WhatsApp, phone, email, Instagram, pickup address and links to FAQ and policies in the footer, so that I can reach the bakery without hunting for contact details.

## Acceptance Criteria
- [ ] AC1 (FR-003): Given Settings contain WhatsApp, phone, email, Instagram and pickup address (Beau Bassin at launch), when any customer page loads in EN or FR, then the footer shows each value as a working link (`https://wa.me/`, `tel:`, `mailto:`, Instagram URL, map link) plus links to FAQ and policies (`/faq#cancellation`).
- [ ] AC2 (FR-003): Given a Settings value is changed by the Owner, when the next request is made, then the footer shows the new value with no deployment (pages are `no-store`).
- [ ] AC3 (FR-003): Given a Settings value is empty (for example no Instagram), when a page loads, then that footer item is omitted and no blank row or empty link remains.
- [ ] AC4 (FR-003, NFR-007): Given the page locale is fr, when the footer renders, then labels are French and links point to `/fr/faq`.
- [ ] AC5 (NFR-002, NFR-006): Given the footer at 320 px and 375 px, at 200% zoom and keyboard-only, when every link is focused, then each has a visible focus ring, a visible text label (icon-only links have an accessible name that is distinct per link, no copied aria-labels), a tap target >= 44 px, AA contrast per `docs/design/tokens.json`, and there is no horizontal scroll.
- [ ] AC6 (FR-003): Given Settings text contains HTML tags, when rendered, then they are escaped as text (no HTML injection).

## Tests
- AC1 → src/app/components/layout/footer.test.tsx
- AC2 → src/tests/e2e/layout-footer.spec.ts
- AC3 → src/app/components/layout/footer.test.tsx
- AC4 → src/app/components/layout/footer.test.tsx
- AC5 → src/tests/e2e/layout-footer.spec.ts (axe, 320/375 viewports, keyboard, zoom)
- AC6 → src/app/components/layout/footer.test.tsx

## Notes
- Depends on E-01 (root loader, settings table, i18n) and E-03 (Settings data); R9 expected until those are done.
- Pickup address and Juice number are launch values; Juice number is a fake placeholder until deploy day (not shown here).
- Self-check R1-R8 pass; no open question.
