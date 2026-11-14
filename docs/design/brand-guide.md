<!-- Template: brand-guide | Filled by: /brand-identity (design-director, ui-designer) | Output: docs/design/brand-guide.md -->
# Brand Guide — Aux petits bonheurs

Version: 0.3 · Updated: 2026-11-12

> **Chosen direction: Burgundy, cream & antique gold** (Owner decisions, 2026-11-12). The Owner
> supplied the look reference `docs/design/explorations/2026-11-12-burgundy-reference.jpg`
> (site, cake box, gift box and sticker) and then the logo reference
> `docs/design/explorations/2026-11-12-logo-badges-reference.jpg` (two round badges:
> "Crème Brûlée × Cherry Tart × Antique Gold"). The palette is taken from the badges.
> It replaces v0.2 D4 Honey & cream, kept below as **superseded** with v0.1.
> Assumptions are marked *(assumed)*.

## Grounding

- **Subject:** a home bakery in Mauritius: celebration cakes, cupcake boxes, desserts, seasonal specials.
- **Audience:** Mauritian customers arriving from Instagram on their phones, ordering for a birthday, a family event or a treat; EN or FR.
- **Primary job:** browse, choose options, and place an order (or ask for a custom cake quote) with confidence about the date.
- **First feeling:** "This is a real pâtisserie that cares, and ordering is easy."
- **What not to look like:** generic Shopify bakery templates (stock photos, black-and-gold luxury), or busy Instagram-collage pages with five fonts and neon pinks.

## Chosen direction: Burgundy, cream & antique gold (v0.3)

- **Rationale (2026-11-12):** the Owner wants the shop to feel like the reference: a boxed, gift-like pâtisserie. Deep cherry-burgundy bands, crème-brûlée paper and fine antique-gold lines read "special occasion" and match the logo and packaging, while cream pages keep the menu calm and readable on a phone.
- **Owner decisions:**
  1. Full look on the customer site: burgundy header and footer bands, cream pages, thin gold lines and dividers (gold rules flanking section titles), burgundy primary buttons, a burgundy custom-cake band with a cream outline pill.
  2. **Logo (revised the same day):** a real logo replaces the text wordmark: the two round badges of the logo reference, redrawn as SVG (see Logo). The palette follows the badges: Cherry Tart burgundy, Crème brûlée cream, antique gold.
  3. Titles in **Cormorant Garamond**; body stays **Source Sans 3**. Libre Caslon is removed.
  4. **Admin app:** same palette, calmer: burgundy buttons and accents on cream, no dark bands, no gold lines (the small logo mark in the admin header is the only gold).
- **Idea:** a classic French pâtisserie box: cream card, a cherry-red ribbon, a fine gold rule. Burgundy frames the page (header, footer, call-outs); the content area is cream and quiet so the cakes bring the colour.
- **What changed from v0.2:** honey and brown ink are gone; one brand colour (burgundy) plus decorative gold; Cormorant Garamond replaces Libre Caslon Display/Text; header and footer become full-bleed burgundy bands with a 1 px gold rule; the text wordmark becomes the logo; section titles get thin gold rules. Shapes are unchanged (12 px buttons, 14 px cards, 48 px buttons).
- **Layout cues (reference):** header band = language link, centred cream logo badge (official, 2026-11-14), basket; cream hero with a large Cormorant headline and a short gold rule; centred titles flanked by gold rules ("Notre collection"); product cards in 2 columns on phones; burgundy custom-cake band with a cream outline pill ("Demander un devis"); burgundy footer with the cream logo badge.
- **Gold is decorative.** Antique gold #BA8430 measures 2.9:1 on cream and 3.9:1 on burgundy, so outside the logo it is used only for hairlines and rules, never for text or as the only edge of a control. Where gold must carry meaning on a band (basket count badge, link hover) the lighter gold #E2B66E is used (6.8:1).
- **Risk:** burgundy-and-gold can tip into "black-and-gold luxury" cliché; keep gold to 1 px lines and the logo, keep pages cream, and keep the copy warm and plain.

