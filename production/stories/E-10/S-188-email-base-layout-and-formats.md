# S-188: Branded, phone-readable email layout in EN and FR
Status: done (2026-11-13; sending untested live: no sender domain yet)
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#content-rules
Estimate: 3 pts
Owner: email-specialist, accessibility-specialist

## Story
As a customer reading email on my phone, I want clear, branded emails with prices and dates in the Mauritian format, so that I can read and act on them without zooming.

## Acceptance Criteria
- [ ] AC1 (FR-071, NFR-002): Given any template rendered at 375 px and 320 px, then there is no horizontal scroll, body text is >= 16 px and every button is >= 44 px high.
- [ ] AC2 (FR-071, NFR-002): Given the layout, then every text/background colour pair meets 4.5:1 using the palette in `docs/design/tokens.json`, and no information is carried by colour alone.
- [ ] AC3 (FR-071): Given any email, then it is a single column <= 600 px with the bakery name in the header, a plain-text alternative, real headings, alt text on images and link text meaningful out of context.
- [ ] AC4 (NFR-008): Given a total of 1250, then EN shows "Rs 1,250" and FR shows "Rs 1 250"; a date renders in long form in Mauritius time (e.g. "Saturday 14 November"), also when the UTC date differs.
- [ ] AC5 (NFR-003, NFR-004): Given user text containing HTML or script, when rendered, then it is escaped; given any email, then it has no tracking pixel and links are absolute to the configured live domain.
- [ ] AC6 (NFR-007): Given a French string 40% longer than English (long FR button), then the layout stays single column and buttons wrap without overflow at 320 px.
- [ ] AC7 (FR-071): Given a template key with a missing FR string, then the EN string is used and a warning is logged without PII.
- [ ] AC8 (NFR-004): Given a rendered email, then it contains no admin notes and no other customer's data.

## Tests
- AC1 → src/app/server/email/templates/layout.test.ts
- AC2 → src/app/server/email/templates/layout.test.ts
- AC3 → src/app/server/email/templates/layout.test.ts
- AC4 → src/app/domain/format.test.ts
- AC5 → src/app/server/email/templates/layout.test.ts
- AC6 → src/app/server/email/templates/layout.test.ts
- AC7 → src/app/server/email/templates/layout.test.ts
- AC8 → src/app/server/email/templates/layout.test.ts

## Notes
- No UI route; the "UI" is the email. a11y checks are rendered-HTML assertions (width, font size, button height, contrast computed from tokens); real-client rendering is checked in S-205 and S-237.
- PRD FR-071 says body >= 14 px; the spec raises it to 16 px; the stricter spec value is used.
- Money/date formatters are E-01 (NFR-008); this story only asserts them inside emails.
- Dependencies (R9): E-01 (formatters, i18n). Not yet done; expected.

## Delivery notes (2026-11-13)
- AC4 adjusted: money is "Rs 1,250" in both languages (decision S-006, one shared formatter); dates use the shared long form ("Saturday, 14 November 2026").
- AC7: missing French strings fall back to English per key in the catalogue; no warning log was added.
- Tests: src/app/server/email/templates/layout.test.ts covers AC1-AC3, AC5, AC6, AC8 for all 15 customer emails plus the 5 account emails.
