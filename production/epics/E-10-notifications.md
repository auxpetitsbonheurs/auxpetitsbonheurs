# E-10: Notifications

Status: planned · Milestone: MVP
PRD: FR-070, FR-071, FR-072, FR-073, FR-074, FR-075 (NFR-009) · Specs: docs/specs/features/notifications.md
Release phase: 5 Notifications and accounts (part 1)

## Goal
Customers and admins are never left guessing: bilingual emails, admin push and email alerts, the 18:00 reminder, and WhatsApp templates.

## Success measure
Phase 5 exit: every row of the email table arrives correctly in EN and FR, and a push reaches the installed admin app on iPhone and Android. A provider outage loses no order and retries succeed.

## Scope
- In: all customer emails in the order language (FR-070, FR-071; readable at 320 px), admin push + email alerts, 18:00 reminder, quote-expiry push, preferences (FR-072), WhatsApp templates with placeholders (FR-073), failed-email retry and the 90/day cap behaviour (FR-074), 24 h pending reminder, once per order (FR-075, Should). Replaces the E-01 outbox stub.
- Out: account sign-in link and reset emails' flows (E-11 triggers them; templates are here).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-186 | Order emails are queued and retried so no order is lost when email fails | ready | 5 |
| S-187 | Stay inside the free email limit and show the Owner today's usage | ready | 3 |
| S-188 | Branded, phone-readable email layout in EN and FR | ready | 3 |
| S-189 | Customer gets "received" and "confirmed" emails for orders and requests | ready | 5 |
| S-190 | Customer gets the quote email and is told when a quote closes | ready | 3 |
| S-191 | Customer is told about declines, cancellations and order changes | ready | 3 |
| S-192 | "Ready", "on the way" and "thank you" emails, no noise on internal steps | ready | 3 |
| S-193 | Every email arrives in the customer's language | ready | 2 |
| S-194 | Sign-in, confirmation, reset and invitation emails via Supabase hook | ready | 5 |
| S-195 | Admins alerted by push and email on orders, requests and customer replies | ready | 5 |
| S-196 | Installed admin app receives web push, including a test push | ready | 5 |
| S-197 | Admin controls own push and email alerts from the profile screen | ready | 3 |
| S-198 | 18:00 reminder with tomorrow's order count | ready | 3 |
| S-199 | Admins are told when a quote expires | ready | 2 |
| S-200 | Admins nudged once when an order waits over 24 hours | ready | 3 |
| S-201 | WhatsApp message and link built from templates in the order's language | ready | 3 |
| S-202 | Owner edits WhatsApp templates in Settings with a live preview | ready | 3 |
| S-203 | Admin opens WhatsApp from an order and sees failed emails in the log | ready | 3 |
| S-204 | Phone numbers are stored as Mauritius-friendly E.164 | ready | 2 |
| S-205 | Every email and push verified end to end on staging in EN and FR | ready | 3 |

Total: 67 pts. Story files: `production/stories/E-10/`. All depend on earlier epics (R9) that are not yet done.

## Dependencies
- E-02 (install, profile switches), E-05, E-06, E-08.

## Risks
- Free email limit (about 100/day); iOS push reliability.

## Cuttable
- FR-075 is Should; not in the PRD cut order (mitigates R11, so keep if possible).