## Brand core
- **Purpose:** make small celebrations easy to order and lovely to receive.
- **Audience:** Instagram-first Mauritian families and friends ordering for an occasion, on a phone, in English or French.
- **Personality:**
  - **Warm**: means friendly, first-person, a little personal; not gushing or cutesy.
  - **Careful**: means clear prices, dates and notice days; not fussy or legalistic.
  - **Homemade**: means real photos, real kitchen; not rustic clichés or chalkboards.
  - **Joyful**: means a light touch of delight on success moments; not confetti everywhere.
- **Positioning line:** EN "Little cakes for your big days." · FR "De petits gâteaux pour vos grands jours." *(assumed; owner to confirm)*

## Voice & tone

We speak as the bakery ("we"), to one customer ("you"). Short sentences. Prices and dates are always explicit. French uses **vous**, natural Mauritian French, not a translation of the English; each language is written for itself.

| Context | Tone | EN example | FR example |
|---|---|---|---|
| Marketing | Warm, inviting | "Little cakes for your big days." | "De petits gâteaux pour vos grands jours." |
| Product UI | Clear, brief | "Choose your flavour" · "Ready from Sat 14 Dec" | "Choisissez votre parfum" · "Prêt à partir du sam. 14 déc." |
| Primary actions | Direct verbs | "Add to basket" · "Place order" | "Ajouter au panier" · "Commander" |
| Errors | Calm, helpful, says what to do | "We need 3 days' notice for this cake. The earliest date is Fri 13 Dec." | "Ce gâteau demande 3 jours de préavis. La première date possible est le ven. 13 déc." |
| Success | Joyful, reassuring | "Thank you! We've got your order and will confirm on WhatsApp soon." | "Merci ! Nous avons bien reçu votre commande et vous confirmons vite sur WhatsApp." |
| Sold out / closed | Gentle, offers a next step | "Sold out this week. Message us for the next batch." | "Épuisé cette semaine. Écrivez-nous pour la prochaine fournée." |

- **Words we use:** cake, box, order, ready, pick up, delivery, made to order, fresh, notice, *gâteau, boîte, commande, retrait, livraison, fait maison, préavis*.
- **Words we avoid:** "exquisite", "artisanal luxury", "yummy", "oops!", blame ("you failed to…"), SKU/checkout jargon, all-caps shouting, emoji in UI labels.
- **Formatting:** prices as "Rs 1,250" (EN) / "Rs 1 250" (FR, narrow no-break space); dates written out with weekday; 24h time in FR, "2:30 pm" in EN.

## Logo
Source: the Owner's **official badges** (sent 2026-11-14 as raster images in SVG wrappers), cut to transparent circles just inside the gold ring by `docs/design/brand/cut_badges.py`; 1024 px masters `docs/design/brand/master-badge-{cream,burgundy}-1024.webp`. The 2 MB wrappers are never committed. Code reads the files through `src/app/lib/brand.ts`. Accessible name: "Aux petits bonheurs" (`alt`); the header link is "Aux petits bonheurs, home" / "…, accueil".

**Rule: the cream badge on burgundy, the burgundy badge on cream or light.** (Each badge disappears into its own colour.)

