# S-033: Admin app frame with one-handed bottom bar
Status: review
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#ux
Estimate: 3 pts
Owner: ui-engineer, tailwind-shadcn-specialist, accessibility-specialist, remix-specialist

## Story
As an admin using the app with one hand on a phone, I want a bottom bar with the five main places, so that I can move around without reaching to the top of the screen.

## Acceptance Criteria
- [x] AC1 (FR-047): Given I am signed in at 375 px wide, then a bottom bar inside `nav aria-label="Admin"` shows Today, Orders, Calendar, Menu, More with the current item marked `aria-current="page"`, and each column is at least 44 px wide and 56 px high.
- [x] AC2 (FR-047, NFR-007): Given French at 320 px wide, then the labels Aujourd'hui, Commandes, Calendrier, Carte, Plus are fully visible (not truncated, wrapping allowed).
- [x] AC3 (FR-047): Given I open More, then Gallery, Customers, Sales summary and My profile are listed for everyone; Availability, Settings and Team appear only when `nav.ownerItems` is true (Owner), and Team links to `/admin/team`.
- [x] AC4 (FR-041): Given an Admin session, then the Owner items are absent from More and typing their address gives the "Owner only" state (S-022).
- [x] AC5 (FR-047): Given the keyboard is open or a full-screen sheet is showing, then the bottom bar is hidden; when closed it returns.
- [x] AC6 (FR-047): Given the frame, then a header shows the page title and my role (Owner or Admin) as text.
- [x] AC7 (FR-047): Given a destination that is not built yet (Calendar, Customers, Sales summary, Gallery), then it shows a plain "Not available yet" page inside the frame, not an error; `/admin` shows a simple Today page with a link to orders waiting for review.
- [x] AC8 (NFR-002): Given the frame at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, a skip link jumps past the bar, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [x] AC9 (NFR-002): Given light and dark mode, then every text and icon pair meets WCAG AA contrast per docs/design/tokens.json, icons have text labels, and an axe scan reports no serious or critical violations; reduced motion removes transitions.

## Tests
- AC1 → src/tests/e2e/admin-shell.spec.ts
- AC2 → src/tests/e2e/admin-shell.spec.ts
- AC3 → src/app/routes/admin/layout.test.tsx
- AC4 → src/app/routes/admin/layout.test.ts and src/tests/e2e/admin-access.spec.ts
- AC5 → src/tests/e2e/admin-shell.spec.ts
- AC6 → src/app/routes/admin/layout.test.tsx
- AC7 → src/app/routes/admin/layout.test.tsx
- AC8 → src/tests/e2e/admin-shell.spec.ts
- AC9 → src/tests/e2e/admin-shell.spec.ts

## Notes
- Depends on: S-009, S-007 (E-01), S-022.
- Contract: `admin/layout` loader (`me`, `nav.ownerItems`, `vapidPublicKey`; the key can be null until E-10). UX: design-system "Admin one-handed patterns".
- Decision (spec gap): destinations owned by later epics render a neutral placeholder so the bottom bar is complete in Phase 1; each later epic replaces its placeholder.
- Bottom-bar icon set: lucide-react (already installed); each icon is decorative next to its text label.
