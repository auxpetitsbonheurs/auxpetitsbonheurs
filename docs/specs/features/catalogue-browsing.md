# Feature Spec — Catalogue browsing

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 · Epic: TBD (`/create-epics`)
Related: [pricing-availability-promotions](pricing-availability-promotions.md) (rules used here), [checkout-and-tracking](checkout-and-tracking.md) (what "Add to basket" feeds)

## Summary
Everything a P1 customer sees before ordering: language switch, promo banner, footer, Home, Menu with filters, Product page, Gallery, About, Contact and FAQ, plus search/share previews. All pages are server-rendered, bilingual (EN/FR) and read their content from Settings and the catalogue, so the bakery changes content with no deployment. Pricing, seasonal and promotion rules are not defined here; this spec only says where they are shown.

Out of scope: basket and checkout, custom cake form (the gallery button only links to it), accounts, admin editing screens (FR-061..067), "Preview as customer".

## Requirements trace
| PRD ID | Requirement | Covered by |
|---|---|---|
| FR-001 | EN/FR switch, remembered, first-visit detection, stored on orders | Locale handling, AC1-AC5 |
| FR-002 | Dismissible top promo banner while live | Promo banner, AC6-AC8 |
| FR-003 | Footer contact values from Settings | Footer, AC9 |
| FR-004 | Home sections | Home, AC10-AC11 |
| FR-005 | Menu grid, type + allergen filters, sold-out label, hidden absent | Menu, AC12-AC16 |
| FR-006 | Seasonal window display (rule in pricing spec) | Menu/Product, AC17 |
| FR-007 | Product page content and live price | Product page, AC18-AC24 |
| FR-008 | Message-on-cake limit (client side; server in pricing spec) | Product page, AC22 |
| FR-009 | Gallery, lightbox, "Request something similar" | Gallery, AC25-AC27 |
| FR-010 | About, Contact, FAQ from Settings with EN fallback; cancellation and storage text | Content pages, AC28-AC30 |
| NFR-010 | Titles, descriptions, share previews | SEO, AC31-AC32 |

## UX
### Screens & states
| Screen | Route (EN; `/fr` twin) | Loading | Empty | Error | Success / notes |
|---|---|---|---|---|---|
| Home | `/` | SSR; skeleton only for below-fold images | Sections with no data are omitted (no promo cards, no seasonal) | Page error state + WhatsApp | Hero, promo cards, seasonal, featured, How it works, gallery preview (6), buttons "Order now" (`/menu`) and "Custom cake" (`/custom-cake`) |
| Menu | `/menu?type=&allergen=` | SSR | "No cakes match these filters." + Clear filters | Section error + Retry | Product cards in `sort_order`; 2/3/4 columns at 375/md/lg |
| Product | `/menu/:slug` | SSR; carousel loads on interaction | n/a | 404 state "This product is no longer available" + link to menu (hidden or out of season); sold out: "Sold out this week" + WhatsApp, options hidden | Sticky Add-to-basket bar with live price |
| Gallery | `/gallery?occasion=` | Blur-up placeholders | "No photos for this occasion yet." | Section error | 3-column grid, lightbox |
| About / Contact / FAQ | `/about`, `/contact`, `/faq` | SSR | Missing optional block is omitted (never a blank area) | Page error | Content from Settings |
| Layout (every page) | root | n/a | Footer item with an empty Settings value is omitted | n/a | Top bar, promo banner, footer |

Components (design-system names): Top bar, Language switch, Basket button + count, Site menu, Promo banner, Footer, Hero, Promotion card, How it works, Product card, Chip (filter), Price, Badge (sale/promo/soldout/allergen), Photo carousel, Allergen list, Option picker, Message-on-cake field, Stepper, Product page layout, Gallery grid, WhatsApp button, Empty state, Error state.

### Flow
Home or Menu -> filter (chips, URL-driven so the back button and shared links keep filters) -> Product -> choose options, message, quantity -> Add to basket (redirect `/basket` without JS; toast + count bump with JS).

