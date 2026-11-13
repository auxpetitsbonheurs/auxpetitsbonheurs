# Push device check (S-196 AC9, Phase 5 exit)

Status: to run · Owner: qa-lead with the Owner · Environment: staging

Run once the push keys are set on staging (Actions → vapid-keys → staging). Real phones only:
a headless browser has no push service, so CI cannot do this part.

## Plan
| # | Device | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | iPhone (iOS 16.4 or later), Safari | Open the staging `/admin`, Share → Add to Home Screen, open the app from the home screen, sign in, My profile → Enable push on this device → Allow | "Push is on for this device." and Push devices goes up by 1 | |
| 2 | Same iPhone | Send test push, lock the phone | "Test push" arrives within seconds; tapping it opens My profile in the app | |
| 3 | Android phone, Chrome | Install the app (Install banner), sign in, Enable push, Send test push | Arrives within seconds; tap opens My profile | |
| 4 | Either phone | Place a website order from another device | "New order APB-…" push with the first name only; tap opens the order | |
| 5 | Either phone | Turn Push alerts off in My profile, Save alerts, place another order | No push; the alert email still arrives if email alerts are on | |
| 6 | iPhone in Safari (not installed) | Open My profile | "Add to Home Screen first …" and no Enable button | |
| 7 | Any phone | Block notifications in the phone's settings, reopen My profile | "Notifications are blocked for this app. Allow notifications in settings …" | |

If iPhone steps 1-2 fail, the email fallback already covers the four push + email alerts
(architecture T1); raise it to product-director.

## Notes
