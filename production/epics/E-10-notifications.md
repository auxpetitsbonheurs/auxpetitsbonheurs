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
| (to be created by /create-stories E-10) | | draft | |

## Dependencies
- E-02 (install, profile switches), E-05, E-06, E-08.

## Risks
- Free email limit (about 100/day); iOS push reliability.

## Cuttable
- FR-075 is Should; not in the PRD cut order (mitigates R11, so keep if possible).
