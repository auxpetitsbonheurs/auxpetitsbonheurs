# S-198: Admins get an 18:00 reminder with tomorrow's order count
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#pending-alert-evening-reminder-quote-expired-rules
Estimate: 3 pts
Owner: api-engineer, mobile-specialist

## Story
As an admin, I want a push at 18:00 saying how many orders I have to make tomorrow, so that I can prepare ingredients in the evening.

## Acceptance Criteria
- [ ] AC1 (FR-072): Given tomorrow has 3 confirmed orders, when the 18:00 hour passes, then each admin with push on gets one push "Tomorrow: 3 orders" that opens `/admin/calendar/<tomorrow>/prep`; no email is sent.
- [ ] AC2 (FR-072): Given tomorrow has 0 confirmed orders, then no push is sent but the run key `job_run('evening_reminder', todayMU)` is still claimed.
- [ ] AC3 (FR-072): Given the job runs twice in the 18:00 hour, then each admin receives one push.
- [ ] AC4 (FR-072): Given the tick missed the 18:00 hour, then it still sends on any later tick before 21:00 MU while the run key is unclaimed; after 21:00 nothing is sent.
- [ ] AC5 (FR-072): Given the count, then it uses *confirmed* statuses (approved to completed), so it equals the prep list it opens; pending orders are not counted.
- [ ] AC6 (FR-072, FR-046): Given an admin with push off, or a deactivated admin, then that admin gets nothing.
- [ ] AC7 (FR-072): Given the Owner changes `settings.evening_reminder_at` to 17:00, then the next day's job uses the new hour.
- [ ] AC8 (NFR-008): Given a clock set to 17:59 and 18:00 Mauritius time (UTC+4), then the job decides by MU time, not server time.
- [ ] AC9 (FR-072): Given the push text, then it exists in EN and FR in each admin's locale.

## Tests
- AC1 → src/app/jobs/evening-reminder.test.ts
- AC2 → src/app/jobs/evening-reminder.test.ts
- AC3 → src/app/jobs/evening-reminder.test.ts
- AC4 → src/app/jobs/evening-reminder.test.ts
- AC5 → src/app/jobs/evening-reminder.test.ts
- AC6 → src/app/jobs/evening-reminder.test.ts
- AC7 → src/app/jobs/evening-reminder.test.ts
- AC8 → src/app/jobs/evening-reminder.test.ts
- AC9 → src/app/jobs/evening-reminder.test.ts

## Notes
- Owner decision Q14 (skip on 0) and README decision 5 (confirmed set). Prep list screen is E-07.
- Dependencies (R9): S-196, E-07 (prep list route), E-03 (settings reminder time). Not yet done; expected.
