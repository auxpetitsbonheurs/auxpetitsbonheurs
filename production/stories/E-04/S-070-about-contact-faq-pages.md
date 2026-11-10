# S-070: About, Contact and FAQ pages from Settings
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#content-pages-fr-010
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, i18n-specialist

## Story
As a customer, I want to read about the bakery, contact it and find the policies, so that I trust it and know the cancellation and storage rules before I order.

## Acceptance Criteria
- [ ] AC1 (FR-010): Given Settings content, when `/about`, `/contact` and `/faq` load, then About shows text and photo, Contact shows WhatsApp, phone, email and Instagram buttons plus the pickup address with map link, and FAQ shows the Q&A list, policies and privacy note.
- [ ] AC2 (FR-010, NFR-007): Given locale fr and a missing FR About text, when `/fr/about` loads, then the EN text shows; a present FR text shows in FR (fallback per field).
- [ ] AC3 (FR-010): Given the seeded migration data, when `/faq` loads in EN and FR, then both contain the cancellation policy (free via WhatsApp until 48 hours before the order date, no refund after) with anchor `#cancellation`, and the storage advice (refrigerate, out about 30 minutes before serving, best within 2-3 days).
- [ ] AC4 (FR-010): Given an optional block is empty (no About photo, no Instagram), when the page renders, then the block is omitted with no blank area.
- [ ] AC5 (FR-010): Given the pickup address and map URL in Settings, when Contact loads, then they are shown from Settings and a change appears on the next request.
- [ ] AC6 (FR-010): Given Settings rich text with HTML, when rendered, then only plain text with line breaks shows (escaped).
- [ ] AC7 (FR-010): Given a page loader error, when requested, then a page error state shows with a WhatsApp link.
- [ ] AC8 (NFR-002, NFR-006): Given each page at 320 px and 375 px, 200% zoom and keyboard-only, when used, then contact buttons are labelled with distinct names, >= 44 px, the FAQ uses semantic headings or disclosure buttons operable by keyboard, `#cancellation` scrolls and moves focus, contrast is AA per `docs/design/tokens.json`, no sideways scroll.

## Tests
- AC1 → src/app/routes/site/content-pages.test.tsx
- AC2 → src/app/routes/site/content-pages.test.tsx
- AC3 → src/app/db/seed.test.ts
- AC4 → src/app/routes/site/content-pages.test.tsx
- AC5 → src/app/routes/site/content-pages.test.tsx
- AC6 → src/app/routes/site/content-pages.test.tsx
- AC7 → src/app/routes/site/content-pages.test.tsx
- AC8 → src/tests/e2e/browse-content.spec.ts

## Notes
- Seed content (EN/FR) is part of the migration seed; FR text from copywriter. Policy text is a launch value: owner reviews before go-live (E-12).
- Depends on E-01 (settings table, seed mechanism) and E-03 (Settings editor, FR-067).
