# S-205: Every email and push verified end to end on staging in EN and FR
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#rollout--flags
Estimate: 3 pts
Owner: test-engineer, mobile-specialist

## Story
As the Owner, I want proof that every email row and every alert arrives correctly in both languages on real devices before accounts and launch work, so that Phase 5 can close.

## Acceptance Criteria
- [ ] AC1 (FR-070, FR-071): Given staging with the Resend sending domain verified and test inboxes only, when each Appendix B event is triggered in EN and FR, then every customer email arrives once with the right key, language and content (checklist rows recorded pass/fail).
- [ ] AC2 (FR-071, NFR-002): Given a phone mail client and a desktop client, when each email is opened, then there is no horizontal scroll at 320 px, text is readable and buttons are tappable; screenshots are saved.
- [ ] AC3 (FR-072): Given the installed admin app on an iPhone and on an Android phone, when each of the five push alert types is triggered, then the push arrives and tapping opens the correct order or prep list.
- [ ] AC4 (FR-073): Given each WhatsApp template in EN and FR, when opened from an order on a phone, then WhatsApp shows the resolved message with the customer's number.
- [ ] AC5 (FR-074): Given Resend is disabled on staging (key emptied), when an order is placed, then the order is saved, the admin gets a push, and after restoring the key the email arrives once.
- [ ] AC6 (NFR-009): Given a day's staging tests, then total sends stay below the daily limit and the Settings usage figure matches the Resend dashboard.
- [ ] AC7 (FR-070): Given any failed check, then a finding is logged with severity and routed to the owning story; the epic is not marked done with open S1/S2 findings.
- [ ] AC8 (NFR-003): Given the test run, then no real customer address is used and no secret appears in the report.

## Tests
- AC1 → src/tests/e2e/notifications-matrix.spec.ts
- AC2 → production/test-sessions/notifications-staging-2026.md
- AC3 → production/test-sessions/notifications-staging-2026.md
- AC4 → production/test-sessions/notifications-staging-2026.md
- AC5 → src/tests/e2e/notifications-outage.spec.ts
- AC6 → production/test-sessions/notifications-staging-2026.md
- AC7 → production/test-sessions/notifications-staging-2026.md
- AC8 → production/test-sessions/notifications-staging-2026.md

## Notes
- Phase 5 exit for notifications (E-10 success measure). The Owner's own real-phone run is in E-12 (S-237, S-238).
- The report filename will take the actual run date when written.
- Dependencies (R9): S-186..S-204, E-02 (PWA). Not yet done; expected.
