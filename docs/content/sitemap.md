# Sitemap & Information Architecture — Aux petits bonheurs

Updated: 2026-11-10 · Sources: PRD v-current, `docs/architecture/api/contracts.md` v0.2 (route names match it), UX flows in `docs/design/ux/`
URL conventions: lowercase, hyphenated, no trailing slash. English at root (`/x`), French at `/fr/x` (same route module, FR-001). `hreflang` en / fr / x-default on every indexable page; canonical is the page's own locale URL. Customer data lives behind tokens or accounts. Max 3 clicks to any key task.

## Customer site (public)
| Path (EN; FR = `/fr` + path) | Page | Purpose / primary CTA | Search intent | Index | Render |
|---|---|---|---|---|---|
| `/` | Home | Order now / Custom cake | "cake shop Mauritius", brand name, "gateaux sur commande Maurice" | yes | SSR |
| `/menu` | Menu | Pick a product (filter type/allergen) | "birthday cakes Mauritius", "eggless cake" | yes (base URL); filtered `?type=&allergen=` canonical to `/menu` | SSR |
| `/menu/:slug` | Product | Add to basket | product name + "Mauritius" | yes; 404 if hidden/out of season; sold-out still indexed | SSR, Product JSON-LD with price Rs |
| `/gallery` | Gallery | Request something similar | "custom cake ideas" | yes; `?occasion=` canonical to `/gallery` | SSR |
| `/custom-cake` | Custom request form | Send request | "custom cake order Mauritius" | yes (`?fromGallery=` noindex, canonical to `/custom-cake`) | SSR |
| `/about` | About | Trust, story | brand | yes | SSR |
| `/contact` | Contact | WhatsApp / pickup address / map | "bakery contact", local business | yes, LocalBusiness JSON-LD | SSR |
| `/faq` | FAQ and policies | Cancellation (48 h), storage advice, privacy note | "cake storage", policy questions | yes | SSR |
| `/basket` | Basket and checkout (one page) | Send order | transactional | noindex | dynamic |
| `/order/:token/confirmed` | Order confirmed | Copy tracking link, Save my details | none | noindex | dynamic |
| `/t/:token` | Order tracking, quote accept/decline, cancel | Track / respond | none | noindex, `Referrer-Policy: no-referrer` | dynamic, no-store |

## Customer account (noindex)
| Path | Page | Auth |
|---|---|---|
| `/account/sign-in` | Sign in (password or email link) | public |
| `/account/sign-up` | Sign up | public |
| `/account/reset` | Reset password | public / link session |
| `/account/save-details?t=<token>` | Save my details (from confirmation) | tracking token |
| `/account` | Profile | customer |
| `/account/addresses` | Saved addresses | customer |
| `/account/orders` | My orders + Reorder | customer |
| `/account/sign-out` | POST only | customer |
| `/auth/confirm` | Email link handler (signup, magic link, recovery); redirects | public |

## Admin app (all noindex, `X-Robots-Tag`, disallowed in robots.txt except where needed; scope `/admin/`)
| Path | Screen | Role |
|---|---|---|
| `/admin/login`, `/admin/forgot`, `/admin/reset` | Sign in, forgot, set new password | public |
| `/admin/invite/:token` | Accept invitation | public (token) |
| `/admin` | Today (layout + home) | admin |
| `/admin/orders` | Orders (tabs To review, Upcoming, Completed, Closed) | admin |
| `/admin/orders/new` | Add manual order | admin |
| `/admin/orders/:id` | Order detail and actions | admin |
| `/admin/orders/:id/edit` | Edit order | admin |
| `/admin/calendar` | Calendar (month/week/day; block day) | admin |
| `/admin/calendar/:date/prep` | Prep list | admin |
| `/admin/menu` | Menu list | admin |
| `/admin/menu/new`, `/admin/menu/:id` | Product editor | admin |
| `/admin/menu/:id/preview` | Preview as customer | admin |
| `/admin/promotions`, `/admin/promotions/new`, `/admin/promotions/:id` | Promotions | admin |
| `/admin/gallery` | Gallery management | admin |
| `/admin/customers`, `/admin/customers/:id` | Customers | admin |
| `/admin/sales` (+ `/admin/sales.csv` download) | Sales summary and CSV | admin |
| `/admin/profile` | My profile, alerts, push, install | admin |
| `/admin/availability` | Availability rules and blocked ranges | Owner |
| `/admin/settings` | Settings | Owner |
| `/admin/team` | Team and invites | Owner |
| `/admin/manifest.webmanifest`, `/admin/sw.js` | PWA files (not pages) | public |
Non-admin or customer hitting any of these (except login/invite/forgot/reset) is redirected to `/admin/login`; Admin on an Owner route gets 403.

