# S-140: Share and print the prep list
Status: done
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-calendar-prep.md#behaviour
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As the baker, I want to share the prep list by message or print it, so that helpers in the kitchen have it on paper or on their phone.

## Acceptance Criteria
- [x] AC1 (FR-060): Given the prep list, when I tap Share on a browser with the Web Share API, then the share sheet opens with `shareText` (plain text, same grouping, built server-side in my locale).
- [x] AC2 (FR-060): Given a browser without Web Share, when I tap Share, then `shareText` is copied to the clipboard and the toast "Copied" shows; if copying fails, then "Could not copy" shows with the text selectable.
- [x] AC3 (FR-060, NFR-004): Given `shareText`, then it contains no customer name, phone or address.
- [x] AC4 (FR-060): Given Print, when tapped, then `window.print()` runs and the print stylesheet gives black on white, A4, no navigation chrome, and no group split across pages.
- [x] AC5 (FR-060): Given an empty day, then Share and Print are hidden or disabled with the empty state shown.
- [x] AC6 (FR-060): Given the printed sheet, then it shows "Generated <time>" and is a snapshot (later edits do not change a printed copy).
- [x] AC7 (FR-060, NFR-002): Given keyboard use, then Share and Print are buttons with visible labels (not icon-only), reachable by Tab, 44 px targets, AA contrast per `docs/design/tokens.json`; "Copied" is announced via `role=status`; printed output meets AA contrast and works at 320/375 px and 200% zoom on screen.
- [x] AC8 (FR-041): Given a customer or anonymous session, then the page and `shareText` are inaccessible.

## Tests
- AC1 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC2 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC3 → src/app/domain/prep-list.test.ts
- AC4 → src/tests/e2e/admin-prep-print.spec.ts
- AC5 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC6 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC7 → src/tests/e2e/admin-calendar.a11y.spec.ts
- AC8 → src/app/routes/admin.calendar.$date.prep.test.tsx

## Notes
- Depends on S-139. Print layout verified with Playwright `page.emulateMedia({ media: 'print' })` and PDF snapshot; log events `prep_list_shared` / `prep_list_printed` (no PII).

## As built (2026-11-14, manual job)
- Share uses the Web Share API; without it the text is copied ("Copied" in the polite Toaster); if copying fails the text is shown selected in a labelled box.
- Print: `window.print()` with a print stylesheet scoped to the prep page (`app.css`: A4, black on white, admin header/bottom bar/toasts hidden, `break-inside: avoid` per product group). Verified with `emulateMedia({ media: "print" })`; a PDF snapshot is not kept (follow-up if wanted).
- Each Share/Copy/Print posts a `log` intent: `prep_list_shared` / `prep_list_printed { date, method, actorRole }`, no PII.
