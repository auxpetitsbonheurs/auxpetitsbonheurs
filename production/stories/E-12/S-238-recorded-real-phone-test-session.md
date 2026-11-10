# S-238: Recorded test session with a customer on a real phone
Status: ready
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#11-release-plan
Estimate: 5 pts
Owner: test-engineer, ux-researcher

## Story
As the Owner, I want to watch a real customer use the real site on their own phone, so that I find confusing steps before launch and not after.

## Acceptance Criteria
- [ ] AC1 (NFR-006): Given a beta build on staging with real content, when a customer (not the builder or Owner) uses their own mid-range phone to order a cake for delivery in EN and a pickup order in FR without help, then the session is recorded (notes, success per task, ease score 1 to 5, and screen or audio recording with the participant's consent) and saved to `production/test-sessions/`.
- [ ] AC2 (NFR-002): Given the same session, then the checklist missing from the 2026-11-10 prototype session is completed: keyboard only (or switch access on a tablet or desktop), 200% zoom on checkout and tracking, contrast of sale prices and greyed dates, 320 px, a second browser, and `prefers-reduced-motion`.
- [ ] AC3 (FR-027): Given the tasks include cancelling a pending order, requesting a custom cake and tracking an order, then each is attempted by the participant without hints; unprompted hesitation is logged.
- [ ] AC4 (NFR-004): Given the session, then only fake or consented data is used, the participant signs consent for the recording, and recordings/notes contain no unnecessary personal data (alias used).
- [ ] AC5 (NFR-006): Given findings, then each has a severity (S1 blocks, S2 major, S3 minor, S4 polish), a route (bug, ux, copy, a11y, perf, scope) and a status; all S1 and S2 findings are triaged in S-239 before launch.
- [ ] AC6 (NFR-006): Given the session cannot be held (no customer available), then the story stays open and launch is blocked; the builder doing a self-test does not satisfy it.
- [ ] AC7 (NFR-002): Given an assistive-technology user (screen reader or zoom) is available, then they are invited for a second short session; if none is, the gap is logged for the Owner.

## Tests
- AC1 → production/test-sessions/launch-real-phone.md
- AC2 → production/test-sessions/launch-real-phone.md
- AC3 → production/test-sessions/launch-real-phone.md
- AC4 → production/test-sessions/launch-real-phone.md
- AC5 → production/test-sessions/launch-real-phone.md
- AC6 → production/test-sessions/launch-real-phone.md
- AC7 → production/test-sessions/launch-real-phone.md

## Notes
- Gate concern 4 (design gate 2026-11-10): the earlier session had no recorded notes, no keyboard/zoom/contrast checks. This is a separate session; Owner is not the "customer" tester. Use the structure of `production/test-sessions/2026-11-10-apb-v1.md`. Real file name takes the session date.
- Recruit via the Owner (a trusted customer); needs Owner time (epic risk).
- Dependencies (R9): S-221..S-223 (real content), S-226, E-01..E-11. Not yet done; expected.
