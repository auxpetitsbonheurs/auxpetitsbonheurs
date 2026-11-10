# S-237: Appendix A launch test checklist passes on staging
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#appendix-a-launch-test-checklist-traceability
Estimate: 5 pts
Owner: test-engineer

## Story
As the Owner, I want every launch check run and passed before customers arrive, so that the core promises (orders, rules, alerts, emails, backup) are proven.

## Acceptance Criteria
- [ ] AC1 (FR-018, FR-019, FR-024, FR-025): Given staging, when a delivery order and a pickup order are placed, then both succeed with correct fees and tracking pages.
- [ ] AC2 (FR-015, FR-059): Given a date blocked after checkout opened, when the customer submits, then the order is refused with `DATE_UNAVAILABLE`.
- [ ] AC3 (FR-013): Given a product with longer notice, then the earliest selectable date moves accordingly.
- [ ] AC4 (FR-016, FR-017, FR-063): Given a promotion, then its price shows and is charged, and disappears after the end time.
- [ ] AC5 (FR-028..FR-032): Given a custom request, a quote, an accept, and an expired quote, then accept works before expiry and fails after.
- [ ] AC6 (FR-027): Given a pending order, then the customer can cancel; given an approved order, then the cancel button is gone.
- [ ] AC7 (FR-075): Given a website order Pending approval for over 24 h, then exactly one admin push is sent.
- [ ] AC8 (FR-055, FR-058, FR-060): Given a manual order, then it shows in the calendar and prep list.
- [ ] AC9 (FR-041, FR-066, FR-067, FR-043): Given an Admin, then Owner-only screens are hidden and blocked, and a deactivated admin is signed out.
- [ ] AC10 (FR-070, FR-071, FR-073): Given all emails and WhatsApp templates, then they are correct in EN and FR.
- [ ] AC11 (FR-068): Given the sales summary, then its totals equal the sum of the underlying orders.
- [ ] AC12 (NFR-005): Given the backup, then it ran and S-232's restore evidence exists.
- [ ] AC13 (FR-075, NFR-005): Given any failed check, then it is logged with severity and routed; the run is repeated after the fix and the final pass is recorded.

## Tests
- AC1 → src/tests/e2e/appendix-a-orders.spec.ts
- AC2 → src/tests/e2e/appendix-a-orders.spec.ts
- AC3 → src/tests/e2e/appendix-a-orders.spec.ts
- AC4 → src/tests/e2e/appendix-a-promotions.spec.ts
- AC5 → src/tests/e2e/appendix-a-quotes.spec.ts
- AC6 → src/tests/e2e/appendix-a-orders.spec.ts
- AC7 → src/app/jobs/pending-alerts.test.ts
- AC8 → src/tests/e2e/appendix-a-manual-order.spec.ts
- AC9 → src/tests/e2e/appendix-a-roles.spec.ts
- AC10 → production/test-sessions/appendix-a-staging.md
- AC11 → src/tests/e2e/appendix-a-sales.spec.ts
- AC12 → production/audits/backup-restore-2026.md
- AC13 → production/test-sessions/appendix-a-staging.md

## Notes
- This is a verification story with no new FRs; it re-uses the per-epic tests and adds missing e2e for each Appendix A row. FR IDs are those of PRD Appendix A.
- Dependencies (R9): E-01..E-11, S-232. Not yet done; expected.
