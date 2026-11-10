# UX Flow — Admin onboarding and team (invite, set password, install PWA, enable push)

PRD: FR-040..047, 072 · Journey: J9 · Spec: `admin-access-team` (+ `notifications`) · Personas: P2 Owner (inviter), P3 Admin (invitee) · Device: phone; iPhone and Android · Critical journey: yes · Updated: 2026-11-10

## Goal
A helper becomes a working admin in minutes: invited, password set, app on the home screen, push alerts on. Success = admin signed in, installed, test push received, cannot reach Owner screens; Owner can deactivate them and they are signed out immediately.

## Entry points
- Owner: More > Team (`/admin/team`, Owner only).
- Invitee: invitation email (EN or FR) with link `/admin/invite/:token`, valid 7 days.
- First sign-in prompts install and push on `/admin/profile`.

## Happy path
```mermaid
flowchart TD
  A[Owner: Team] --> B[Invite: name, email, role, email language]
  B --> C[Invitation email queued]
  C --> D[Invitee opens /admin/invite/token]
  D --> E{Token valid?}
  E -->|no| X[Link expired: ask Owner to resend]
  E -->|yes| F[Set password + language]
  F --> G[Signed in at /admin Today]
  G --> H[Install prompt: Add to home screen]
  H --> I[/admin/profile: Enable push]
  I --> J[Send test push]
  J --> K[Ready]
  A --> L[Owner: change role / deactivate / reactivate]
  L -->|deactivate| M[Session ended at once, name kept in log]
```
| # | Screen | Action | System response |
|---|---|---|---|
| 1 | `/admin/team` | Invite: name, email, role (Admin/Owner), language | Pending invites list; email in chosen language; if email fails, "Invite saved, email will retry" |
| 2 | Email | Tap link | `/admin/invite/:token` shows name, email, role (read-only) |
| 3 | Invite | Choose password (min 10), language, Accept | Account created, signed in, redirect to Today |
| 4 | Today (first run) | Dismiss or follow "Add to home screen" | iOS: instructions sheet (Share > Add to Home Screen); Android: native install prompt |
| 5 | `/admin/profile` | Switch Push alerts on | Browser permission ask (only after tap, explained first); subscription saved |
| 6 | same | Send test push | "Sent to n device(s)"; push arrives, tap opens app |
| 7 | Profile | Set per-admin push and email alert switches, change password | Saved; respected by all alerts |
| 8 | Team (Owner) | Resend/revoke invite; change role; deactivate/reactivate | Confirm dialogs; resend issues new link |

## Alternative and error paths
| Trigger | What the user sees | Recovery |
|---|---|---|
| Invite link expired/revoked/used (`INVITE_INVALID`) | "This invitation is no longer valid. Ask the bakery owner to send a new one." | Owner resends |
| Invite email already an admin/customer (`EMAIL_IN_USE`) | Inline on invite form | Use another email |
| Weak password | Inline "At least 10 characters" | Fix |
| Forgot password | `/admin/forgot` always "If this email exists, a link was sent"; link to `/admin/reset`; expired link gives "link expired" + request again | Request again |
| Admin opens `/admin/team`, Availability or Settings | Hidden in More; URL typed gives 403 | Ask Owner |
| Last Owner deactivated or demoted (`LAST_OWNER`) | "There must be at least one active Owner" | Promote another first |
| Push permission denied | Explains how to re-enable in browser/phone settings; switch shows "Blocked" | Settings; email alerts still work |
| iOS push without install | Message: "On iPhone, add the app to your home screen first" | Install then enable |
| Push unsupported browser | "This browser cannot receive alerts. Use email alerts." | Email alerts on |
| Test push not arriving (`sent: 0`) | "No device registered" with Re-enable button | Re-subscribe |
| Deactivated admin returns | Next request redirects to login; login says invalid credentials | Owner reactivates |
| Owner role change of self | Allowed while another Owner exists (assumption Q17) | n/a |
| Network error | Toast with retry; form kept | Retry |

## States per screen
Team empty: "Only you for now. Invite a helper." Loading: skeleton rows; invite pending badge with expiry date. Permission: Owner-only; Admin sees no Team entry.

## EN/FR notes
Invitation email and invite page in the language the Owner selected; admin can change UI language after. Role names: Owner / Admin, Propriétaire / Administrateur. Install instructions bilingual with screenshots per OS.

## Accessibility notes
Focus to H1 on invite page; password toggle labelled; permission explanations are text before the browser prompt; role change/deactivate dialogs trap focus, announce result in live region; list actions have names with person ("Deactivate Anna").

## Analytics events
None (admin). Audit: sign-in time shown as "Last sign in" in Team.

## Open questions
- Whether Owner invites should also be allowed at launch (PRD: Owner is the only admin at launch).
