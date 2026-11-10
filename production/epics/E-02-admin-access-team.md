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
| [S-021](../stories/E-02/S-021-customer-session-refused-on-admin.md) | A customer account can never open admin pages | ready | 2 |
| [S-022](../stories/E-02/S-022-owner-only-role-enforcement.md) | Owner-only screens refuse Admins on the server | ready | 3 |
| [S-023](../stories/E-02/S-023-auth-rate-limits.md) | Rate limits on sign-in and password reset | ready | 3 |
| [S-024](../stories/E-02/S-024-auth-email-hook-recovery.md) | Password reset emails through the auth email hook | ready | 5 |
| [S-025](../stories/E-02/S-025-admin-forgot-password.md) | Ask for a password reset link | ready | 3 |
| [S-026](../stories/E-02/S-026-admin-reset-password.md) | Set a new password from the reset link | ready | 3 |
| [S-027](../stories/E-02/S-027-team-list.md) | Team screen listing admins and pending invitations | ready | 3 |
| [S-028](../stories/E-02/S-028-invite-admin.md) | Invite a helper by email | ready | 5 |
| [S-029](../stories/E-02/S-029-accept-invitation.md) | Accept an invitation and set a password | ready | 3 |
| [S-030](../stories/E-02/S-030-resend-revoke-invite.md) | Resend or revoke an invitation | ready | 2 |
| [S-031](../stories/E-02/S-031-change-role-last-owner.md) | Change an admin's role without losing the last Owner | ready | 5 |
| [S-032](../stories/E-02/S-032-deactivate-reactivate.md) | Deactivate and reactivate an admin | ready | 5 |
| [S-033](../stories/E-02/S-033-admin-shell-bottom-bar.md) | Admin app frame with one-handed bottom bar | ready | 3 |
| [S-034](../stories/E-02/S-034-orders-to-review-dot.md) | Orders badge showing how many need review | draft (contract gap: layout loader needs a review count) | 2 |
| [S-035](../stories/E-02/S-035-installable-app.md) | Install the admin app on the home screen | ready | 3 |
| [S-036](../stories/E-02/S-036-my-profile.md) | My profile with name, language, password and alert switches | ready | 3 |

Total: 53 points (S-021..S-036). Not covered here by design: push subscription, test push and alert rules (E-10). The minimal Resend sender and the recovery and invitation emails are built here (S-024, S-028) because Phase 1 exit needs them; E-10 extends them.

## Dependencies
- E-01 (auth shell, schema).

## Risks
- iOS push needs the installed PWA; the full push check on iPhone and Android is in E-10.