| Badge | Files (`src/public/`) | Where |
|---|---|---|
| Cream (cream disc, burgundy script, gold ring, whisk and heart) | `brand/badge-cream-{64,128,192,256,320}.webp` (2.6–17.5 kB) | Burgundy header (48 px below 23rem, else 56 px; badge only: it carries the name and a wordmark beside it does not fit at 320 px), burgundy footer (96 / 112 px), home hero placeholder (128 / 160 px) |
| Cream | `brand/og-image.jpg` (1200×630, 51 kB) | Share card: cream badge centred on burgundy with a gold rule |
| Cream | `brand/badge-cream-300.png` (22 kB) | Invoice PDF (pdf-lib `embedPng`) and print view: prints light on white paper, the ring edges it |
| Burgundy (burgundy disc, cream script, gold ring) | `brand/badge-burgundy-{64,128,192}.webp` | Admin header (light) |
| Cream, whisk painted out | `brand/badge-cream-plain-{200,400}.webp` (10 / 23 kB; `docs/design/brand/plain_badge.py`) | Page loader (S-317): under the animated inline-SVG gold whisk and heart |
| Burgundy | `brand/badge-burgundy-240.png` (12 kB) | Email header, 120 px displayed |
| Burgundy | `favicon-32.png`, `favicon-48.png`, `favicon.ico` (16/32/48) | Browser tab: the strongest silhouette at tab size, light or dark chrome |
| Burgundy | `apple-touch-icon.png`, `admin/apple-touch-icon.png` (180, on solid cream), `admin/icon-{192,512}.png` (transparent), `admin/icon-maskable-512.png` (cream, badge inside the 80 % safe circle) | Home-screen and app icons |

- **Clear space:** at least 1/8 of the badge diameter on all sides. **Minimum size:** badge 32 px (the script is decorative below ~56 px, the tagline below 96 px).
- **Contrast:** logos are exempt from WCAG 1.4.3, but both versions still pass: burgundy script on cream 11.0:1, cream on burgundy 11.0:1. The gold ring and mark are decorative.
- **Don'ts:** recolour outside the three logo colours, stretch, add shadows or gradients, place the cream badge on a busy photo without a cream scrim, retype the script in a live font.

## Colour

Values live in `docs/design/tokens.json`; this section explains usage. One brand colour (Cherry Tart burgundy), crème-brûlée paper, wine-brown ink, and decorative antique-gold lines. Ratios computed per WCAG 2.x relative luminance on 2026-11-12 (rounded down) and re-checked by `src/app/lib/tokens.test.ts`.

### Light theme

| Role | Token | Light | Use |
|---|---|---|---|
| Background | color.bg | #FBF3E8 cream | Page background |
| Surface | color.surface | #FFFBF5 | Cards (1 px hairline), inputs, sticky bars |
| Soft band | color.muted | #F6EAD8 cream | Order summaries, confirmation number |
| Surface accent | color.accent | #F3E2D0 | Selected radio card / chip, hover on outline buttons |
| Image placeholder | color.decorative | #EFDCC6 | Photo backdrop and placeholder only. **Never text** |
| Text | color.fg | #3B1512 wine ink | Body and headings |
| Text muted | color.muted-fg | #6E4A44 | Secondary text, captions, hero paragraph |
| Primary | color.primary | #660C0C Cherry Tart | Buttons (cream #FCEAD8 text), focus ring, selected controls |
| Link / accent text | color.primary-strong | #520909 | Links, prices; button hover |
| Link hover | color.link-hover | #3D0707 | Link hover |
| Band | color.band | #660C0C Cherry Tart (= logo badge 2) | Customer header, footer, call-out bands (not admin) |
| Text on band | color.band-fg | #FCEAD8 Crème brûlée (= logo cream) | Links, icons, focus ring on bands |
| Muted text on band | color.band-muted-fg | #EBD3BE | Pickup address, copyright on bands |
| Light gold on band | color.band-gold | #E2B66E | Basket count badge (burgundy text), link hover on bands |
| Gold line | color.gold | #BA8430 antique gold (= logo ring) | 1 px rules: header bottom, footer top, section titles. **Decorative only** (customer site) |
| Border (UI) | color.border-input | #8C6E66 | Input, checkbox, radio outlines |
| Border (decor) | color.border | #EAD6BC | Card hairlines (not relied on for meaning) |
| Success / Warning / Danger / Info | color.* | #2F6B4F / #8A5A00 / #A8322D / #2E5E7E | Status, always with a word and an icon |

