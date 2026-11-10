# E-02: Admin access, roles and team

Status: planned · Milestone: MVP
PRD: FR-039, FR-041, FR-042, FR-043, FR-044, FR-046, FR-047 (NFR-003) · Specs: docs/specs/features/admin-access-team.md
Release phase: 1 Foundations (part 2)

## Goal
The Owner can invite, change and deactivate admins; admins use an installable, one-handed phone app and cannot reach Owner-only screens or data.

## Success measure
Phase 1 exit: the Owner invites an Admin by email, the Admin signs in, and the Admin cannot open Owner screens (by menu or typed address). A deactivated admin is signed out at once.

## Scope
- In: server-side role enforcement on every action and read (FR-041), customer sessions refused on /admin (FR-039), invites with 7-day link and resend (FR-042), change role / deactivate / reactivate (FR-043), last-Owner protection (FR-044), My profile with alert switches (FR-046), installable app with bottom bar Today/Orders/Calendar/Menu/More (FR-047). Forgot-password, rate limits on sign-in and reset (NFR-003). A11y acceptance criteria (keyboard, 200% zoom, contrast, 320/375 px) on the admin shell and Team screens.
- Out: push delivery to devices and alert rules (E-10; this epic only installs the app and exposes the profile switches); the sign-in itself (E-01).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| (to be created by /create-stories E-02) | | draft | |

## Dependencies
- E-01 (auth shell, schema).

## Risks
- iOS push needs the installed PWA; the full push check on iPhone and Android is in E-10.
