# S-195: Admins are alerted by push and email on new orders, requests and customer replies
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#alert-matrix-who-gets-what
Estimate: 5 pts
Owner: api-engineer, email-specialist

## Story
As an admin, I want a push and an email when a new order, request, quote answer or cancellation arrives, according to my own switches, so that I never miss an order while I am baking.

## Acceptance Criteria
- [ ] AC1 (FR-072): Given alerts on, when a website order is placed, then each opted-in active admin receives a push and an `admin_alert_new_order` email showing order number and first name, with a link to `/admin/orders/<id>`.
- [ ] AC2 (FR-072): Given a new custom request, a quote accepted, a quote declined or a customer cancellation, then the same push + email alert is sent with the matching key (`admin_alert_new_request`, `_quote_accepted`, `_quote_declined`, `_customer_cancelled`).
- [ ] AC3 (FR-072, FR-046): Given an admin with `alert_push` off and `alert_email` on, then that admin gets email only.
- [ ] AC4 (FR-072, FR-046): Given an admin with both switches off, then that admin gets nothing.
- [ ] AC5 (FR-072, FR-043): Given a deactivated admin, then nothing is sent and their push subscriptions are deleted.
- [ ] AC6 (FR-074): Given Resend is down when an order is placed, then admins are still alerted by push, and the alert email stays in the outbox for retry.
- [ ] AC7 (FR-072): Given an admin has no push subscription, then the email alert is still sent if its switch is on.
- [ ] AC8 (NFR-004): Given any alert, then the push body and email carry order number and first name only (no address, phone or items), in the admin's own locale.
- [ ] AC9 (FR-072): Given a manual order created by an admin, then no new-order alert is sent to admins.
- [ ] AC10 (FR-074, NFR-009): Given the daily cap is at 90, then `admin_alert_*` emails are deferred (non-critical) while push still goes out.
- [ ] AC11 (FR-072): Given push `tag` = `<event>:<id>`, then a repeated alert for the same event collapses on the device; given two admins, then each receives their own copy.

## Tests
- AC1 → src/app/server/notify/admin-alerts.test.ts
- AC2 → src/app/server/notify/admin-alerts.test.ts
- AC3 → src/app/server/notify/admin-alerts.test.ts
- AC4 → src/app/server/notify/admin-alerts.test.ts
- AC5 → src/app/server/notify/admin-alerts.test.ts
- AC6 → src/app/server/notify/admin-alerts.test.ts
- AC7 → src/app/server/notify/admin-alerts.test.ts
- AC8 → src/app/server/notify/admin-alerts.test.ts
- AC9 → src/app/server/notify/admin-alerts.test.ts
- AC10 → src/app/server/email/daily-cap.test.ts
- AC11 → src/app/server/notify/admin-alerts.test.ts

## Notes
- Matrix in spec "Alert matrix". Push sender internals are S-196; the three push-only alerts are S-198, S-199, S-200.
- The unresolved iOS push risk (architecture T1) is why email goes with push for these four alerts.
- Dependencies (R9): S-186, S-196, E-02 (admin alert switches, deactivation), E-05, E-08. Not yet done; expected.