### Dark theme (cellar)

Not in the reference; derived so dark-mode phones keep the same identity: deep wine-black surfaces, cream text, a **cream** primary button with burgundy text, champagne links. Bands and logos stay the same.

| Role | Token | Dark | Use |
|---|---|---|---|
| Background | color.bg | #1A0D0B | Page |
| Surface | color.surface | #24120F | Cards, inputs, sticky bars |
| Soft band | color.muted | #2D1714 | Summaries |
| Surface accent | color.accent | #3B1D19 | Selected card |
| Image placeholder | color.decorative | #40221D | Photo backdrop only |
| Text / muted | color.fg / color.muted-fg | #F6EAD8 / #DCC3B4 | Body / secondary |
| Primary | color.primary | #F6EAD8 cream | Buttons with #520909 text |
| Link / accent text | color.primary-strong | #E3C08A champagne | Links, prices; button hover; focus ring |
| Link hover | color.link-hover | #F3DDB8 | Link hover |
| Band / on band | color.band / band-fg / band-muted-fg / band-gold | #660C0C / #FCEAD8 / #EBD3BE / #E2B66E | Same as light |
| Gold line | color.gold | #BA8430 | Decorative rules |
| Border (UI) / decor | color.border-input / color.border | #A5877C / #47291F | Inputs / card hairlines |
| Success / Warning / Danger / Info | color.* | #7FC8A0 / #E8B860 / #F08A80 / #8EC1E0 | Same roles as light |

### Contrast checks (WCAG 2.2 AA)

Text needs 4.5:1, large text and UI parts (outlines, focus ring) 3:1. Every pair below is recomputed by `src/app/lib/tokens.test.ts`.

| Pair (light) | Ratio | Result |
|---|---|---|
| Ink #3B1512 on cream / surface / soft band / accent | 14.6 / 15.6 / 13.5 / 12.7:1 | Pass |
| Muted #6E4A44 on cream / surface / soft band / accent / placeholder | 7.0 / 7.4 / 6.4 / 6.0 / 5.7:1 | Pass |
| Cream #FCEAD8 on burgundy #660C0C (button) / on #520909 (hover) | 11.0 / 12.7:1 | Pass |
| Burgundy #660C0C on cream / surface / soft band | 11.7 / 12.5 / 10.8:1 | Pass |
| Link #520909 on cream / surface / soft band / accent | 13.6 / 14.5 / 12.6 / 11.8:1 | Pass |
| Link hover #3D0707 on cream / soft band | 15.4 / 14.3:1 | Pass |
| Cream #FCEAD8 on band #660C0C (links, focus ring, logo script) | 11.0:1 | Pass |
| Muted #EBD3BE on band | 8.9:1 | Pass |
| Light gold #E2B66E on band (badge, link hover); burgundy #660C0C on light gold (badge text) | 6.8:1 | Pass |
| Input border #8C6E66 on cream / surface / soft band | 4.2 / 4.4 / 3.8:1 | Pass (UI 3:1) |
| Focus ring #660C0C on cream / surface / soft band | 11.7 / 12.5 / 10.8:1 | Pass (UI 3:1) |
| Success / Warning / Danger / Info on cream | 5.7 / 5.3 / 6.0 / 6.3:1 | Pass |
| Success / Warning / Danger / Info on soft band | 5.2 / 4.9 / 5.5 / 5.8:1 | Pass |
| #FFFBF5 on danger #A8322D | 6.4:1 | Pass |
| Gold #BA8430 on cream / on band | 2.9 / 3.9:1 | **Decorative only**, never text or a control edge |
| Placeholder #EFDCC6 on cream | 1.2:1 | Surface only, never text |

