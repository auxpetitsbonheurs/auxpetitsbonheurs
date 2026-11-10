# S-229: Privacy audit: data minimisation, cookies, emails and push
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: privacy-compliance-specialist

## Story
As a customer, I want only necessary data collected and shown only to the bakery team, so that my privacy is respected.

## Acceptance Criteria
- [ ] AC1 (NFR-004): Given every customer-visible and admin-visible screen, then customer data (name, phone, address, email) is visible only to signed-in admins; a customer sees only their own orders; verified with three accounts (guest, customer, admin).
- [ ] AC2 (NFR-004): Given each email template and push payload, then it contains only necessary personal data (push: order number and first name only; no admin notes; no other customers' data).
- [ ] AC3 (NFR-004, NFR-011): Given a full browse, order and sign-in session, then no tracking cookie, third-party tracker or consent banner exists; any visitor counter is cookieless and free.
- [ ] AC4 (NFR-004): Given logs and Sentry events from the test run, then they carry no email, phone, address, token or password.
- [ ] AC5 (NFR-004): Given the retention rules in `data-model.md`, then the `purge` job deletes expired data in a staging dry run and nothing newer.
- [ ] AC6 (NFR-004): Given an erase request, then the Owner-triggered anonymise action removes the customer's personal data while keeping order totals for sales, within the 30-day target.
- [ ] AC7 (NFR-004): Given a gap, then it is logged as a finding with severity and owner; none rated high remains open at launch.

## Tests
- AC1 → src/tests/e2e/privacy-visibility.spec.ts
- AC2 → src/app/server/notify/payload-privacy.test.ts
- AC3 → src/tests/e2e/privacy-cookies.spec.ts
- AC4 → production/audits/privacy-2026.md
- AC5 → src/app/jobs/purge.integration.test.ts
- AC6 → src/app/server/customers/anonymise.integration.test.ts
- AC7 → production/audits/privacy-2026.md

## Notes
- Depends on the decisions recorded in S-225. The anonymise action may already exist from E-09; if missing, raise a finding rather than invent scope.
- Dependencies (R9): S-225, E-09, E-10, E-11. Not yet done; expected.
