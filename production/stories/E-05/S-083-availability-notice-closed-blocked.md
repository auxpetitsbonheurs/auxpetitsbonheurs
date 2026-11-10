# S-083: Availability rules: notice, closed days, blocked days, horizon
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#decisions-made-in-this-spec-flagged-where-they-differ-from-the-prototype
Estimate: 5 pts
Owner: api-engineer, test-engineer

## Story
As a customer, I want only dates the bakery can really serve to be offered, so that I never pick a day that is later refused.

## Acceptance Criteria
- [ ] AC1 (FR-013): Given today Mon 9 Nov 2026 (Mauritius), default notice 3 and Sunday closed, when `dayStatuses` run, then Tue and Wed are `too_soon`, Thu is available, Sunday is `closed`; today and past dates are `too_soon` (T-AV-1..4).
- [ ] AC2 (FR-013): Given a basket item with notice 5, then the earliest date is today + 5; notice 0 allows today unless closed (T-AV-5, 6).
- [ ] AC3 (FR-013): Given `noticeDaysFor` with items [null,5], [1,null], [] , [2], [0] and default 3, then 5, 3, 3, 2, 0 (largest notice; unset counts as the default; owner-approved Q21; T-AV-22).
- [ ] AC4 (FR-013): Given a block 20-22 Nov, when statuses are listed, then 19 available, 20 and 22 blocked, 23 available; a single-day block on Fri 13 blocks only the 13th (inclusive ends; T-AV-7, 8).
- [ ] AC5 (FR-013, FR-014): Given a date both blocked and closed, then the reason is `blocked`; closed and too soon gives `closed`; priority blocked > closed > too_soon > too_far (T-AV-9, 10).
- [ ] AC6 (FR-013): Given closed weekdays [6,7] or [], when listed, then Sat and Sun are closed or Sunday is available (T-AV-11, 12).
- [ ] AC7 (FR-013): Given the 90-day horizon, when listed, then today+89 is available and today+90 is `too_far`; `dayStatuses` returns 90 entries starting today (T-AV-13, 18).
- [ ] AC8 (FR-013): Given `earliestDate`, when notice 3 on Mon 9, with Thu 12 blocked, and from Thu 12 with Sunday closed, then 12 Nov, 13 Nov and Mon 16 Nov; all days blocked gives null (T-AV-14..17).
- [ ] AC9 (FR-013, NFR-008): Given 2026-11-09T19:59Z and 20:00Z, when the earliest date is computed, then Thu 12 and Fri 13 (Mauritius midnight, never the server zone; T-TM-1, T-AV-19).
- [ ] AC10 (FR-013): Given `assertOrderable` on a closed day it throws `DATE_UNAVAILABLE` with reason closed; on "2026-02-30" it throws `INVALID_DATE` (T-AV-20, 21).
- [ ] AC11 (FR-014): Given `DayStatus`, when serialised, then it contains only date, available and reason and never the private block reason (type-level and runtime assertion).
- [ ] AC12 (FR-056): Given `adminDateWarnings` for blocked Fri 13 and for Sun 15 with today Fri 13, then ["blocked"] and ["closed","too_soon"], never throws (T-AV-23; used by E-07 and E-06 edit).
- [ ] AC13 (NFR-008): Given `time.ts` cases T-TM-1..8 (month end, leap day, weekday, `muDateTimeToInstant`, strict `isValidMuDate`, `diffDays`), then all pass.

## Tests
- AC1 → src/app/domain/availability.test.ts
- AC2 → src/app/domain/availability.test.ts
- AC3 → src/app/domain/availability.test.ts
- AC4 → src/app/domain/availability.test.ts
- AC5 → src/app/domain/availability.test.ts
- AC6 → src/app/domain/availability.test.ts
- AC7 → src/app/domain/availability.test.ts
- AC8 → src/app/domain/availability.test.ts
- AC9 → src/app/domain/availability.test.ts, src/app/domain/time.test.ts
- AC10 → src/app/domain/availability.test.ts
- AC11 → src/app/domain/availability.test.ts
- AC12 → src/app/domain/availability.test.ts
- AC13 → src/app/domain/time.test.ts

## Notes
- Fixture: today Mon 2026-11-09, default notice 3, closed [7]. Property test: available iff earliest <= d, not closed, not blocked, inside horizon.
- Deviation from the brief (largest notice) is owner-approved (Q21).
- Pure domain, no UI, no a11y ACs. Settings editing is E-03 (FR-066).
