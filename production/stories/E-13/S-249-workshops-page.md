# S-249: Workshops page
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md (add Workshops) · Open question: booking later (PRD question 17)
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist, copywriter

## Story
As a customer, I want to learn what baking workshops the bakery offers, so that I can ask to join one.

## Acceptance Criteria
- [x] AC1 (FR-078): Given the stored page, when `/workshops` (and `/fr/workshops`) loads, then it shows `h1` "Workshops"/"Ateliers", intro, body paragraphs and up to 6 photos with alt text, from the page read (S-245), with EN fallback per field.
- [x] AC2 (FR-078): Given the page, then it has no booking form, no price and no date picker; it shows a "Ask about workshops on WhatsApp"/"Poser une question sur les ateliers sur WhatsApp" button.
- [x] AC3 (FR-078): Given Settings has a WhatsApp number, when I press the button, then a `wa.me` chat opens with a pre-filled message in the visitor's language ("Hello, I'd like to know more about your workshops."); given no WhatsApp number in Settings, then the button is omitted and the phone number shows, or if neither exists a plain "Contact us" link to `/contact`.
- [x] AC4 (FR-078): Given placeholder content, then the text is neutral (no dates, prices or promises); given the page read fails, then an error state with Retry shows.
- [x] AC5 (FR-078, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then the WhatsApp button is >= 44 px with a distinct name (it names the workshop topic, not "Click here"), opens in a new tab with a "(opens WhatsApp)" cue for screen readers, no horizontal scroll, AA contrast, one `h1`.

## Tests
- AC1 → src/app/routes/site/workshops.test.tsx
- AC2 → src/app/routes/site/workshops.test.tsx
- AC3 → src/app/routes/site/workshops.test.tsx, src/app/lib/whatsapp.test.ts (existing link builder)
- AC4 → src/app/routes/site/workshops.test.tsx
- AC5 → src/tests/e2e/content-pages.spec.ts

## Notes
- Information page only, by Owner decision. If booking arrives later it is a new story (request form or paid tickets).
- Use the existing WhatsApp link builder used by the footer (S-061); do not hand-build URLs.
- Depends on: S-245, S-248 (`SitePageView`).

## Owner clarification (2026-11-12)
Workshops are occasional event workshops, for example a Valentine's Day session with 10 couples decorating 10 pre-baked cakes together, each with a date and limited seats. The page explains the concept and has an optional "next workshop" block (title, date, seats, short text, photo) that the client edits in admin, with a calm empty state when nothing is planned. The call to action is WhatsApp. Online booking is out of scope here (future epic).

## Build notes (2026-11-12, review)
- Next workshop (Owner clarification): edited in the Pages editor (title EN/FR, date, seats, short text EN/FR, one photo); shown while its date is today or later (Mauritius date), otherwise the calm empty state. Seats show as "10 seats" (capacity, not availability: no booking).
- Tests as built: AC1-AC4 and the next workshop → `src/app/routes/site/workshops.test.tsx`; link builder → `src/app/lib/contact.test.ts` (`whatsappHref(number, text)`); AC5 → `src/tests/e2e/content-pages.spec.ts`.
