# S-269: Reviews accessibility, language, performance and journey sweep
Status: ready
Epic: E-14-customer-reviews
Spec: docs/design/design-system.md#accessibility-rules · PRD section 6
Estimate: 3 pts
Owner: test-engineer, accessibility-specialist, i18n-specialist

## Story
As a customer and as the Owner, I want the whole review journey to work on a phone in both languages, so that nobody is blocked or confused.

## Acceptance Criteria
- [ ] AC1 (NFR-002): Given the review form, Reviews page, Home section and admin Reviews in EN and FR at 375 px and 1280 px, light and dark, then axe finds no serious or critical violation and contrast meets AA per docs/design/tokens.json.
- [ ] AC2 (NFR-002): Given the star control, then it works with keyboard (arrow keys move between options, Space selects), touch and screen reader (announces "3 stars, 3 of 5 selected"), and stars have a text equivalent everywhere they show.
- [ ] AC3 (NFR-007): Given every review string (labels, errors, statuses, notes, empty states, toasts) , then it exists in EN and FR and the FR text fits at +30% and with a pseudo-locale +40%.
- [ ] AC4 (J-review, FR-082, FR-083, FR-085): Given the journey, when a signed-in customer posts a 5-star review, the Admin approves it from the badge, then Home and `/reviews` show it within 60 s as "Name L." with the date; when the customer edits it, it disappears until approved again; when the Admin hides it, it disappears; when the customer deletes it, it is gone. The e2e runs with the email sender mocked.
- [ ] AC5 (NFR-001): Given Home and `/reviews` with 50 approved reviews on throttled 4G, then LCP <= 2.5 s, CLS <= 0.1, route JS <= 170 kB gz (`check-js-budget`), Lighthouse accessibility >= 95.
- [ ] AC6 (NFR-003): Given the whole epic, then a security pass confirms no unapproved review text reaches any public response, `GET /api/menu`, caches or logs, and rate limits and guards hold (written into the audit file production/audits/reviews-security.md).
- [ ] AC7 (FR-082): Given a real phone width, then ux-lead signs off the form and the Home section (owner preference) and the 1-minute posting time is checked in a manual session (production/test-sessions/E-14-post-review.md).

## Tests
- AC1 → src/tests/e2e/reviews.spec.ts, src/tests/e2e/admin-reviews.spec.ts (axe)
- AC2 → src/tests/e2e/reviews.spec.ts, src/app/components/site/star-rating.test.tsx
- AC3 → src/app/i18n/catalogue.test.ts, src/tests/e2e/reviews.spec.ts (pseudo-locale)
- AC4 → src/tests/e2e/reviews.spec.ts (journey)
- AC5 → src/tests/e2e/perf-budgets.spec.ts
- AC6 → src/tests/e2e/reviews.spec.ts plus security-lead audit file
- AC7 → manual session file

## Notes
- Last story of the epic. Depends on S-261 to S-268.
- The real end-to-end check (new customer confirms by email) waits for Resend on a custom domain (E-10).
