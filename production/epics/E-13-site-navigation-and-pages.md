# E-13: Site navigation and brand pages

Status: planned · Milestone: MVP (customer site, brand v0.3) · Added 2026-11-12 after the Owner's navigation decisions
PRD: FR-076 to FR-081 (PRD section 5.10, added 2026-11-12 v0.4; they extend FR-004, FR-005, FR-009, FR-010, FR-064, FR-067) (NFR-001, 002, 003, 006, 007, 010) · Specs: docs/specs/features/catalogue-browsing.md (to be extended), docs/specs/features/admin-menu-content.md (to be extended) · Design: docs/design/design-system.md (Navigation: Top bar, Site menu), docs/design/brand-guide.md v0.3, docs/design/explorations/2026-11-12-burgundy-reference.jpg
Release phase: 3 Customer site (can run in parallel with E-04; see Overlaps)

## Goal
A customer can reach every part of the bakery site from one clear menu on a laptop or a phone: Home, Our story, Our collection, Custom order, Workshops, Gallery, Contact us. The client can change the words and photos of the brand pages from the admin app without a developer.

## Owner decisions (2026-11-12)
1. **Navigation, 7 items in this order.** Home · Our story · Our collection (the shop: browse products and add to basket) · Custom order · Workshops · Gallery · Contact us. FR labels: Accueil · Notre histoire · Notre collection · Gâteau sur mesure · Ateliers · Galerie · Contact (copywriter may refine).
2. **Laptop/desktop:** horizontal nav in the burgundy header: logo left, links centre, account and basket right, as in the reference image. **Phone:** keep today's header (Français, logo, basket) and add a menu button (three-line icon) that opens the 7 links full-screen; accessible (focus trap, Esc, focus returns, 44 px targets).
3. **"Our collection" needs a public list page.** Today `/menu` is a 404 (products only at `/menu/:slug`). The page is grouped by type, with cards showing photo, name, "from Rs X" and a path to add to the basket; it uses the cached menu (ADR-0004).
4. **Our story, Workshops, Gallery and Contact us are built now as simple pages with placeholder content** the client replaces. Workshops is an information page only for now (booking is decided later, see Open questions). Contact us shows WhatsApp, phone, pickup area (Beau Bassin), opening hours and possibly a map link; no form and no email until a custom domain exists (Resend deferred). **Custom order** shows an explanation page with a "Contact us on WhatsApp" call to action until E-08 delivers the request form.
5. **The client edits text (EN/FR) and photos** of Our story, Workshops and Gallery, and contact details, from the admin app. Owner and Admin both may edit content (proposal in Permissions below; Owner to confirm).
6. **UX first, SEO basics** (titles, meta, hreflang, sitemap entries), **WCAG 2.2 AA**.

## Requirements (short form; the full text with acceptance is in PRD section 5.10)
Reviews are a separate epic (E-14) and are not a nav item; they link from Home and the footer.

| ID | Requirement | Pri | Persona |
|---|---|---|---|
| FR-076 | Every customer page has the same 7-item site navigation in this order (Home, Our story, Our collection, Custom order, Workshops, Gallery, Contact us), EN and FR labels, current page marked. From 1024 px wide it is a horizontal bar in the header; below that a menu button opens the same links full-screen. | Must | P1 |
| FR-077 | "Our collection" (`/menu`) lists the available products grouped by type, each card with photo, name, "from Rs X" and a way to start adding it to the basket; sold-out products show a label; hidden products never appear. Reads the cached menu (ADR-0004). | Must | P1 |
| FR-078 | Our story, Workshops and Gallery pages show text and photos in the visitor's language with EN fallback per field; Owner and Admin edit that text and those photos in the admin app, with no deployment. Until edited, the pages carry clearly neutral placeholder text. | Must | P1, P2, P3 |
| FR-079 | Contact us shows WhatsApp, phone, pickup area, opening hours and map link (when set); no form and no email address until a custom domain exists. | Must | P1 |
| FR-080 | Custom order shows what a custom cake is, how it works and a "Contact us on WhatsApp" button until the request form (FR-028) is live; then the form replaces the button and the page keeps the explanation. | Must | P1 |
| FR-081 | Each new page has a unique title and description per language, canonical and hreflang alternates, share preview and a sitemap entry (placeholder pages are noindex until edited). | Must | P1 |

