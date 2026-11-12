# Sprint 03

Dates: 2026-11-12 → 2026-11-25 (2 weeks, overlaps the end of sprint 02, whose stories wait on Owner checkpoints) · Capacity: agent-driven build, gated by Owner review time.
Milestone: MVP (customer site, brand v0.3) · Goal: **E-13 site navigation and brand pages on staging**: a customer reaches Home, Our story, Our collection, Custom order, Workshops, Gallery and Contact us from one menu on a laptop or a phone, and the client edits the brand pages from the admin app.

## Committed (E-13, 45 pts)
| Batch | Story | Title | Estimate | Owner | Status |
|---|---|---|---|---|---|
| A | S-242 | Horizontal site navigation in the laptop header | 3 | remix-specialist, tailwind-shadcn-specialist, i18n-specialist | review |
| A | S-243 | Phone menu button with full-screen menu | 5 | remix-specialist, ui-engineer, tailwind-shadcn-specialist, accessibility-specialist | review |
| A | S-244 | Our collection page grouped by type | 5 | remix-specialist, tailwind-shadcn-specialist, ui-engineer | review |
| B | S-245 | Content pages: data, placeholder seed and public read | 5 | postgres-specialist, api-engineer, data-engineer, remix-specialist, copywriter | ready |
| B | S-246 | Admin Pages: edit page text in English and French | 5 | remix-specialist, ui-engineer, api-engineer, tailwind-shadcn-specialist | ready |
| B | S-247 | Admin Pages: add, order and remove photos | 3 | baas-specialist, ui-engineer, remix-specialist, api-engineer | ready |
| C | S-248 | Our story page | 3 | remix-specialist, tailwind-shadcn-specialist, copywriter | ready |
| C | S-249 | Workshops page | 2 | remix-specialist, tailwind-shadcn-specialist, copywriter | ready |
| C | S-250 | Gallery page | 3 | remix-specialist, tailwind-shadcn-specialist, accessibility-specialist | ready |
| D | S-251 | Contact us page | 3 | remix-specialist, tailwind-shadcn-specialist, copywriter | review |
| D | S-252 | Custom order page (interim, until the request form) | 2 | remix-specialist, tailwind-shadcn-specialist, copywriter | review |
| D | S-253 | Titles, descriptions, hreflang, share previews and sitemap for the new pages | 3 | seo-specialist, remix-specialist, copywriter | review |
| D | S-254 | Navigation and pages accessibility, performance and journey sweep | 3 | test-engineer, accessibility-specialist, remix-specialist | ready |

## Build order (batches; each batch is built, reviewed and pushed to staging before the next)
1. **A, navigation and collection** (13 pts): S-242 → S-243 → S-244. Nav pages not built yet answer a calm "coming soon" page (noindex) so no link is a 404.
2. **B, page content and admin editor** (13 pts): S-245 → S-246 → S-247. Needs the Owner's yes on the Permissions proposal in the epic (Admins edit page content).
3. **C, brand pages** (8 pts): S-248 → S-249 → S-250 (replace the placeholders).
4. **D, contact, custom order, SEO and sweep** (11 pts): S-251 → S-252 → S-253 → S-254.

## Risks / dependencies
- Product editor route is at its JS budget (169.5 of 170 kB gz): public-page work must not add shared chunks to it (batch A kept it at 169.5 kB).
- Placeholder text reaching production: placeholder pages stay noindex and out of the sitemap until edited (epic lead decision 8).

## Daily log
- 2026-11-12: sprint started with E-13. Batch A built (S-242, S-243, S-244 → review): laptop nav bar from 1024 px, phone Menu button opening a full-screen modal dialog (no-JavaScript fallback `/menu-links`), `/menu` collection page from the cached menu, `GET /api/menu` products carry their season window (contracts v0.33), placeholder routes for the five pages not built yet.
- 2026-11-12: batch D part built (S-251, S-252, S-253 → review): Contact us and the interim Custom order page replace their placeholders; shared head helper `seoMeta`, `/sitemap.xml` and `/robots.txt`; placeholder pages stay noindex and out of the sitemap through `contentPagePlaceholders` (server/seo-pages.server.ts), the seam S-245 fills. S-254 waits for batches B/C and D.
