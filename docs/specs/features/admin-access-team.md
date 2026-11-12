<!-- Template: feature-spec | Filled by: /feature-spec (product-manager) | Output: docs/specs/features/admin-access-team.md -->
# Feature Spec — Admin access, team and roles

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 (stack) · Epic: E-admin-access (to be created by /create-epics)
Sources: PRD v0.2 §5.6, build-brief "Users and roles" / "Admin app", architecture "Auth & authorisation model", data-model `admin`, `admin_invitation`, `push_subscription`, API contract "Admin app".

## Summary
Private admin app for the bakery: email + password sign-in that survives 30 days on a phone, forgot-password, an installable PWA shell with a five-item bottom bar, and server-enforced Owner/Admin roles. The Owner manages helpers on the Team screen (invite, resend, change role, deactivate/reactivate) and every admin tunes their own alerts and language in My profile. At launch the Owner is the only admin; helpers are invited later (owner, 2026-11-10).

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-039 | Customer account cannot open admin pages or data | UX (Sign-in), API (`admin/*` guard), AC1, AC2 |
| FR-040 | Sign-in, forgot password, 30-day sessions | UX, API (`admin/login`, `admin/forgot`, reset), AC3-AC6 |
| FR-041 | Roles enforced on the server; Owner-only Availability, Settings, Team; Admin may edit menu, promotions, Sales summary | Permissions matrix, AC7-AC9 |
| FR-042 | Invite with EN/FR email, 7-day link, resend | UX (Team), API (`invite`, `resendInvite`, `admin/invite`), AC10-AC13 |
| FR-043 | Change role, deactivate (immediate sign-out, name kept), reactivate | API, Data model, AC14-AC17 |
| FR-044 | Last active Owner protected | API (`LAST_OWNER`), AC18-AC19 |
| FR-045 | Activity log names the acting admin (name survives deactivation) | Data model note, AC16 (log itself: admin-orders.md) |
| FR-046 | My profile: name, password, language, alert switches | UX, API (`admin/profile`), AC20-AC23 |
| FR-047 | Installable PWA, push, one-handed bottom bar | UX (Shell), API (manifest, sw.js, `subscribePush`), AC24-AC27 |

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Sign-in | `/admin/login` | Button spinner | n/a | Inline Alert "Email or password is not right. Try again or reset your password." (same text for unknown, inactive, customer accounts); 429 "Too many attempts, wait a few minutes." | Redirect to `next` or Today |
| Forgot password | `/admin/forgot` | Button spinner | n/a | Field error on bad email format only | "If that email belongs to an admin, a reset link is on its way." (always) |
| Set new password (reset link) | `/admin/reset` (**new**, see Open contract changes) | Button spinner | n/a | Expired link: "This link has expired. Request a new one." + link to Forgot | Redirect to Today, signed in |
| Accept invitation | `/admin/invite/:token` | Server-rendered | n/a | `INVITE_INVALID` page "This invitation has expired or was already used. Ask the owner for a new one." | Password set, signed in, Today |
| Shell (header + bottom bar) | `/admin/*` | SSR first paint | n/a | Page-level Error state with Retry | n/a |
| Owner-only blocked | any Owner URL as Admin | n/a | "Owner only" empty state with back link (design-system) | n/a | n/a |
| Team | `/admin/team` (decided 2026-11-10; the prototype's `/admin/more/team` is not used, Team is reached from the More menu) | Skeleton rows after 300 ms | Single Owner row; invites section hidden | Alert + Retry; action errors in context | Toast per action |
| Invite sheet | bottom sheet on Team | Button spinner | n/a | Field errors (name, email, role); `EMAIL_IN_USE` "This email already has an account." | Toast "Invitation sent to {email}" |
| My profile | `/admin/profile` (More) | Skeleton | n/a | Field errors; "Notifications are blocked in this browser" with steps | "Saved" status |

### Flow
1. Sign-in -> Today. Session lasts 30 days from sign-in; day 31 redirects to login with `next`.
2. Shell: top header (title, role) + bottom bar `Today | Orders | Calendar | Menu | More`, `nav aria-label="Admin"`, count dot on Orders when To review > 0, hidden while keyboard or full-screen sheet is open (design-system "Admin one-handed patterns"). More lists Gallery, Customers, Sales summary, My profile for everyone; Availability, Settings, Team only when `nav.ownerItems`.
3. Install: Android shows an in-app "Install" prompt on first visit after sign-in; iOS shows a one-line "Share -> Add to Home Screen" hint (push on iOS needs the installed app). Push opt-in is requested from My profile ("Turn on push on this device"), never on page load.
4. Team: list of admins (name, role, Active/Deactivated, last sign-in) and pending invites (name, email, role, expires). Row sheet: Change role, Deactivate/Reactivate, Resend/Revoke invite. Deactivate and role-to-Admin confirm in a Dialog.
5. Invitee opens email link -> sets name-prefilled account password (min 10) and language -> signed in.

### Copy
All strings EN/FR via i18n (admin follows the admin's `locale`, EN-first at launch). Bottom bar labels FR: Aujourd'hui, Commandes, Calendrier, Carte, Plus. Invitation email (EN/FR) contains bakery name, inviter name, role in plain words, link, expiry date ("valid until Thu 19 Nov"). Copywriter to finalise.

## API Contract
Reference: `docs/architecture/api/contracts.md` -> "Admin app" rows, no new modules except where listed under Open contract changes.
| Operation | Module / intent | Input | Output | Errors | Auth |
|---|---|---|---|---|---|
| Sign in | `admin/login` `signIn` | `{ email, password }` | redirect | `VALIDATION_FAILED`, generic invalid credentials, `RATE_LIMITED` (RL-auth) | public |
| Forgot | `admin/forgot` `requestReset` | `{ email }` | `{ ok }` always | `RATE_LIMITED` | public |
| Set password from reset | `admin/reset` (new) `setPassword` | `{ password: min 10 }` | redirect Today | `INVITE_INVALID`-style expired (410) | reset session |
| Accept invite | `admin/invite` `accept` | `{ password, locale }` | redirect `/admin` | `INVITE_INVALID` 410, `EMAIL_IN_USE` | public (token) |
| Sign out | `admin/sign-out` | optional `endpoint` | redirect | - | admin |
| Shell data | `admin/layout` loader | - | `{ me, nav.ownerItems, vapidPublicKey }` | 401 redirect | admin |
| Team list | `admin/team` loader | - | `{ admins, invites }` | 403 for Admin | owner |
| Invite / resend / revoke | `invite` / `resendInvite` / `revokeInvite` | `{ name, email, role, locale }` / `{ id }` | `{ ok }` | `EMAIL_IN_USE`, `VALIDATION_FAILED`, `INVITE_INVALID` | owner |
| Change role | `changeRole` | `{ adminId, role }` | `{ ok }` | `LAST_OWNER` | owner |
| Deactivate / reactivate | `deactivate` / `reactivate` | `{ adminId }` | `{ ok }` | `LAST_OWNER`, `NOT_FOUND` | owner |
| Profile | `admin/profile` `updateProfile`, `changePassword`, `setAlerts`, `subscribePush`, `unsubscribePush` | per contract | `{ ok }` | `VALIDATION_FAILED` | admin |
| PWA assets | `/admin/manifest.webmanifest` (scope `/admin/`, standalone, icons 192/512 + maskable), `/admin/sw.js` | - | static | - | public |

Guard rules (server, every loader and action, `requireAdmin`): valid session, `admin.active`, role, session age <= 30 days; otherwise sign out and redirect to `/admin/login`. Admin on an Owner module: loader renders the "Owner only" state with HTTP 403, actions return `FORBIDDEN`. Owner-only modules: `admin/team`, `admin/availability`, `admin/settings`.

## Data Model Changes
No new tables. Uses `admin` (role, active, alert_push, alert_email, locale, last_sign_in_at, deactivated_at), `admin_invitation`, `push_subscription`. Constraints used: `admin.email` unique; invitation `token_hash` unique, `expires_at = created_at + 7 days`; resend = revoke open row + insert new; deactivate sets `active=false`, `deactivated_at` and `sessions_revoked_at` (migration 0006, S-032: the guard refuses every session signed in before it, so the admin is signed out everywhere server-side even before the ban lands), bans the auth user, deletes the admin's push subscriptions; reactivate lifts the ban and clears `deactivated_at`. Admin rows are never deleted (FR-043). Last-owner check inside one transaction with `SELECT ... FOR UPDATE` on active owners. First Owner created by seed script. No migration beyond data-model.md.

## Permissions matrix
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| Sign in / forgot / accept invite | yes | refused (generic) | yes | yes |
| Any `/admin/*` page or data | no (redirect) | no (redirect to `/admin/login`, decided 2026-11-10) | yes | yes |
| Orders, Calendar, Menu, Promotions, Gallery, Customers, Sales summary | no | no | yes | yes |
| Availability, Settings, Team | no | no | no (403) | yes |
| Own profile, alerts, push devices | no | no | yes | yes |

## Analytics Events
No client analytics (no tracking cookies, NFR-011). Server-side structured log lines only, no PII: `admin_signed_in`, `admin_sign_in_failed` (count only), `admin_invited`, `admin_invite_accepted`, `admin_role_changed {from,to}`, `admin_deactivated`, `admin_reactivated`, `push_subscribed {platform}`.

## Edge Cases
- Typed Owner URL as Admin, or a stale tab after demotion: next request returns 403 / Owner-only state; UI hides items on next load.
- Deactivated admin with open tab: next request redirects to login with generic message; in-flight action fails `UNAUTHENTICATED`; pending order actions of theirs stay logged under their name.
- Last Owner: self-demotion, self-deactivation and demoting/deactivating the sole Owner all refused with `LAST_OWNER` ("There must always be one active Owner. Make someone else Owner first."). Two Owners acting at once: row lock makes the second fail.
- Invite email already an admin (active or deactivated) or a customer account: `EMAIL_IN_USE`. Re-invite of a deactivated person: use Reactivate instead (message says so).
- Resend while open: previous link stops working. Accepting twice: second is `INVITE_INVALID`. Revoked invite link: `INVITE_INVALID`.
- Reactivated admin keeps role and must sign in again; password unchanged.
- Email send failure on invite: invite row saved, Team shows "Email not sent, resend"; outbox retries (FR-074).
- Session at day 30 + 1 minute: redirect to login; refresh tokens do not extend beyond 30 days from sign-in.
- Push: permission denied or iOS not installed shows guidance; expired subscriptions (404/410) are deleted silently. Signing out removes this device's subscription.
- Rate limit on sign-in/forgot (RL-auth); the response is identical for known and unknown emails.
- Password rules: min 10 characters; changing the password (My profile or the reset link) keeps the current session and signs out every other device (decided 2026-11-12). Deactivating or removing an admin signs that admin out everywhere (S-032).

## Acceptance Criteria
- AC1: Given a customer-account session, when opening `/admin` or any `/admin/*` page, then no admin data is returned and the user cannot reach any admin screen.
- AC2: Given a customer email and password, when submitting `/admin/login`, then the generic "Email or password is not right" error shows.
- AC3: Given valid admin credentials, when signing in, then Today opens and the session cookie is HttpOnly, Secure, SameSite=Lax.
- AC4: Given a session created 29 days ago (fixed clock), when requesting Today, then it loads; given 30 days + 1 minute, then redirected to login with `next`.
- AC5: Given an unknown email, when submitting Forgot, then the same "link is on its way" message shows and no email is sent.
- AC6: Given a valid reset link, when setting a password of 10+ characters, then the admin is signed in; given an expired link, then the expired message shows.
- AC7: Given an Admin session, when GET `/admin/team`, `/admin/settings` or `/admin/availability`, then HTTP 403 with the Owner-only state.
- AC8: Given an Admin session, when POSTing `invite`, `saveRules` or settings `save` directly, then `FORBIDDEN` and no data changes.
- AC9: Given an Admin session, then Menu, Promotions and Sales summary load and save, and Availability, Settings, Team are absent from More.
- AC10: Given an Owner, when inviting name/email/role with locale fr, then an `admin_invitation` row with expires_at = now + 7 days exists and a French email is queued.
- AC11: Given an invite 6 days 23 hours old, when the link is opened and a password set, then the admin is created and signed in with the invited role.
- AC12: Given an invite older than 7 days, then the link shows `INVITE_INVALID` and creates nothing.
- AC13: Given an open invite, when Resend is used, then the old link fails, a new link works for 7 days.
- AC14: Given an Admin, when the Owner changes the role to Owner, then the next request by that person is allowed on Owner routes.
- AC15: Given two active Owners, when one is changed to Admin, then it succeeds.
- AC16: Given an admin with past order events, when deactivated, then their names still show in those events.
- AC17: Given an active admin signed in on a phone, when deactivated, then their very next request is refused and their push subscriptions are gone; when reactivated, they can sign in again.
- AC18: Given one active Owner, when deactivating or changing them to Admin, then `LAST_OWNER` and no change.
- AC19: Given two Owners deactivating each other concurrently, then exactly one succeeds.
- AC20: Given My profile, when changing name and language to FR, then the admin UI shows French on next load.
- AC21: Given alert_email off, when a new website order arrives, then that admin receives no email; given alert_push off, no push.
- AC22: Given a new password of 9 characters, then `VALIDATION_FAILED` on `password`.
- AC23: Given an Admin with alerts on and a stored subscription, when a new order is placed, then they receive push and email (FR-072, tested with fake senders).
- AC24: Given the installed app on iPhone and on Android, when the Owner taps "Send test push" in My profile, then a push arrives and tapping it opens `/admin`.
- AC25: Given a 375 px viewport, then the bottom bar shows five items with tap columns >= 44 px (56 px column height) and labels visible in EN and FR at 320 px.
- AC26: Given 3 orders in Pending approval or Quote needed, then the Orders item has a dot with accessible text "3 to review".
- AC27: Given the manifest, then scope is `/admin/`, display standalone, with 192 and 512 icons; `/admin/sw.js` is served `no-cache`.

## Non-functional
- Performance: shell routes within project.yaml budgets (LCP <= 2.5 s, INP <= 200 ms, JS <= 170 kB gz per route); sign-in action p95 <= 800 ms; guards add no network call per request (local JWKS verification).
- Accessibility: WCAG 2.2 AA; labelled fields, errors linked, focus to error summary; bottom bar `aria-current`; dialogs trap focus; no status by colour alone (Active/Deactivated text badges).
- Security: server-side guard on every loader/action; zod validation; RL-auth on sign-in/forgot/reset; Origin check on actions; no account enumeration; invite tokens 32 random bytes stored hashed; service-role key only server-side.
- Privacy: stores admin name, email, role, push endpoints; invite emails carry only necessary data; deactivated admin data retained for audit names.

## Rollout / flags
- Flag: none · Rollout: staging first, Owner seeded before launch · Rollback: redeploy previous build; `admin` data is forward-only.

## Open contract changes (applied 2026-11-10)
1. Add module `admin/reset` (`/admin/reset`, public via recovery link, RL-auth) with `setPassword`; current contract lists only `requestReset`. — **Resolved in contracts.md (2026-11-10).**
2. Customer on `/admin/*`: contract says redirect to `/admin/login`, architecture says 404; pick one (spec assumes redirect to login, AC1 holds either way). — **Resolved in contracts.md (2026-11-10):** redirect to `/admin/login` chosen (architecture.md updated); no admin data returned.
3. Add `sendTestPush` intent to `admin/profile` (needed by AC24) -> `{ ok, sent: n }`. — **Resolved in contracts.md (2026-11-10).**
4. `invite` should return `{ ok, emailQueued }` so the UI can show "email not sent" state. — **Resolved in contracts.md (2026-11-10).**

## Open Questions
- ~~Team route~~ Resolved 2026-11-10: `/admin/team`.
- ~~Should changing one's own password end other devices' sessions?~~ Resolved 2026-11-12 (lead decision): yes. A password change signs out every other session (Supabase `signOut` scope `others`); deactivating or removing an admin signs them out of every session (scope `global`, S-032). Access tokens already issued stay valid until they expire (at most 1 hour).
- May an Owner change their own role while another Owner exists? Spec allows — owner Sabera.