### Locale handling (FR-001)
- Every customer route exists at `/x` (EN) and `/fr/x` (FR). The URL is authoritative: opening `/fr/menu` renders French and sets cookie `apb_locale=fr` (1 year, `SameSite=Lax`, functional, no consent needed).
- First visit to an unprefixed URL with no cookie: first language tag of `Accept-Language` starting `fr` -> 302 to the `/fr` twin; anything else, or no header (crawlers), stays EN with no redirect.
- Returning entry navigation (request header `Sec-Fetch-Site` is not `same-origin`) to an unprefixed URL with cookie `fr` -> 302 to the `/fr` twin. In-site navigation never redirects, so choosing EN in the switch works.
- Switch = two `<a hreflang>` links to the same page in the other language (query string kept, e.g. `/menu?type=cake`). The switch is also present on token pages (`/t/:token`, `/fr/t/:token`).
- `<html lang>` follows the page; each order stores the page locale (data-model `orders.locale`, FR-001).
- Missing FR text falls back to EN per field (`t(localized, locale)`: `fr` null, empty or whitespace -> `en`). No fallback to a blank.

### Promo banner (FR-002)
- Root loader returns the one banner to show: among live promotions with placement banner/both, the latest `starts_at` (ties: lowest id). Liveness uses `isLive(promo, now)` from the pricing spec.
- Dismiss posts `dismissBanner { promotionId }`, which sets a session cookie `apb_banner_dismissed=<promotionId>`; the server then omits that promotion for the rest of the visit. A different later promotion still shows. Works without JS.
- Link target: product -> `/menu/:slug`; category -> `/menu?type=` (or category filter); custom_request -> `/custom-cake`; none -> banner is text only.
- Pages are `no-store`, so the banner disappears on the first request at or after `ends_at` with no job.

### Menu rules (FR-005)
- `type` is single-select (All, Cakes, Cupcake boxes, Desserts, Seasonal); `allergen` is multi-select and **all selected tags must be present** (AND). Filters combine with AND across the two.
- Unknown `type` is treated as All; unknown allergen values are ignored; the URL is not rewritten.
- Hidden and out-of-season products are not in the grid. Sold-out products are shown with the Sold out badge and open the product page; they cannot be added.
- Card price: `fromPriceRs`; if a live promotion applies, struck `fromPriceRs` plus `salePriceRs` and a sale/promo badge (`ProductCard` in contracts.md).
- "Seasonal" filter and the Home seasonal row show products with a seasonal window that contains today (Mauritius).

