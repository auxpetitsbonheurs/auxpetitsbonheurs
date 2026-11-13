# Test session: E-13 phone menu on real phones (S-254 AC7)

Status: planned (not run yet: needs an iPhone with Safari and an Android phone with Chrome)
Story: production/stories/E-13/S-254-nav-pages-a11y-perf-e2e.md (AC7; behaviour from S-243 AC3, AC4)
Automated part: src/tests/e2e/site-navigation.spec.ts and nav-pages-sweep.spec.ts (Chromium at 320/375 px)

## Steps (each phone, against staging; with a Bluetooth keyboard where noted)
1. Open the home page, tap Menu: the full-screen burgundy menu opens; the page behind does not scroll.
2. Keyboard: Tab moves only inside the menu and wraps from the last link to Close.
3. Keyboard: Esc closes the menu and focus returns to the Menu button.
4. Tap Close: the menu closes, focus returns to the Menu button (VoiceOver / TalkBack announce "Menu, button").
5. Open the menu and tap Gallery: the Gallery page opens and the screen reader starts at its heading.
6. Repeat 1-5 in French (/fr).

## Record
| Phone / browser | Steps 1-6 pass? | Notes |
|---|---|---|
| iPhone, Safari | | |
| Android, Chrome | | |