## Success measure
A customer on a 375 px phone reaches any of the 7 pages in at most 2 taps from any page; on a laptop in 1 click. The client changes an Our story paragraph and photo from a phone in under 3 minutes and sees it on the site within 60 seconds. New pages meet the project.yaml budgets (Lighthouse perf >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, JS <= 170 kB gz per route); Lighthouse accessibility >= 95.

## Scope
- In: header navigation (laptop bar, phone full-screen menu), `/menu` collection page, `site_page` content data model and public read, admin "Pages" editor (text and photos), the five pages (Our story, Workshops, Gallery, Contact, Custom order interim), SEO and sitemap for them, an accessibility, performance and journey sweep.
- Out: allergen filters and promotion pricing on the collection (E-04 S-064, E-05 S-082), the product page and options (E-04 S-065/S-066), the custom request form (E-08), gallery lightbox and "Request something similar" (E-04 S-069), workshop booking and payment (decision pending), contact form or email (needs custom domain), customer account screens (E-11), the home page body (E-04 S-063), real copy and French translations (E-12 S-222; the copywriter drafts the placeholders only).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-242 | Horizontal site navigation in the laptop header | ready | 3 |
| S-243 | Phone menu button with full-screen menu | ready | 5 |
| S-244 | Our collection page grouped by type | ready | 5 |
| S-245 | Content pages: data, placeholder seed and public read | ready | 5 |
| S-246 | Admin Pages: edit page text in English and French | ready | 5 |
| S-247 | Admin Pages: add, order and remove photos | ready | 3 |
| S-248 | Our story page | ready | 3 |
| S-249 | Workshops page | ready | 2 |
| S-250 | Gallery page | ready | 3 |
| S-251 | Contact us page | ready | 3 |
| S-252 | Custom order page (interim, until the request form) | ready | 2 |
| S-253 | Titles, descriptions, hreflang, share previews and sitemap for the new pages | ready | 3 |
| S-254 | Navigation and pages accessibility, performance and journey sweep | ready | 3 |

Total: 45 pts. Files: `production/stories/E-13/`. Story numbers S-242 to S-260 are reserved for this epic (S-255 to S-260 spare); next free number after the block: S-261.

Build order: S-245 → S-242 → S-243 → S-244 → S-246 → S-247 → S-248 → S-249 → S-251 → S-252 → S-250 → S-253 → S-254. S-242 and S-243 can start at once (no data); S-244 only needs the cached menu.

## Permissions (proposal for the Owner; extends the matrix in docs/specs/features/admin-access-team.md)
| Action | Admin | Owner |
|---|---|---|
| Edit page text and photos (Pages), gallery photos (S-054/S-055) | yes | yes |
| Contact details (WhatsApp, phone, pickup address, map link, Instagram) in Settings | no (403, as today) | yes |
Rationale: page content is like the menu and gallery (Admin allowed); contact details are business rules in Settings (Owner only, S-058). Contact-page opening hours and the pickup-area note are page text, so Admin can edit them. Needs the Owner's yes and a row in the matrix before S-246 ships.

## Dependencies
- E-01 (i18n, layout, schema), E-03 S-047 (photo upload and compression), S-058/S-059 (Settings values and the plain-text component), S-033 (admin frame, More screen), E-03 S-054/S-055 (gallery photos; stretch in sprint 02, recommend pulling them in with this epic).
- ADR-0004 (`GET /api/menu`, `apb_menu` cache) for S-244; basket store for the product page's Add.
- Contract-first: `lead-backend` and `lead-frontend` add the `admin/pages` loader and action and the public page read to `docs/architecture/api/contracts.md` before S-246 and S-245 are built (coordination rule 5). Design: `ux-lead` and `design-director` confirm the header layout, menu button position and the 1024 px breakpoint.

