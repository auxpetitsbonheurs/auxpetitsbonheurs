<!-- Template: brand-guide | Filled by: /brand-identity (design-director, ui-designer) | Output: docs/design/brand-guide.md -->
# Brand Guide — Aux petits bonheurs

Version: 0.1 (PLACEHOLDER) · Updated: 2026-11-10

> **Placeholder identity, pending the owner's confirmation.** Written in automation mode
> from `docs/product/build-brief.md` (Defaults → Brand look) and the look of prototype
> `apb-v1`. The owner has not chosen a logo, colours or fonts. Everything here can be
> swapped later by changing tokens, not pages. Assumptions are marked *(assumed)*.

## Grounding

- **Subject:** a home bakery in Mauritius: celebration cakes, cupcake boxes, desserts, seasonal specials.
- **Audience:** Mauritian customers arriving from Instagram on their phones, ordering for a birthday, a family event or a treat; EN or FR.
- **Primary job:** browse, choose options, and place an order (or ask for a custom cake quote) with confidence about the date.
- **First feeling:** "This is made by a real person who cares, and ordering is easy."
- **What not to look like:** generic Shopify bakery templates (stock photos, black-and-gold luxury), or busy Instagram-collage pages with five fonts and neon pinks.

## Directions considered

| | A. Salon de thé rose (chosen) | B. Vanille et lagon | C. Carnet de recettes |
|---|---|---|---|
| Idea | A warm, soft little pastry shop: cream paper, one dusty rose, a soft rounded serif. | Island bakery: vanilla cream with a lagoon-teal accent, nodding to Mauritius. | A handwritten recipe notebook: kraft paper, ink line drawings, script notes. |
| Palette | Cream #FFF8F0, cocoa ink #3B2F2F, rose #B94762 | Vanilla #FFF9EC, ink #22302F, teal #1F6F6B | Kraft #F3E6D3, ink #2A2420, tomato #B4412C |
| Type | Fraunces (SOFT) + Nunito Sans | Young Serif + Work Sans | Gloock + Caveat + Karla |
| Motif | Rounded cards, scalloped dividers, generous photos | Wave-shaped section edges, palm-leaf shadows | Torn-paper edges, doodled arrows, tape |
| Sample headline | "Little cakes for your big days." | "Baked fresh, island-style." | "From our kitchen notebook to your table." |
| Risk | Can drift towards twee if overdone | Teal fights with pink/frosting photos; "tropical" can feel touristy | Three families; script hurts FR readability and accessibility on phones |

**Why A:** the client has already seen and reacted to it in `apb-v1`; it matches the brief default
(cream, one pastel accent, rounded serif, clean sans) exactly; and rose flatters cake
photography instead of competing with it. B and C stay on file if the owner wants a change.

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
- **Files:** none yet. Placeholder is a **text wordmark**: "Aux petits bonheurs" in Fraunces, weight 600, SOFT 100, sentence case, ink #3B2F2F (light) / cream #FFF8F0 (dark). Optional small rose dot or heart-free scallop mark before it is *not* used until the owner decides.
- **Short form:** "apb" is not used publicly; on tight spaces (favicon, app icon) use "a" lowercase Fraunces in cream on rose #B94762 *(placeholder)*.
- **Clear space:** at least the cap height of the wordmark on all sides. **Minimum size:** 16 px tall on screen (top bar uses 20–22 px).
- **When the owner supplies a logo:** it replaces the wordmark; keep the clear-space rule and check it on cream and cocoa backgrounds.
- **Don'ts:** stretch, outline, drop shadow, gradient, recolour to anything but ink, cream or rose-700, place on busy photos without a cream scrim.

## Colour

Values will live in `docs/design/tokens.json` (next step `/design-tokens`); this section explains usage. One accent only: rose. Everything else is cream, cocoa and neutral. Ratios computed per WCAG 2.x relative luminance.

### Light theme

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

### Dark theme (cocoa)

| Role | Token | Dark | Use |
|---|---|---|---|
| Background | color.bg | #241B1C | Page |
| Surface | color.surface | #33282A | Cards, inputs |
| Text | color.text | #FFF8F0 | Body and headings |
| Text muted | color.text.muted | #CDBDB8 | Secondary |
| Primary | color.brand.primary | #F2A8B6 rose-300 | Links, focus ring; buttons with #241B1C text |
| Border (UI) | color.border.input | #A08E8A | Inputs |
| Success / Warning / Danger / Info | color.* | #7FC8A0 / #E8B860 / #F08A80 / #8EC1E0 | Same roles as light |

### Contrast checks (WCAG 2.2 AA)

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

## Typography
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

## Imagery & illustration
- **Photography first.** Real products from the owner's kitchen/Instagram: natural daylight, soft shadows, warm white balance, the cake as the hero, shot slightly above or straight on.
- **Backgrounds:** cream, linen, light wood, marble; one prop at most (a fork, ribbon, candle).
- **Framing:** square (1:1) for product cards and gallery (matches Instagram), 4:5 for product pages, 3:2 for banners; corners rounded 16 px.
- **People:** hands, candles being blown out, a box being opened; faces only with consent.
- **Illustration:** minimal; a scalloped edge or a thin rose line flourish as section dividers. No clip-art cupcakes.
- **Do:** consistent warm grade across the menu; show what's actually in a cupcake box.
- **Don't:** stock photos, heavy filters, text baked into images (breaks EN/FR), busy collages.
- Placeholder images until the owner supplies photos: soft rose/cream blocks with the product name, never stock.

## Iconography
- **Set:** Lucide (open source, ISC), outline style.
- **Stroke:** 1.75 px at 24 px; round caps and joins to match the soft serif.
- **Sizes:** 20 px inline, 24 px in the top bar and buttons; tap targets at least 44 × 44 px (above WCAG 2.2's 24 px minimum).
- **Colour:** inherits text colour; rose only for the active state (e.g. selected tab, basket count badge in rose-600 with white text).
- WhatsApp and Instagram use their official glyphs, monochrome.

## Motion principles
- **Purpose:** feedback and gentle delight, never decoration that delays ordering.
- **Durations:** micro (press, toggle, chip select) 100–150 ms; component (sheet, accordion, basket drawer) 200–280 ms; page/hero fade 250–350 ms. Nothing over 400 ms.
- **Easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` for entering, `ease-in` 150 ms for leaving.
- **Signature moment:** "added to basket": the basket badge does one soft scale bump (1 → 1.15 → 1, 200 ms). Order confirmed: a single gentle fade-up of the thank-you card. No confetti.
- **Avoid:** parallax, autoplaying carousels, looping animation.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, replace movement with opacity changes ≤ 150 ms or none; no scale bumps; carousels never auto-advance in any mode.

## Accessibility commitments
- WCAG 2.2 AA in light and dark (table above); visible 2 px focus ring in primary colour, 2 px offset.
- Tap targets ≥ 44 px; works from 320 px wide; text resizes to 200% without loss.
- `lang` set per page (`en` / `fr`); product photos carry EN/FR alt text.

## Examples
- Prototype carrying this look: `prototypes/apb-v1/` (cream + rose + Fraunces; body font will move to Nunito Sans).
- Next steps: `/design-tokens` to write `docs/design/tokens.json`, then `/design-system`.
