# S-240: Launch: Owner places and approves a real test order on her own phone, then handover
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#11-release-plan
Estimate: 5 pts
Owner: release-manager

## Story
As the Owner, I want to place a real test order as a customer and approve it as admin on my own phone, then get a walkthrough, so that I am confident running the bakery on the site.

## Acceptance Criteria
- [ ] AC1 (NFR-006): Given the launch build on live, when the Owner places a real test order as a customer on her own phone, then she receives the order-received email and the tracking link works.
- [ ] AC2 (FR-072, NFR-006): Given the installed admin app on her phone, when she approves that order, then the admin push arrived on the new order, the customer receives the confirmed email with the real Juice number and pickup address, and the event log shows who did each step.
- [ ] AC3 (NFR-012): Given the test order, then it is cancelled or marked completed and clearly flagged as a test so it does not pollute sales and customer lists (or removed through the Owner-triggered action).
- [ ] AC4 (NFR-012): Given the walkthrough, then the Owner is shown daily use (Today, approve, calendar, prep list, menu edit, promotion, block a day, invite a helper, Settings, WhatsApp templates) and signs off a checklist; her questions are recorded.
- [ ] AC5 (NFR-012): Given the handover checklist in PRD section 11, then every item is ticked: accounts on the bakery email, two-step sign-in handed over, domain/launch address in the bakery's name, secrets in the bakery's accounts, README, handover sheet, weekly backups with a tested restore, ownership statement, aftercare terms (3 months).
- [ ] AC6 (NFR-012): Given any unticked item, then launch is not announced; the gap and owner are listed.
- [ ] AC7 (NFR-005): Given the first week after launch, then daily checks (orders arrive, emails sent, backup ran) are scheduled with who does them and where problems are reported.
- [ ] AC8 (NFR-012): Given the launch, then nothing is committed, pushed, deployed or migrated by agents without the user's instruction; the Owner or builder performs the final promotion.

## Tests
- AC1 → production/test-sessions/launch-owner-test-order.md
- AC2 → production/test-sessions/launch-owner-test-order.md
- AC3 → production/test-sessions/launch-owner-test-order.md
- AC4 → production/releases/handover-signoff.md
- AC5 → production/releases/handover-signoff.md
- AC6 → production/releases/handover-signoff.md
- AC7 → production/releases/handover-signoff.md
- AC8 → production/releases/launch-checklist.md

## Notes
- Phase 7 exit criterion (PRD section 11). Needs Owner time and her phone; blocked until S-236 and S-239 pass.
- Dependencies (R9): S-234, S-236, S-239. Not yet done; expected.
