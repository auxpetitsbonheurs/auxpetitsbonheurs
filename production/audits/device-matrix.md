# Browsers and phones matrix (S-230) — 2026-11-14

What an automated browser could cover from the build machine, and what still needs real phones.
WebKit (Safari engine) and Firefox could not be installed here: Playwright's browser download is
blocked by this environment's network policy, so per instructions no other route was tried.

## Automated (Playwright, local build, 320 / 375 / 1280 px)

| Browser | Engine | Journey run | Result |
|---|---|---|---|
| Chromium 1243 (Playwright's) | Blink | Full e2e suite in CI (two shards) and locally: browse, basket, checkout (delivery and pickup), confirmation, tracking with cancel, admin | Pass (CI is the record per commit) |
| Google Chrome 153 (Chrome for Testing) | Blink | `checkout.spec.ts`, `tracking.spec.ts`, `language.spec.ts`, `timezone.spec.ts` (`PW_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome`) | **250 passed** |
| Chrome on staging, Pixel 7 size (412 px, touch) | Blink | Real staging: a delivery order (APB-0226, Rs 2,100 + Rs 200 fee = Rs 2,300), a pickup order (APB-0227, Rs 2,100), a pickup order cancelled from tracking (APB-0228 → Cancelled) | Pass |
| WebKit / Safari | WebKit | not installable here | **Needs a real iPhone** |
| Firefox | Gecko | not installable here | **Needs a desktop with Firefox** |
| Edge | Blink | same engine as Chrome; not run | Desktop check by hand (low risk) |

## By acceptance criterion

| AC | State | Evidence |
|---|---|---|
| AC1 order journey on each browser, no sideways scroll | Chromium and Chrome: pass. Safari iOS (last 2), Chrome Android (real device), desktop Safari, Firefox, Edge: **manual** | e2e journeys assert no horizontal scroll at every width; `a11y-audit.spec.ts` at 200% zoom too |
| AC2 375 first, tablet, desktop; correct keyboards | Pass at 320/375/1280 (no tablet project; 768 px not run). Field types: phone `tel`, email `email`, quantities numeric | `a11y-audit.spec.ts` AC6, `checkout.spec.ts` |
| AC3 installed admin app on iPhone and Android: sign in, approve, test push, push opens the order | **Real phones only** (push needs a real device, VAPID keys and HTTPS install) | Method below |
| AC4 language kept across pages; order stores the language | Pass | `language.spec.ts` (switch keeps page and query, remembered a year), the order keeps the page language (`place-order.server.test.ts`: a French checkout saves `locale: "fr"`) |
| AC5 another time zone still follows Mauritius | **Pass** (new) | `timezone.spec.ts`: clock at Sat 21 Nov 01:30 Mauritius (Fri 16:30 New York); phones in Mauritius, New York and Tokyo all get earliest date Tue 24 Nov and "today" as too soon |
| AC6 failures logged | None found in Chromium/Chrome | — |

## Manual check on real devices (about 45 minutes, Owner and a helper)

Devices: the Owner's phone, one iPhone (iOS, last 2 versions) and one Android phone (Chrome), plus a
laptop with Safari or Firefox if available. Staging address:
`https://auxpetitsbonheurs-staging.<subdomain>.workers.dev`.

For each phone and browser, tick or note what went wrong (browser, version, what you saw):

1. Open the site, switch to Français and back: the page stays the same, the language sticks on the next page.
2. Menu → a cake → choose options → Add to basket → View basket.
3. Delivery: type an address (the phone shows a normal keyboard), pick a date and a window.
4. Your phone number: the keypad shows digits. Email: the keyboard shows "@".
5. Place order → the confirmation shows the number → Follow my order → tracking opens.
6. Cancel the order from tracking → it says Cancelled.
7. Turn the phone sideways and back: nothing is cut off, no sideways scrolling.
8. Admin app (Owner's and a helper's phone): Safari → Share → Add to Home Screen (iPhone) or Chrome →
   menu → Install app (Android) → open it from the home screen → sign in.
9. Admin → More → notifications → allow, then "Send a test notification": it arrives; tap it → the app opens.
10. Place a test order from another phone: the push arrives; tap it → the right order opens → Approve.
11. Set the phone to another time zone (Settings → General → Date & Time → off "Automatically") and
    open checkout: the earliest date is the same as on a Mauritius phone. Set it back.

Results go in this file under a new heading with the date; any failure is a finding with browser,
version and severity, routed to `bug-triage`.