## System, endpoints and crawlers (not in navigation)
| Path | Kind | Notes |
|---|---|---|
| `/hooks/supabase/send-email` | POST webhook | signed; never linked, robots disallow |
| `/healthz` | GET health | `no-store`, noindex |
| Scheduled jobs (keepAlive, retryEmails, expireQuotes, pendingAlerts, eveningReminder, purge) | cron, not HTTP | no URL |
| 404 / 500 / maintenance | Error pages, localised, noindex, with links Menu and WhatsApp | |
| `/sitemap.xml`, `/robots.txt` | Crawlers | sitemap lists only canonical EN + FR indexable pages with hreflang alternates (products from DB, excluding hidden/out of season) |

## Navigation
- **Customer top bar** (sticky, mobile hamburger): logo (home), Menu, Gallery, Custom cake, About, Contact; right side: EN | FR switch (same page), account icon (sign in or Account), basket icon with count. Promo banner above it while a live top-banner promotion exists. Mobile: basket and language always visible outside the hamburger.
- **Footer** (every page): WhatsApp, phone, email, Instagram, pickup address with map link (all from Settings); links FAQ and policies, About, Contact, privacy note, language switch.
- **Account menu**: My orders, Profile, Addresses, Sign out.
- **Admin bottom bar** (mobile, 5 items): Today, Orders, Calendar, Menu, More. **More** lists: Promotions, Gallery, Customers, Sales, Profile (all admins); Availability, Settings, Team (Owner only, hidden for Admin); Sign out. On desktop width the bar becomes a left sidebar with the same items.
- Order detail, edit, new order and product editor are reached from lists and Add buttons; they have Back, not a bar change.

## SEO notes (per page)
- Title <= 60 chars and description <= 160 chars, unique per locale, from Settings/product data; Open Graph + Twitter card with real photo (product main photo, hero for home).
- Home: Bakery/LocalBusiness JSON-LD (name, address from Settings, social links). Menu: ItemList. Product: Product + Offer (Rs price, availability reflects sold-out), sale price when promo is live. FAQ: FAQPage JSON-LD only if visible Q&A.
- Filtered/query URLs, tokens, account, admin, basket: noindex or canonical to base. Tokens never appear in sitemap or referrers.
- Missing FR text falls back to EN content on the `/fr` URL (acceptable; flag in content QA so indexable FR pages have real FR copy before launch).
- Images: explicit dimensions, lazy below fold, descriptive alt (product name default). Performance budgets from `project.yaml` apply (Lighthouse SEO >= 95).
- Renamed product slug: old link shows "not available" (no redirect, Q19).

## Redirects
| From | To | Code | Reason |
|---|---|---|---|
| trailing-slash variants (incl. `/fr/`) | slash-less | 301 | one canonical |
| customer on `/admin/*` | `/admin/login` | 302 | FR-039 |
| signed out on `/account/*` | `/account/sign-in?next=` | 302 | auth |
| signed out on `/admin/*` | `/admin/login?next=` | 302 | auth |

## Hierarchy diagram
```
/ (and /fr)
├── /menu ── /menu/:slug ── /basket ── /order/:token/confirmed ── /t/:token
├── /gallery ──► /custom-cake
├── /about  /contact  /faq
├── /account (sign-in, sign-up, reset, orders, addresses, save-details)
└── /admin
    ├── Today /admin
    ├── /orders ── /new, /:id, /:id/edit
    ├── /calendar ── /:date/prep
    ├── /menu ── /new, /:id, /:id/preview
    └── More: /promotions /gallery /customers /sales /profile
              Owner: /availability /settings /team
```
