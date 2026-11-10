# S-234: README and a one-page handover sheet the Owner can use
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#11-release-plan
Estimate: 3 pts
Owner: release-manager

## Story
As the Owner, I want clear documents about every service, how to deploy and restore, and what each setting does, so that the bakery is not dependent on one person.

## Acceptance Criteria
- [ ] AC1 (NFR-012): Given the README, then it explains what each service does, how to run locally, how to deploy (staging and live), how to restore a backup and every setting (including each variable in `.env.example`), and a new developer following it can run the site from a clean clone.
- [ ] AC2 (NFR-012): Given the handover sheet (one page), then each service lists purpose, where to log in (not the password), account email and yearly cost; the only paid item is the domain.
- [ ] AC3 (NFR-012): Given all secrets, then they exist in the bakery's accounts or password manager and none exists only on a developer machine; no real secret appears in the repo or docs.
- [ ] AC4 (NFR-012): Given the handover checklist items in PRD section 11, then each has a tick box with evidence or a link, and unticked items are listed with a reason.
- [ ] AC5 (NFR-012): Given the Owner-facing parts (what each admin screen does, how to add a product, invite a helper, block a day), then they are written in plain language in EN and FR or EN with FR planned, as the Owner chooses.
- [ ] AC6 (NFR-012): Given a link in the docs that is broken or a command that fails when tried, then it is fixed before sign-off (links checked by a script).

## Tests
- AC1 → production/audits/handover-2026.md
- AC2 → production/audits/handover-2026.md
- AC3 → production/audits/handover-2026.md
- AC4 → production/audits/handover-2026.md
- AC5 → production/audits/handover-2026.md
- AC6 → production/audits/handover-2026.md

## Notes
- README started in E-01; this story finalises it. Code, design and content stated to belong to the bakery; builder stays a team member for 3 months aftercare, removable by the Owner.
- Dependencies (R9): E-01, S-232, S-233. Not yet done; expected.
