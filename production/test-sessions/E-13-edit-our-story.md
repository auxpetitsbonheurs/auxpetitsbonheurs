# Test session: E-13 edit Our story on a phone (S-254 AC5)

Status: planned (not run yet: needs the Owner on her own phone against staging)
Story: production/stories/E-13/S-254-nav-pages-a11y-perf-e2e.md (AC5, FR-078)
Automated part: src/tests/e2e/admin-pages.spec.ts (edit and save, page shows the change)

## Goal
The Owner edits the Our story text and adds one photo from her phone; both show on the page
within 60 s; the whole flow takes under 3 minutes.

## Steps (time each with a stopwatch, start at step 1)
1. On the phone, open the admin app (installed icon or /admin) and sign in if asked.
2. More → Pages → Our story.
3. Change one sentence of the English text; add one photo from the camera roll; type its description.
4. Tap Save; wait for "Saved".
5. Open /our-story in the phone's browser (or tap the page link); refresh until the new text and photo show. Note the seconds from "Saved".

## Record
| Step | Time | Notes (anything slow, unclear or frustrating) |
|---|---|---|
| 1-4 total | | |
| 5 (seconds after Saved) | | |

Pass: total under 3 minutes, page shows both within 60 s, no step needed help.