### Product page (FR-007, FR-008)
- Photos 1-5 (carousel, alt = product name in locale), description, allergen tags + fixed kitchen note, one Option picker per group by kind, Message-on-cake field with counter (limit `cakeMessageMax`, from Settings, default 40; text groups use their own `textMaxLength`), Stepper, live Price, "Earliest date: {date}" (this product's notice only; the basket may push it later), sticky bar.
- Live price = `priceLine` from `app/domain/pricing.ts` run in the browser on the loader's product data; the server price is authoritative (FR-011). Price updates announced politely, debounced.
- Add to basket is always enabled. Tapping with a required group unselected focuses the first missing group with "Choose a size" (design-system decision). The server repeats validation (`VALIDATION_FAILED` with `fields`).
- Message input rejects characters beyond the limit (counter turns `danger`); the server also rejects (`VALIDATION_FAILED`), it never truncates silently (prototype did).
- If a promotion applies, show promo title and "Offer ends {date}" under the price.

### Gallery (FR-009)
Occasion chips (single select + All, URL `?occasion=`). Lightbox is lazy-loaded; swipe, prev/next buttons, Esc closes, focus returns to the tapped photo. "Request something similar" links to `/custom-cake?fromGallery=<id>` (the custom-cake loader attaches the photo).

### Content pages (FR-010)
About (text + photo), Contact (WhatsApp, phone, email, Instagram buttons; pickup address with map link), FAQ (Q&A list, policies, privacy note). Seeded content (migration, EN and FR) must contain: (a) cancellation policy: free via WhatsApp until 48 hours before the order date, no refund after that; (b) storage advice: keep refrigerated, take out about 30 minutes before serving, best eaten within 2-3 days. The cancellation block has anchor `#cancellation`, linked from checkout and tracking.

### Copy
All strings in `i18n/en.json` / `fr.json` (ICU placeholders, no concatenation). Needed keys: filter labels, "No cakes match…", "Sold out this week", "This product is no longer available", "Earliest date", "Offer ends", "Choose a size" family, kitchen allergen note, How it works (3 steps), button labels. `copywriter` delivers FR; design-system FR +30% rule applies.

## API Contract
Uses existing route contracts in `docs/architecture/api/contracts.md`, no new routes: **Root and layout** (`root.tsx`), **Customer site** rows `site/home`, `site/menu`, `site/product` (`addToBasket`), `site/gallery`, `site/about`, `site/contact`, `site/faq`. Errors used: `VALIDATION_FAILED`, `PRODUCT_UNAVAILABLE`, `BASKET_FULL`, `NOT_FOUND` (product loader 404).

### Open contract changes (applied 2026-11-10)
1. `root.tsx`: add action `dismissBanner { promotionId: Uuid }` -> `{ ok: true }`, sets session cookie (see Promo banner). — **Resolved in contracts.md (2026-11-10).**
2. `site/product` loader: add `promotion: { title: Localized, endsAt: string } | null` (Offer ends line) and `status: "available" | "sold_out"` so the sold-out page state can render (loader currently 404s only hidden/out of season). — **Resolved in contracts.md (2026-11-10).**
3. `site/home`: `PromoCard` is not defined in "Shared output shapes"; define `{ id, title: Localized, text: Localized | null, imageUrl: string | null, href: string | null }`. — **Resolved in contracts.md (2026-11-10).**
4. Optional (Could): resource route `/sitemap.xml` (EN+FR URLs of home, menu, live products, gallery, about, contact, faq). — **Resolved in contracts.md (2026-11-10).**

## Data Model Changes
None. Reads `product`, `product_photo`, `option_group`, `option_choice`, `promotion`, `promotion_product`, `gallery_photo`, `settings`. Migration seed must include the FAQ/policy defaults above (both locales) and `cake_message_max = 40`.

## Permissions matrix
| Action | Anonymous | Customer | Admin / Owner |
|---|---|---|---|
| View published catalogue and content pages | yes | yes | yes |
| View hidden or out-of-season product (direct URL) | no (404) | no (404) | no (use "Preview as customer", FR-062) |
| Add to basket | yes | yes | yes |

## Analytics Events
Optional, cookieless (NFR-011); a `track()` seam that is a no-op until a provider is chosen. No PII, no free text.
| Event | Trigger | Properties |
|---|---|---|
| `language_switched` | switch used | from, to, page |
| `menu_filtered` | filter chip changed | type, allergen_count |
| `product_viewed` | product page rendered | product_id, sold_out |
| `add_to_basket` | action success | product_id, quantity, has_promotion |
| `banner_dismissed` / `banner_clicked` | banner interactions | promotion_id |
| `gallery_similar_clicked` | button | photo_id |

## Edge Cases
- Product hidden, sold out, or leaving season between page load and Add: `PRODUCT_UNAVAILABLE`, page re-renders with the right state.
- Promotion ends while the product page is open: live price shows the sale until submit; basket and checkout re-price (FR-015). Not an error on this page.
- Seasonal window shown to a visitor at 23:59 vs 00:00 Mauritius: window judged on `todayMU(now)`.
- Photo missing/failed: named placeholder block, no layout shift (explicit width/height).
- Allergen filter with zero matches in a type: empty state names active filters.
- Two live banner promotions: one shown (rule above). Dismissed banner stays dismissed across pages but returns next visit.
- Locale: FR names/descriptions null -> EN text; FR dates longer ("sam. 14 déc."), reserve width.
- Direct URL to unknown slug: 404 with route home + WhatsApp. Trailing-slash and uppercase slugs redirect 301 to canonical.
- JavaScript disabled: filters (links), Add to basket (form post), banner dismiss, language switch all work.
- Very long product name or 5 option groups: wraps, never truncated with ellipsis on phones.

## Acceptance Criteria
- AC1: Given no cookie and `Accept-Language: fr-MU,fr;q=0.9`, when `/` is requested, then 302 to `/fr` and the cookie is set to fr.
- AC2: Given no cookie and `Accept-Language: en-GB`, or no header, when `/` is requested, then EN renders without redirect.
- AC3: Given the visitor is on `/menu?type=cake`, when they choose FR in the switch, then `/fr/menu?type=cake` loads and the cookie becomes fr.
- AC4: Given cookie fr and an in-site click on the EN switch from `/fr/menu`, then `/menu` renders in EN with no redirect back.
- AC5: Given an order placed from a `/fr` page, then the stored order locale is fr and its emails are French.
- AC6: Given a live banner promotion, when any page loads, then the banner shows with its link.
- AC7: Given the visitor dismisses it, when they open another page in the same visit, then it is not shown; in a new session it shows again.
- AC8: Given `ends_at` 18:00 Mauritius, then a request at 17:59 shows the banner and a request at 18:00 does not.
- AC9: Given Settings contact values, then the footer shows them on every page; a changed value shows on the next request; an empty value is omitted.
- AC10: Given a live promotion with placement both, then Home shows its card and the banner; after it ends, neither shows.
- AC11: Given no live promotion or no seasonal product, then those Home sections are absent.
- AC12: Given `type=cake&allergen=eggless,nut_free`, then only cakes that carry both tags appear.
- AC13: Given an unknown `type=xyz`, then all products show.
- AC14: Given a sold-out product, then the card shows Sold out, the page shows "Sold out this week" and Add is unavailable; a forged `addToBasket` returns `PRODUCT_UNAVAILABLE`.
- AC15: Given a hidden product, then it is absent from the grid and `/menu/:slug` returns 404 and `addToBasket` returns `PRODUCT_UNAVAILABLE`.
- AC16: Given no results, then the empty state lists the active filters and offers Clear filters.
- AC17: Given a seasonal product ending on D, then its card and page are available on D and 404 on D+1 (Mauritius date).
- AC18: Given a product with 4 photos, then the carousel shows "Photo 1 of 4" and alt text equals the product name in the page locale.
- AC19: Given a required group unselected, when Add is tapped, then focus moves to that group with an error and nothing is added.
- AC20: Given selected options, then the displayed price equals `priceLine` for the same input and equals the server price after Add (basket line).
- AC21: Given a promotion on the product, then the original price is struck, the sale price shown and "Offer ends {date}" shown.
- AC22: Given a message limit of 40, when a 41st character is typed, then it is not accepted; a posted 41-character message returns `VALIDATION_FAILED` with `fields.cakeMessage`.
- AC23: Given allergens, then tags and the kitchen note are both shown.
- AC24: Given the basket already has 10 lines, when Add is submitted for a new configuration, then `BASKET_FULL` is shown.
- AC25: Given occasion `birthday`, then only birthday photos show; an empty occasion shows the empty state.
- AC26: Given the lightbox is open, when Esc is pressed, then it closes and focus returns to the thumbnail.
- AC27: Given "Request something similar" on photo P, then `/custom-cake?fromGallery=P` opens.
- AC28: Given locale fr and a missing FR About text, then the EN text shows; a present FR text shows in FR.
- AC29: Given the seeded FAQ, then EN and FR both contain the 48-hour cancellation policy and the storage advice.
- AC30: Given the Contact page, then the pickup address and map link come from Settings.
- AC31: Given a product page, then `<title>`, meta description, `og:title`, `og:description`, `og:image` (main photo; brand default if none), canonical and `hreflang` en/fr/x-default are present in the page locale.
- AC32: Given token and admin routes, then `robots` is `noindex` and they are excluded from the sitemap.

## Non-functional
- Performance: Home and Menu < 3 s on mid-range 4G (NFR-001); Lighthouse perf >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, initial JS <= 170 kB gz per route. Hero image `fetchpriority=high`, other images lazy; carousel and lightbox `lazy()`; images <= 300 kB (aligned with brief 2026-11-10).
- Accessibility: WCAG 2.2 AA, Lighthouse a11y >= 95; chips and language switch are 44 px; selection not colour-only; live regions for price and basket count; `prefers-reduced-motion` honoured; 320 px / 200% zoom without clipping.
- Security: all reads public; hidden products never serialised to the client; output escaping for Settings rich text (plain text + line breaks only, no HTML).
- Privacy: no personal data collected; only functional cookies (`apb_locale`, `apb_basket`, `apb_banner_dismissed`); no consent banner.

## Rollout / flags
Flag: none · Rollback: redeploy previous build; content in Settings is unaffected.

## Open Questions
- Should `/menu` honour `allergen` as OR for "free-from" tags? Decided AND (every selected tag present); confirm with owner at launch test.
- Product-page "Earliest date" ignores the basket; acceptable or show "for your basket"? Decided: product only. Owner: product-manager.
- Banner target for a promotion link to a hidden product: link is dropped (text-only). Confirm.
