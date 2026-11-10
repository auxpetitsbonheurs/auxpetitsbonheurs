# S-225: A short privacy note and every [TO CONFIRM] item settled
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: privacy-compliance-specialist, copywriter

## Story
As a customer, I want a plain explanation of what the bakery collects and why, so that I can trust the site with my details.

## Acceptance Criteria
- [ ] AC1 (NFR-004): Given the privacy page in EN and FR, then it lists what is collected (name, email, phone, delivery address, order data, photos for requests), why, who sees it (admins only), the retention periods and how to ask for erasure (Owner action within 30 days).
- [ ] AC2 (NFR-004): Given the `[TO CONFIRM]` items (applicable regime Mauritius Data Protection Act 2017, retention periods, data controller, uptime target), then each has a recorded decision by the Owner or is explicitly marked "accepted as best effort", and PRD and privacy note agree.
- [ ] AC3 (NFR-004): Given the note mentions that forwarded emails expose the order page via the tracking link, then that limitation is stated plainly.
- [ ] AC4 (NFR-004): Given the checkout, custom request, sign-up and save-details forms, then each links to the privacy note near the submit button.
- [ ] AC5 (NFR-004, NFR-011): Given any public page, then no tracking cookie or consent banner is needed (cookies are only the session and bot-check necessities).
- [ ] AC6 (NFR-004): Given the retention periods stated, then they match the `purge` job (e.g. outbox payloads deleted after 90 days).
- [ ] AC7 (NFR-004): Given the Owner has not decided a `[TO CONFIRM]` item, then the story is blocked and the open item is listed in the report rather than invented.

## Tests
- AC1 → src/tests/e2e/privacy-note.spec.ts
- AC2 → production/audits/privacy-2026.md
- AC3 → src/tests/e2e/privacy-note.spec.ts
- AC4 → src/tests/e2e/privacy-note.spec.ts
- AC5 → production/audits/privacy-2026.md
- AC6 → src/app/jobs/purge.test.ts
- AC7 → production/audits/privacy-2026.md

## Notes
- Legal review is the Owner's call; this story does not give legal advice. Decisions (regime, retention, controller, uptime) belong to the Owner (PRD open question 12). Needs Owner time.
- Dependencies (R9): E-10 (purge), E-11. Not yet done; expected.