| Pair (dark) | Ratio | Result |
|---|---|---|
| Cream #F6EAD8 on #1A0D0B / surface / soft band / accent | 15.9 / 15.1 / 14.2 / 12.8:1 | Pass |
| Muted #DCC3B4 on bg / surface / band / accent / placeholder | 11.3 / 10.7 / 10.0 / 9.0 / 8.5:1 | Pass |
| #520909 on cream button #F6EAD8 / on hover #E3C08A | 12.6 / 8.6:1 | Pass |
| Link #E3C08A on bg / surface / band / accent | 11.0 / 10.4 / 9.7 / 8.8:1 | Pass |
| Input border #A5877C on bg / surface / band | 5.7 / 5.4 / 5.1:1 | Pass |
| Focus ring #E3C08A on bg / surface | 11.0 / 10.4:1 | Pass |
| Status colours on bg | 9.6 / 10.3 / 7.8 / 9.8:1 | Pass |
| Bands | as light | Pass |

**Focus:** a 2 px ring, 2 px offset: burgundy #660C0C on cream (11.7:1), switching to cream inside any burgundy band (11.0:1), champagne #E3C08A in dark (11.0:1). Colour is never the only signal: status always carries a word and an icon.

## Typography
- **Titles: Cormorant Garamond** (OFL), weights **500** (display, h1, h2) and **600** (h3, card and product names). Why: the high-contrast, elegant Garamond of the reference; it reads "pâtisserie" at large sizes, has full French accent coverage, and 600 keeps thin strokes legible at 17–22 px. Never faux-bolded; no italic shipped.
- **Body and UI: Source Sans 3** (OFL), 400 and 600. Unchanged.
- Self-hosted through `@fontsource` (no Google Fonts request at runtime), `font-display: swap`. Cormorant ships **only latin + latin-ext woff2** (declared in `src/app/app.css` with unicode-range, so EN/FR pages fetch latin and latin-ext only when a character needs it). Four Cormorant files (~87 kB on disk, ~23 kB per face on an EN/FR page) plus Source Sans 400/600.
- **Scale (mobile → ≥768 px), rem based:**

| Step | Use | Mobile | Desktop | Family / weight | Line height |
|---|---|---|---|---|---|
| display | Home hero headline | 42 px | 56 px | Cormorant 500 | 1.08 |
| tagline | Hero tagline (prototype) | 18 px | 18 px | Cormorant 500, burgundy | 1.4 |
| h1 | Page title | 34 px | 44 px | Cormorant 500 | 1.12 |
| h2 | Section (gold rules on customer pages) | 28 px | 32 px | Cormorant 500 | 1.2 |
| h3 | Card / product name | 17–20 px | 22 px | Cormorant 600 | 1.3 |
| body-lg | Intro, product description | 18 px | 18 px | Source Sans 3 400 | 1.6 |
| body | Default; all inputs | 16 px | 16 px | Source Sans 3 400 | 1.55 |
| small | Captions, helper, allergens | 14 px | 14 px | Source Sans 3 400/600 | 1.45 |
| price | Prices | 18 px | 20 px | Source Sans 3 600, tabular figures | 1.2 |