## Overlaps with existing stories (decided here, product-director to confirm)
- **E-04 S-070 (About, Contact, FAQ):** About becomes "Our story" at `/our-story` (S-248); Contact is rebuilt as S-251 with opening hours and the Beau Bassin pickup area. S-070 keeps FAQ and policies. Old `/about` answers 301 to `/our-story`. S-070 note added.
- **E-04 S-064 (menu grid with filters):** S-244 delivers the page and the grouped list; S-064 then adds allergen and type filters and promotion pricing on top of the same route. Note added to S-064.
- **E-04 S-069 (gallery lightbox):** S-250 delivers the page, intro text and grid; S-069 adds occasion filter, lightbox and "Request something similar".
- **E-08 S-151 (custom request form):** S-252 owns `/custom-cake` now; S-151 puts the form on the same route.
- **E-04 S-061 (footer)** keeps FAQ, policies and contacts; it is not a second navigation.
- **E-12 S-222 (real texts and French)** replaces the placeholder text; E-13 only makes it editable.

## Risks
- Seven nav items with FR labels ("Gâteau sur mesure", "Notre collection") crowd a 1024 px header; mitigation: breakpoint at 1024 px, links wrap never, test FR at 1024 px; fall back to the menu button below.
- Phone header already holds Français, logo and basket at 320 px; adding the menu button may not fit; mitigation: S-243 AC6 and ux-lead review on a real phone width.
- Product JS budget (170 kB gz per route) with a focus-trap menu on every page; mitigation: menu loads on first tap.
- Placeholder text reaching production; mitigation: "Still sample text" badge in admin, noindex while placeholder, E-12 S-222 checklist.
- Admin Pages editor overlaps in effort with the product editor; reuse the S-047 photo pipeline and S-059 form pattern.

## Cuttable
- S-250 Gallery page and S-249 Workshops page can ship last (empty-state versions) if time is short; navigation items still point to a working page. Cutting a nav item needs a product-director decision (Owner fixed the 7).

## Open questions (carried in story Notes)
1. Workshops: how will booking work later (request form, WhatsApp, paid tickets)? Info page only now (S-249).
2. Contact map: is a map link wanted? It shows only if the map URL in Settings is set (S-251 AC3).
3. Route names: English slugs `/our-story`, `/workshops`, `/custom-cake`, `/gallery`, `/contact`, `/menu` with the `/fr` prefix for French (no translated slugs). Confirm.
4. Account icon on the laptop header: hidden until customer accounts (E-11) exist, so it never links to a dead page (S-242 AC4).
5. Menu button position on phones (after the basket) and the 1024 px breakpoint: ux-lead to confirm.
6. Do Admins edit page content (proposed yes)? See Permissions.
7. Collection cards: link to the product page only (all current products have required options), or also a direct Add for products without required options? Proposed: link only now (S-244 Notes).
8. Contact opening hours: free text per language (proposed), or structured by weekday?

## Lead decisions on open questions (2026-11-12)
1. Admins may edit page content; contact details in Settings stay Owner-only.
2. Workshops booking method: deferred; info page only.
3. English slugs with the /fr prefix are fine (/our-story, /workshops, /custom-cake, /gallery, /contact, /menu, /reviews).
4. Header layout: ux-lead confirms the menu-button position and breakpoint at build time. The account icon stays hidden until E-11.
5. Collection cards link to the product page only, because every real product has a required Size or Box.
6. Contact hours are free text per language. The map link shows only when Settings has one.
7. Overlaps accepted as proposed (S-064, S-070, S-069). Gallery ships with its empty state; S-054/S-055 are not pulled forward.
8. Pages that still hold placeholder text are noindex and stay out of the sitemap until edited.

## Workshops: what they are (Owner, 2026-11-12)
Occasional event workshops, run when there's an occasion. Example: for Valentine's Day the bakery prepares 10 cakes and invites 10 couples to come and decorate their own cake together. Limited seats, a set date, held at the bakery. The booking format (form, WhatsApp or paid tickets) is still to be decided. For now S-249 is an info page that explains the concept, shows the next event when there is one (otherwise "No workshop planned right now, follow us or message us to hear about the next one"), and has a WhatsApp call to action. A future epic may add events with dates, seats and booking.