- Rules: inputs never below 16 px (prevents iOS zoom); body text never below 14 px; sentence case everywhere, no all-caps eyebrows (the logo's "PÂTISSERIE ARTISANALE" caps line lives only inside the logo); line length 60–75 characters; French runs ~15% longer, so buttons and chips must wrap gracefully.

## Imagery & illustration
- **Photography first.** Real products from the owner's kitchen/Instagram: natural daylight, soft shadows, warm white balance, the cake as the hero, shot slightly above or straight on.
- **Backgrounds:** cream, linen, marble, a burgundy ribbon or cloth; one prop at most (a fork, ribbon, candle).
- **Framing:** square (1:1) for product cards (radius 10 px inside the card), 4:5 for product pages, 3:2 for banners (radius 16 px).
- **People:** hands, candles being blown out, a box being opened; faces only with consent.
- **Illustration:** none beyond thin gold hairlines; no clip-art cupcakes, no gradients.
- **Do:** consistent warm grade across the menu; show what's actually in a cupcake box.
- **Don't:** stock photos, heavy filters, text baked into images (breaks EN/FR), busy collages.
- Placeholder images until the owner supplies photos: cream-300 #EFDCC6 blocks with a short caption in muted text, never stock.

## Iconography
- **Set:** Lucide (open source, ISC), outline style.
- **Stroke:** 1.5–1.75 px at 24 px; round caps and joins.
- **Sizes:** 20 px inline, 22–24 px in the top bar and buttons; tap targets at least 44 × 44 px (above WCAG 2.2's 24 px minimum).
- **Colour:** inherits text colour (wine ink on cream, cream on burgundy bands); the basket count badge is light gold #E2B66E with burgundy #660C0C text on the header band (6.8:1); in the admin app active states use burgundy.
- WhatsApp and Instagram use their official glyphs, monochrome.

## Motion principles
- **Purpose:** feedback and gentle delight, never decoration that delays ordering.
- **Durations:** micro (press, toggle, chip select) 100–150 ms; component (sheet, accordion, basket drawer) 200–280 ms; page/hero fade 250–350 ms. Nothing over 400 ms.
- **Easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` for entering, `ease-in` 150 ms for leaving.
- **Signature moment:** "added to basket": the basket badge does one soft scale bump (1 → 1.15 → 1, 200 ms). Order confirmed: a single gentle fade-up of the thank-you card. No confetti.
- **Avoid:** parallax, autoplaying carousels, looping animation.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, replace movement with opacity changes ≤ 150 ms or none; no scale bumps; carousels never auto-advance in any mode.

## Accessibility commitments
- WCAG 2.2 AA in light and dark (tables above); visible 2 px focus ring, 2 px offset, burgundy on cream and cream on burgundy bands.
- Gold never carries text or meaning on its own; section-title rules are CSS pseudo-elements (never read out).
- Tap targets ≥ 44 px (buttons 48 px); works from 320 px wide; text resizes to 200% without loss.
- Every logo image is named "Aux petits bonheurs" (the header logo is the home link's name); the small admin mark next to the brand text is decorative (`alt=""`).
- The header keeps DOM order = visual order (language, logo, basket); the language link keeps `lang`/`hreflang` and is named in its own language ("Français" / "English").
- `lang` set per page (`en` / `fr`); product photos carry EN/FR alt text.

## Examples
- Owner's references: `docs/design/explorations/2026-11-12-burgundy-reference.jpg` (look) and `2026-11-12-logo-badges-reference.jpg` (logo, palette).
- Applied in `src/` (tokens in `src/app/app.css`, checked against `tokens.json` by `src/app/lib/tokens.test.ts`; bands and gold rules are the `band`, `section-title` and `section-title-start` utilities) and in `prototypes/apb-v1`.

## Superseded: v0.2 "D4 · Honey & cream" (2026-11-10, replaced 2026-11-12)

Kept for the record. Do not use these values; tokens and code no longer contain them. Mockup: `docs/design/explorations/2026-11-10-D4-honey-cream.html`.

- **Why replaced:** the Owner chose the burgundy, cream and gold references (v0.3) on 2026-11-12.
- **Palette:** cream #FAF5EC, surface #FFFDF8, honey band #F1E3C8, ink #3A2A1C, muted #5E4C3A, honey primary #8C5A1E, links #7D4F17; dark "espresso" #1C1510 with honey #E2B26A.
- **Type:** Libre Caslon Display 400 (h1, h2, wordmark), Libre Caslon Text 400 + italic (h3, tagline), Source Sans 3 400/600.
- **Layout:** cream header and footer, honey soft band for the custom-cake call-out; shapes as v0.3.

## Superseded: v0.1 "Salon de thé rose" (2026-11-10, replaced the same day)

Kept for the record. Do not use these values; tokens and code no longer contain them.

### Directions considered (v0.1)

| | A. Salon de thé rose (chosen) | B. Vanille et lagon | C. Carnet de recettes |
|---|---|---|---|
| Idea | A warm, soft little pastry shop: cream paper, one dusty rose, a soft rounded serif. | Island bakery: vanilla cream with a lagoon-teal accent, nodding to Mauritius. | A handwritten recipe notebook: kraft paper, ink line drawings, script notes. |
| Palette | Cream #FFF8F0, cocoa ink #3B2F2F, rose #B94762 | Vanilla #FFF9EC, ink #22302F, teal #1F6F6B | Kraft #F3E6D3, ink #2A2420, tomato #B4412C |
| Type | Fraunces (SOFT) + Nunito Sans | Young Serif + Work Sans | Gloock + Caveat + Karla |
| Motif | Rounded cards, scalloped dividers, generous photos | Wave-shaped section edges, palm-leaf shadows | Torn-paper edges, doodled arrows, tape |
| Sample headline | "Little cakes for your big days." | "Baked fresh, island-style." | "From our kitchen notebook to your table." |
| Risk | Can drift towards twee if overdone | Teal fights with pink/frosting photos; "tropical" can feel touristy | Three families; script hurts FR readability and accessibility on phones |

**Why A (at the time):** the client had already seen and reacted to it in `apb-v1`; it matches the brief default
(cream, one pastel accent, rounded serif, clean sans) exactly; and rose flatters cake
photography instead of competing with it. B and C stay on file if the owner wants a change.

### Colour (v0.1)

Values will live in `docs/design/tokens.json` (next step `/design-tokens`); this section explains usage. One accent only: rose. Everything else is cream, cocoa and neutral. Ratios computed per WCAG 2.x relative luminance.

#### Light theme (v0.1)

| Role | Token | Light | Use |
|---|---|---|---|
| Background | color.bg | #FFF8F0 cream | Page background |
| Surface | color.surface | #FFFFFF | Cards, sheets, inputs |
| Surface muted | color.surface.muted | #F7EBDD cream-dark | Footer, section bands |
| Surface accent | color.surface.accent | #FDE4E9 rose-100 | Promo banner, selected chip |
| Text | color.text | #3B2F2F cocoa ink | Body and headings |
| Text muted | color.text.muted | #6F6060 | Secondary text, captions |
| Primary | color.brand.primary | #B94762 rose-600 | Buttons, links on cream/white, focus ring |
| Primary strong | color.brand.primary-strong | #99344E rose-700 | Pressed/hover, links and text on rose-100 or cream-dark |
| Decorative | color.brand.soft | #F2A8B6 rose-300, #D96A80 rose-500 | Illustrations, dividers, badges background only. **Never text** |
| Border (UI) | color.border.input | #9C8A86 | Input and checkbox outlines |
| Border (decor) | color.border | #F7EBDD | Card hairlines (not relied on for meaning) |
| Success | color.success | #2F6B4F | Confirmed, available |
| Warning | color.warning | #8A5A00 | Notice-day warnings, low stock |
| Danger | color.danger | #A8322D | Errors, cancel |
| Info | color.info | #2E5E7E | Tips, delivery info |

#### Dark theme (v0.1)

| Role | Token | Dark | Use |
|---|---|---|---|
| Background | color.bg | #241B1C | Page |
| Surface | color.surface | #33282A | Cards, inputs |
| Text | color.text | #FFF8F0 | Body and headings |
| Text muted | color.text.muted | #CDBDB8 | Secondary |
| Primary | color.brand.primary | #F2A8B6 rose-300 | Links, focus ring; buttons with #241B1C text |
| Border (UI) | color.border.input | #A08E8A | Inputs |
| Success / Warning / Danger / Info | color.* | #7FC8A0 / #E8B860 / #F08A80 / #8EC1E0 | Same roles as light |

#### Contrast checks (v0.1)

| Pair | Ratio | Result |
|---|---|---|
| Ink #3B2F2F on cream #FFF8F0 | 12.2:1 | Pass |
| Text muted #6F6060 on cream | 5.7:1 | Pass |
| Text muted #6F6060 on cream-dark #F7EBDD | 5.1:1 | Pass |
| Rose-600 #B94762 on cream | 4.8:1 | Pass (body) |
| Rose-600 on white | 5.1:1 | Pass |
| White on rose-600 (primary button) | 5.1:1 | Pass |
| White on rose-700 #99344E | 7.1:1 | Pass |
| Rose-700 on cream | 6.8:1 | Pass |
| Ink on rose-100 #FDE4E9 | 10.7:1 | Pass |
| Rose-700 on rose-100 | 5.9:1 | Pass |
| **Rose-600 on rose-100** | 4.2:1 | **Fail body** → use rose-700 for text on rose-100 |
| **Rose-600 on cream-dark** | 4.3:1 | **Fail body** → use rose-700 for links in the footer/bands |
| **Rose-500 #D96A80 on cream** | 3.2:1 | **Fail body**, large text only → keep decorative |
| Input border #9C8A86 on cream | 3.1:1 | Pass (UI 3:1, tight; do not lighten) |
| Success / Warning / Danger / Info on cream | 6.0 / 5.6 / 6.3 / 6.6:1 | Pass |
| Cream on cocoa #241B1C | 16.0:1 | Pass |
| Muted #CDBDB8 on cocoa | 9.3:1 | Pass |
| Rose-300 on cocoa; cocoa on rose-300 button | 8.9:1 | Pass |
| Cream / rose-300 on dark surface #33282A | 13.5 / 7.5:1 | Pass |
| Dark input border #A08E8A on cocoa | 5.4:1 | Pass |
| Dark semantics on cocoa | 8.5 / 8.7 / 6.9 / 8.7:1 | Pass |

Colour is never the only signal: status always carries a word and an icon.

### Typography (v0.1)
- **Display: Fraunces** (Google Fonts, variable, OFL), weights 500–700, axis `SOFT 100`, `opsz` auto. Why: a soft, rounded old-style serif that reads "pâtisserie" and homemade without being a script; continuous with the prototype; full French accent coverage.
- **Body: Nunito Sans** (Google Fonts, variable, OFL), weights 400/600/700. Why: humanist and slightly rounded, warmer than Inter (used in the prototype) while just as legible at small sizes on phones. *(Change from prototype; low visual risk. If the owner prefers, Inter stays acceptable.)*
- Two families only. Load subsets `latin` + `latin-ext`, `font-display: swap`, self-hosted, variable files only (keeps the JS/CSS budget).
- **Scale (mobile → ≥768 px), rem based:**

| Step | Use | Mobile | Desktop | Family / weight | Line height |
|---|---|---|---|---|---|
| display | Home hero | 36 px | 52 px | Fraunces 600 | 1.1 |
| h1 | Page title | 30 px | 40 px | Fraunces 600 | 1.15 |
| h2 | Section | 24 px | 30 px | Fraunces 600 | 1.2 |
| h3 | Card / product name | 20 px | 22 px | Fraunces 500 | 1.25 |
| body-lg | Intro, product description | 18 px | 18 px | Nunito Sans 400 | 1.55 |
| body | Default; all inputs | 16 px | 16 px | Nunito Sans 400 | 1.5 |
| small | Captions, helper, allergens | 14 px | 14 px | Nunito Sans 400/600 | 1.45 |
| price | Prices | 18 px | 20 px | Nunito Sans 700, tabular figures | 1.2 |

- Rules: inputs never below 16 px (prevents iOS zoom); body text never below 14 px; sentence case everywhere, no all-caps eyebrows; line length 60–75 characters; French runs ~15% longer, so buttons and chips must wrap gracefully.
