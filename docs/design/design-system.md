<!-- Template: design-system | Filled by: /design-system (design-director, ui-designer, tailwind-shadcn-specialist) | Output: docs/design/design-system.md -->
# Design System — Aux petits bonheurs

Version: 0.3 · Updated: 2026-11-12 · Rigor: standard · Status: drafted in automation mode; identity v0.3 burgundy, cream & antique gold with the logo badges, chosen by the Owner 2026-11-12

Tokens: `docs/design/tokens.json` · Brand: `docs/design/brand-guide.md` (v0.3, burgundy, cream & antique gold; references `docs/design/explorations/2026-11-12-burgundy-reference.jpg` and `2026-11-12-logo-badges-reference.jpg`) · Implementation: `src/app/components/ui/` (shadcn/ui, style `radix-nova`, alias `~/components/ui`, icons `lucide`) and `src/app/components/<domain>/` for product components.

> Scope evidence: PRD §5 (FR-001…FR-075), build brief "Customer site", "Admin app", "Quality requirements", and the components the prototype `prototypes/apb-v1/src` actually needed (`ui/ui.tsx`, `ui/OptionPicker.tsx`, `customer/*`, `admin/*`). There are no `docs/design/ux/` flows or feature specs yet; when they land, run `/design-system update`. Decisions taken without the owner are marked *(decided)*.

## Principles

1. **The cake is the hero.** Photos and prices carry the page; pages are cream, quiet and elegant, framed by burgundy bands on the customer site. One brand colour (burgundy) plus decorative gold lines, never decoration on top of food photography.
2. **Dates and prices are never a surprise.** Every price shown equals the server price (FR-007, FR-015); every date control explains why a day is unavailable (FR-014). Sale prices always show the struck original next to them (FR-016).
3. **One thumb, one primary action.** Phone first at 375 px (works at 320 px). Each view has exactly one primary button, placed where the thumb is: sticky at the bottom on product, checkout and admin detail screens.
4. **Two languages, written for themselves.** Every component accepts EN and FR strings that differ in length by 15–30%; nothing truncates a price, a date or an action label.
5. **States are designed, not left to chance.** Every data component specifies loading, empty, error and success; commerce components also specify sold-out, sale and unavailable.

## Foundations

All values come from `tokens.json`; components reference token names only. Tailwind utilities map 1:1 to the shadcn CSS variables in `$extensions.shadcn` (e.g. `bg-primary` = `color.primary` = `--primary`).

- **Colour roles:** `color.bg`, `color.fg`, `color.surface` (card), `color.popover`, `color.muted` / `color.muted-fg`, `color.primary` / `color.primary-fg`, `color.primary-strong` (links, tagline, prices), `color.link-hover`, `color.accent` / `color.accent-fg`, `color.decorative` (image placeholder, never text), `color.border` (decor only, never meaning), `color.border-input` (UI 3:1), `color.ring`, `color.success`, `color.warning`, `color.danger` / `color.danger-fg`, `color.info`; customer site only: `color.band` / `color.band-fg` / `color.band-muted-fg` / `color.band-gold` (bands) and `color.gold` (decorative 1 px rules, never text or a control edge).
  - **Bands** (`band` utility in `app.css`): burgundy background, cream text, light-gold link hover, and the focus ring switches to cream inside them. Used by the header, footer and call-out bands of the customer site only; the admin app has no bands and no gold lines.
  - **Section titles** on customer pages: `section-title` (centred, gold rules both sides, e.g. footer "Contact the bakery", "Notre collection") and `section-title-start` (start-aligned, one gold rule to the end: basket, checkout, confirmation and tracking sections). Rules are pseudo-elements, never read out.
  - Links and accent text use `color.primary-strong` on every surface (≥ 5.5:1 light, ≥ 8.1:1 dark); `color.primary` is for filled buttons, the focus ring and the count badge.
  - Status colours are used as **text, icon and 1 px border on `color.surface`**, not as filled backgrounds *(decided: avoids adding soft-tint tokens now; if tints are wanted later, add `*-soft` tokens via `/design-tokens` and re-check contrast)*.
- **Typography:** `type.scale.display` (home hero only), `tagline` (Cormorant 500 in `primary-strong`, hero only), `h1` (one per page), `h2` (sections, sheet titles), `h3` (card and product names), `body-lg` (descriptions), `body` (default and every input), `small` (helper, captions, allergens, badges), `price` (all money, `tabular-nums`). Families: `font.heading` Cormorant Garamond 500 (display, h1, h2; Tailwind `font-heading` / `font-display`), `font.subheading` Cormorant Garamond 600 (h3, card names; `font-subheading`), `font.body` Source Sans 3 400/600 (`font-sans`). Self-hosted via @fontsource (Cormorant: latin + latin-ext woff2 only), `font-display: swap`. No bold above 600; Cormorant is never faux-bolded and has no italic. No size below 14 px; no input below 16 px; sentence case; no all-caps.
- **Spacing:** `primitive.space.*`, 4 px base. Page gutter `space.4` (16 px) on phones, `space.6` from `md`. Stack gaps: `space.2` within a field, `space.4` between fields, `space.8` between sections, `space.12` between home bands. No arbitrary values.
- **Radius / shadow / elevation:** `radius.md` 12 px buttons, chips, inputs, steppers (`rounded-md`); `radius.card` 14 px cards and radio cards (`rounded-card`); `radius.sm` 10 px photos inside cards and thumbnails; `radius.lg` 16 px soft bands and large photos; `radius.xs` checkbox box; `radius.xl` sheet top corners; `radius.full` badges and the radio dot only. Flat by default: cards are `surface` + 1 px `border`, no shadow; no gradients. `shadow.md` (a faint lift) only on sticky bars and popovers, `shadow.lg` on sheets and dialogs. Dark theme relies on surface lightness.
- **Sizes:** `size.tap-target` 44 px minimum for every interactive element, including icon buttons, chips, radios-with-label rows and calendar days. `component.button.height` and `component.input.height` = 48 px (`size.button-height`); small buttons and icon buttons stay ≥ 44 px. `size.container-max` 72 rem; text blocks capped at `size.measure`.
- **Breakpoints:** design at `breakpoint.base` 375 px, verify at 320 px; `sm` 640, `md` 768 (type scale switches), `lg` 1024, `xl` 1280. `min-width` queries only.
- **Icons:** Lucide outline, stroke 1.75; 20 px inline, 24 px in bars and buttons. Icon colour inherits text. Every status, fulfilment type and availability state pairs an icon with a word.
- **Motion:** `motion.fast` (press, chip, toggle), `motion.base` (sheet, accordion, drawer), `motion.slow` (page/hero fade); easing `primitive.motion.easing.enter` / `.exit`. Signature: `motion.signature.basket-bump`, `motion.signature.order-confirmed`. **Reduced motion:** opacity only ≤ 150 ms or none; no bump, no slide; carousels never auto-advance in any mode.
- **Themes:** light (default) and dark (cellar: wine-black surfaces, cream primary button, champagne links; bands and logos unchanged) from `$extensions.mode`; follows `prefers-color-scheme`, no manual toggle in MVP *(decided)*. Photos are never tinted in dark mode.

## Components

Source legend: **shadcn** = `npx shadcn add <name>` then restyle via tokens; **custom (Radix X)** = built in-house on that primitive; **domain** = composed from the primitives above. Priority: all MVP unless marked *Later*.

### Primitives

| Component | Source | Variants | States | Notes |
|---|---|---|---|---|
| Button | shadcn `button` (exists) | `primary`, `secondary` (surface + `border-input` + fg text), `ghost`, `destructive` (outline in `danger`; filled only inside a confirm dialog), `link`; sizes `default` 48 px, `lg` 48 px wider (sticky CTA), `sm`/`xs` 44 px, `icon` 44×44; radius 12 px, flat burgundy fill (cream in dark); `band-outline` (prototype and the custom-cake band): transparent, 1 px cream border and text, pill, fills cream on hover | default, hover (`primary-strong`), focus-visible (`ring` 2 px, offset 2 px), active (scale .98, none if reduced), disabled (`aria-disabled`, keeps label readable, 50% opacity is **not** used on primary: use `muted` bg + `muted-fg` text), loading (spinner + label kept, `aria-busy`, width locked) | One `primary` per view. Verb-first labels ("Add to basket", "Commander"). Labels wrap to two lines rather than truncate; min width = content. Icon-only needs `aria-label` in the current locale. |
| Input | shadcn `input` | text, email (`inputmode=email`), tel (`inputmode=tel`, `autocomplete=tel`), number (`inputmode=numeric`), search | default (`border-input`), focus-visible (`ring`), error (`danger` border 2 px + message), disabled (`muted` bg), read-only | 16 px text always. Placeholder is an example, never the label. |
| Textarea | shadcn `textarea` | default, with counter | as Input + counter near limit (`warning`) and at limit (`danger`) | Auto-grows to 6 lines then scrolls. |
| Label | shadcn `label` | default, with "(optional)" suffix | — | Always visible above the control. Mark **optional** fields, not required ones *(decided: most fields are required)*. |
| Checkbox | shadcn `checkbox` | default | unchecked, checked, focus-visible, disabled, error | Box 20 px inside a 44 px label row; outline `border-input`. Used for policy acceptance (FR-022), "pick several" options, admin filters. |
| Radio group | shadcn `radio-group` | list rows, card rows (fulfilment: Delivery / Pickup with icon and fee) | as Checkbox, plus selected row gets `accent` bg and `primary` 2 px border | Native arrow-key behaviour from Radix. |
| Switch | shadcn `switch` | default | off, on, focus-visible, disabled | Admin only: product hidden, promotion active, alert preferences (FR-046). Label states the "on" meaning. Never used for an action with side effects that need confirmation. |
| Select | shadcn `select` | default | default, open, focus, error, disabled | Only when > 6 options (e.g. occasion, servings). ≤ 6 options use Radio group or Chips. On phones prefer native `<select>` rendering *(decided: shadcn `native-select` if available in the style, else Radix Select)*. |
| Chip (filter / choice) | custom on shadcn `toggle-group` | `filter` (multi, menu type + allergen), `choice` (single, gallery occasion, admin tabs alt) | default (surface + `border-input`), selected (`accent` bg, `primary-strong` 2 px border, check icon, `accent-fg` text), focus-visible, disabled | Height `component.chip.minHeight` 44 px. Horizontal scroll row on phones with visible edge fade; wraps on `md`+. Selection is not colour-only (check icon). Replaces the prototype's filled active chip. |
| Stepper (quantity) | custom (button + input) | default, compact (basket line) | default, at-min / at-max (that button `aria-disabled`), focus, error | 44×44 buttons, `inputmode=numeric`. Group `role="group"` with `aria-label` "Quantity"/"Quantité"; buttons labelled "Decrease"/"Diminuer", "Increase"/"Augmenter" (prototype used "-"/"+": fix). Announce new value via `aria-live=polite`. |

### Feedback

| Component | Source | Variants | States | Notes |
|---|---|---|---|---|
| Toast | shadcn `sonner` | success, info, error | enter, idle, exit | Non-blocking confirmations only ("Added to basket", "Status updated"). Bottom on phones, above any sticky bar. Never the only place an error appears. Errors persist until dismissed; success 4 s. `role=status`. |
| Alert (inline banner) | shadcn `alert` | info, success, warning, danger | — | Page- or section-level messages: "Not confirmed until we approve it" (FR-025), price changed (FR-015), blocked-date warning in manual order (FR-056), "this order changed, reload" (FR-054, with Reload button). Icon + title + one sentence + optional action. |
| Dialog | shadcn `dialog` (desktop) / `drawer` (phones) | confirm, form | open, submitting, error | Confirm destructive or irreversible actions: Cancel order, Decline, Deactivate admin. Focus moves to the dialog title, is trapped, and returns to the trigger. Destructive button is filled `danger` here only. |
| Sheet (bottom) | shadcn `drawer` (vaul) | default, full-height | open, dragging, closing | Phone-first replacement for side panels: filters, option picker in manual order, send quote, WhatsApp template picker, calendar day. Close button 44×44 top-right with label; Esc and swipe-down close. Title is `h2`. |
| Skeleton | shadcn `skeleton` | card, line, photo (square / 4:5), row | — | Same box sizes as the loaded content (CLS ≤ 0.1). `muted` fill, shimmer disabled under reduced motion. Shown after 300 ms only. |
| Spinner | custom (Lucide `loader-circle`) | inline 20 px | — | Only inside buttons and small refreshes. Never full page. |
| Page loader (customer) | custom (`components/shell/page-loader.tsx`, S-317) | shown (page change: at once, ≥ 450 ms; navigating submission: after 300 ms), hidden; reduced motion | — | Full-screen cream veil (#FBF3E8), the plain cream badge 176 / 200 px, a gold SVG whisk stirring in circles and a heart floating up (CSS only); fades 150 ms. `role="status"` "Loading…" while shown, visual layer `aria-hidden`, focus untouched. Full page loads before hydration: an inline nonce script. Admin keeps the thin top bar. |
| Empty state | domain | page, section, list | — | Short sentence in brand voice + one next action. E.g. empty basket: "Your basket is empty." / "Votre panier est vide." + "See the menu". No illustration beyond an optional thin gold hairline. |
| Error state | domain | page (404 / not found, 500), section (load failed) | — | Says what happened and what to do; offers Retry or a route home and the WhatsApp button. Tracking wrong token: "We can't find this order" + WhatsApp (FR-026). |
| Tooltip | shadcn `tooltip` | — | — | Desktop admin only, never holds essential info (touch has no hover). Phones use inline helper text instead. |

### Navigation

| Component | Source | Variants | States | Notes |
|---|---|---|---|---|
| Top bar (customer) | domain (header) | phone (< 1024 px), laptop (≥ 1024 px) | — | Burgundy `band` with a 1 px `gold` rule beneath; all 44 px targets; DOM order = visual order at each width; `theme-color` = `color.band`. **Phone:** EN/FR switch (small, cream, underlined) at the start, centred cream logo badge (`lib/brand`, 56 px, 48 px below 23rem; the home link "Aux petits bonheurs, home", named by its alt), basket icon with a light-gold count badge, then the Menu button (three lines) at the end; wraps in that order below 18rem (200% zoom). **Laptop (E-13 S-242):** logo at the start, the 7 site links centred (14 px, 16 px from xl, never wrapping; current = `aria-current` + 2 px light-gold underline), then language switch, account icon (only once E-11 ships) and basket at the end (reference `2026-11-12-burgundy-reference.jpg`). The language switch exists once per layout; the hidden one is `display: none`. |
| Language switch | custom link | inline (top bar), list (menu sheet, profile) | other language shown | Customer site: one `<a>` showing the other language's own name ("Français" / "English") with matching `lang` and `hreflang`, so its text is its accessible name (S-008 AC6: a spelled-out name is clearer than "EN / FR" and needs no extra label). Keeps the current route (FR-001). |
| Basket button + count | custom | — | empty (no badge), count 1–99, 99+ | Badge `primary` bg, `primary-fg` text, `small` bold. On add: `basket-bump` + `aria-live` "2 items in basket". Accessible name includes the count. |
| Site menu | native `<dialog>` (modal), full screen | — | closed, open | E-13 S-243 (decided 2026-11-12: full screen replaces the drawer). Phones and tablets only (< 1024 px). Burgundy `band` panel: `h2` "Menu" with a gold rule, Close icon button 44 px ("Close menu"), the 7 site links as Cormorant 24 px rows ≥ 48 px, 8 px apart, wrapping (never truncating); current = `aria-current` + light-gold underline. Modal: page inert and not scrolling, Tab wraps, Esc closes, focus returns to the Menu button; choosing another page focuses its `h1`. Short `motion.fast` fade, none under reduced motion. No JavaScript: the Menu button is a link to `/menu-links`. My account joins when E-11 ships. |
| Promo banner | domain | link, dismissible | live, dismissed (session) | Top of every page while live (FR-002). `accent` bg, `accent-fg` text, link in `primary-strong`, dismiss icon button 44×44 "Hide offer". No marquee or auto-rotate; one banner at a time (latest starting first) *(decided)*. |
| Footer | domain | — | — | Centred burgundy `band` under a 1 px `gold` rule: burgundy logo badge (112 px), `section-title` heading, contacts (cream links, light-gold hover), pickup line in `band-muted-fg`. WhatsApp, phone, email, Instagram (monochrome official glyphs), address with map link, FAQ, policies (FR-003). |
| Tabs | shadcn `tabs` | underline (admin Orders, Calendar month/week/day), segmented (Sales period) | default, selected (`primary-strong` text + 2 px underline), focus | Scrollable row on phones; count shown in label: "To review (3)". |
| Admin bottom bar | custom (nav) | — | default, active, with count dot | See *Admin one-handed patterns*. |
| Back link / page header | domain | customer, admin | — | Admin screens below the tabs get a 44 px back button + `h1` title; no breadcrumbs (flat IA) *(decided)*. |
| Pagination / load more | custom | "Show more" button | idle, loading, end | Admin lists and gallery only; no numbered pagination. Menu has no pagination (small catalogue). |

### Data display

| Component | Source | Variants | States | Notes |
|---|---|---|---|---|
| Card | shadcn `card` | default, interactive (whole card is one link) | default, hover (lift 2 px; none if reduced), focus-visible (ring on card) | `component.card.radius` (14 px), `component.card.padding`, `surface` + 1 px `border`, no shadow. Interactive cards contain a single link; no nested buttons. |
| Badge | shadcn `badge` | `status` (see Status badge), `sale` ("-20%"), `promo`, `soldout`, `allergen`, `count`, `neutral` | — | `small` 600 weight, `radius.full`, min height 24 px (not interactive). Sale: `primary` bg + `primary-fg`. Sold out: `fg` bg + `bg` text. Allergen: surface + `border-input` + icon. |
| Status badge (orders) | domain on Badge | one per status (Appendix B) | — | Outline style on `surface`: icon + word, coloured by group: **action needed** `warning` (Pending approval, Quote needed); **waiting on customer** `info` (Quote sent); **in progress** `success` (Approved, Preparing, Ready, Out for delivery); **done** `muted-fg` (Completed, Closed); **stopped** `danger` (Declined, Cancelled). Customer side uses the customer wording of the same status. |
| Price | domain | `default`, `from` ("from Rs 1,250" / "à partir de Rs 1 250"), `sale` (struck original in `muted-fg` + sale in `primary-strong`, both `price` style), `delta` (option "+Rs 150"), `total` (`h3` size) | loading (skeleton width of "Rs 0,000"), changed (Alert + highlight once) | Locale formatting from brand guide (FR narrow no-break space). Struck price carries visually hidden "was" / "au lieu de". Never wraps between "Rs" and the number (`white-space: nowrap`). |
| Product card | domain on Card | default, sale, sold out, seasonal | loading (skeleton), sold out | Square photo (`radius.sm`, 10 px, inset 8 px in the card), name (`h3`, Cormorant 600, max 2 lines then wrap, never ellipsis on phones), Price `from`/`sale`, badges top-left (sale/promo), "Sold out" badge bottom-centre; sold-out photo at 60% opacity (no grayscale on food) and card still opens the product page. 2 columns at 375 px, 3 at `md`, 4 at `lg`. |
| Photo / gallery carousel | custom on shadcn `carousel` (Embla) | product (4:5, 1–5 photos), lightbox (full screen) | loading (blur-up from `muted`), error (named placeholder block) | Swipe + visible prev/next buttons (44 px) + dots with "Photo 2 of 4". No autoplay. Explicit width/height, lazy below fold. Alt = product name by default (EN/FR). |
| Allergen list | domain | tags, with kitchen note | — | Icon + word per tag, plus the fixed "Our kitchen handles all allergens" note in `small` `muted-fg` (FR-007). |
| Status progress (tracking) | custom | delivery path, pickup path, quote path | current, done, upcoming, stopped (declined/cancelled replaces the bar with an Alert) | Ordered list `<ol>` with `aria-current="step"`; vertical on phones, horizontal on `md`+. Words always visible. |
| Order row (admin) | domain on Card | default, with action, compact (calendar day) | default, unpaid flag, overdue (> 24 h pending, `warning` icon) | Line 1: number + name + Status badge. Line 2: main items (2 lines max). Line 3: fulfilment chip (icon + word) · date · window · total · Paid/Unpaid. Whole row links to detail; optional one-tap next-status button below (separate target). |
| Fulfilment tag | domain on Badge | delivery (Lucide `truck`, `primary-strong`), pickup (Lucide `shopping-bag`, `info`) | — | Replaces the prototype's teal (not a token). Always icon + word; same coding in calendar. |
| Stat tile | domain on Card | count (Today), money (Sales) | loading, zero ("0" plus a hint, never blank) | Whole tile links to the filtered list. Number in `h2` with `tabular-nums`. |
| Activity log | domain | — | empty ("No activity yet") | `<ol>` of events: who, what, when ("Approved by Sarah, 12 Nov 14:05"). `small`. |
| Table | shadcn `table` | — | — | Desktop admin only (sales top products, customers). On phones the same data renders as a list of rows. |
| Avatar | — | *Later* | — | Not needed in MVP (team list uses initials text). |

### Forms

| Component | Source | Variants | States | Notes |
|---|---|---|---|---|
| Field (label + control + hint + error) | shadcn `form` pattern / `field` | text, choice group (`fieldset` + `legend`), with counter | default, focus, error, disabled | Order: Label → Hint → Control → Error. Error replaces nothing; it is added below with icon, `danger` text, and linked by `aria-describedby`; `aria-invalid` on the control. Real `<label for>` (prototype cloned `aria-label`: drop that). |
| Option picker | domain (from prototype `OptionPicker`) | `one` (Radio group rows), `several` (Checkbox rows), `text` (Input + counter), `quantity` (Stepper) | unselected, selected, required-missing (fieldset `danger` border + message "Choose a size" + scroll/focus to it), disabled choice (sold-out choice: struck label + "Sold out") | `<fieldset>`/`<legend>` with "(optional)" or "Pick one" hint. Price delta right-aligned per row. Used by Product page and Manual order (shared component). |
| Message-on-cake field | domain on Input | — | default, near limit (≥ 90%, `warning`), at limit (input blocks further chars, counter `danger`) | Live counter "12/40" announced politely only at 75%, 90% and limit (not every keystroke). Limit from option group (FR-008). |
| Date picker (availability) | custom on shadcn `calendar` (react-day-picker) | customer (rules applied), admin (warn-only) | available, selected (`primary` fill, `primary-fg`), unavailable (struck number, `muted-fg`, still focusable), today (ring outline), blocked/closed/too-soon | Inline month view, not a popover, on phones. Day cells 44×44. Tapping an unavailable day shows its reason under the calendar in an `aria-live` region: "Too soon: we need 3 days' notice", "Closed on Sundays", "Not available" (never the private reason, never "Fully booked", FR-014). Shows "Earliest date: Fri 13 Dec" above. Week starts Monday (Mauritius). Admin variant allows any day and shows a `warning` Alert (FR-056). |
| Time window picker | domain on Radio group (card rows) | — | default, selected, unavailable | "Morning · 9:00–12:00" from Settings (FR-020). Windows use 24 h in both locales for clarity *(decided; deviates from the brand guide's EN 12 h rule, applies to windows only)*. |
| Photo uploader | custom (`<input type=file accept>` + list) | customer (≤ 5, custom request), admin product (1–5, reorderable), admin gallery (multi) | empty, picking, shrinking/uploading (per-photo progress), uploaded, error (wrong type / too big, per photo, with Remove), max reached (add button disabled + reason) | Large 44 px+ "Add photos" button opening the camera roll; thumbnails 72 px square with Remove (44 px target) and, for admin, Move up/down buttons (drag is a bonus, not the only way). |
| Address fields | domain | delivery | — | Address (textarea, `autocomplete=street-address`), landmark note, area. Saved-address radio list for signed-in customers (FR-021, FR-035). |
| Policy acceptance | domain on Checkbox | — | unchecked (Send blocked with reason), checked | Label links to policies (opens in sheet, not new tab). |
| Search field | shadcn `input` type search | admin orders, customers | idle, typing (debounced), results, no results | Leading search icon, clear button 44 px. |

### Domain components (customer)

| Component | Source | States / rules |
|---|---|---|
| Hero | domain | Centred: `tagline`, `display` headline, a 64 px `gold` rule, `muted-fg` paragraph, then photo 3:2 (radius 16 px) below; buttons: "Order now" (`primary`), "Custom cake" (`secondary`). The only screen with two prominent actions; secondary is visually lighter. |
| Promotion card | domain on Card | Image, title, one line, link. Live only; hidden outside window (FR-004, FR-016). |
| How it works | domain | 3 numbered steps, `<ol>`, icon + `h3` + one line. |
| Product page layout | domain | Carousel → name (`h1`) → Price (live) → description → Allergen list → Option picker → Message-on-cake → Quantity → "Earliest date" → **sticky Add to basket bar** (price + button). States: sold out (bar shows "Sold out this week" + WhatsApp button instead of Add; options hidden), hidden/out of season (404-style "No longer available" + link to menu), required missing (button enabled; on tap scrolls and focuses the first missing group with error, rather than a silent disabled button) *(decided: discoverable error beats disabled)*. |
| Basket line | domain | Photo 56 px, name, chosen options (small, wrap), message on cake, Stepper compact, line Price, Remove (ghost, 44 px). States: unavailable since added (`warning` Alert in line + Remove), price changed (Price shows new value + note). |
| Checkout (one page) | domain | Sections as numbered `h2`s: 1 Basket, 2 Delivery or pickup, 3 Date, 4 Time, 5 Your details, 6 Summary. **Sticky bar**: total + "Place order" / "Commander". On tap with errors: Alert at top listing problems as links to fields, focus moves to it. Submitting: button loading + disabled (idempotent, FR-023). Refused at submit: Alert with the new price or date problem, nothing lost (FR-015). |
| Order summary | domain | Items, delivery fee line (or "Pickup: free"), total (`price` / total), payment info (Juice number or cash). Reused on checkout, confirmation, tracking, emails. |
| Confirmation | domain | `order-confirmed` motion; order number large and copyable; `info` Alert "Not confirmed until we approve it"; tracking link with Copy and Share; "Save my details" card for guests (FR-038). |
| Tracking page | domain | Status progress, Order summary, bakery message (quote note), quote block (amount, expiry, Accept `primary` / Decline `secondary`; expired: Alert, buttons removed), Cancel (`destructive` outline, only while allowed, confirm dialog), WhatsApp button. Not found state. |
| Custom request form | domain | Same Field patterns; Photo uploader; Date picker with same rules; prefilled photo when coming from gallery. Success: confirmation pattern. |
| Gallery grid | domain | 3 columns at 375 px (square), occasion Chips, lightbox carousel, "Request something similar" button in lightbox. Empty per filter: "No photos for this occasion yet." |
| WhatsApp button | domain on Button | `secondary` with official glyph (monochrome) + "WhatsApp us" / "Écrivez-nous sur WhatsApp". Opens `wa.me` link. |
| Account screens | domain | Sign in (password or email link as two tabs), reset, profile, addresses, My orders (Order rows, customer variant), Reorder result Alert listing skipped items (FR-037). |

### Domain components (admin)

| Component | Source | States / rules |
|---|---|---|
| Today dashboard | domain | 3 Stat tiles (To review, Quotes to send, Unpaid) → "Today" and "Tomorrow" sections of Order rows with one-tap next-status button. Empty: "No orders today." Next-status tap: button loading → toast "Marked Ready" with **Undo** (calls Back one step, 6 s) *(decided: undo instead of a confirm dialog for forward steps)*. |
| Order detail | domain | Header (number, Status badge, Paid tag), customer block with Call / WhatsApp / Open in Maps (44 px, `secondary`), items, reference photos, private note (Textarea, autosave with "Saved" status), Activity log. **Sticky action bar** (see below). Conflict state: Alert "This order changed. Reload" (FR-054). |
| Action bar actions | domain | Primary = the next valid step for the status (Approve / Send quote / Start preparing / Ready / Out for delivery / Complete). Secondary actions in a "More actions" bottom sheet: Decline, Back one step, Mark paid/unpaid, Edit, Cancel, WhatsApp template. Destructive ones confirm in a Dialog with optional reason. |
| Send quote sheet | domain on Sheet | Amount (numeric keyboard, Rs prefix), note, expiry (defaults today + validity), preview of customer text; primary "Send quote". |
| WhatsApp template picker | domain on Sheet | Template list (radio rows), editable message preview (Textarea, placeholders resolved), "Open WhatsApp". |
| Manual order | domain | Product search + Option picker sheet, free-text item (name + price), customer lookup by phone/email (shows "Existing customer: …" match), date picker admin variant, fee editable, paid switch. Sticky bar: total + "Save order". |
| Calendar | domain | Month grid: day cells 44 px min with count; delivery/pickup counts shown as two tiny icon+number pairs on `md`+, single total on phones; blocked days `muted` with lock icon; today ringed. Week/day as lists of Order rows. Day sheet: orders, Block/Unblock (confirm lists existing orders, FR-059), "Prep list". |
| Prep list | domain | Grouped list (product → size/flavour → quantity, messages on cakes in quotes). Print stylesheet (black on white, no chrome) and Share. |
| Menu manager | domain | Rows by type with photo, name, price, status tags (Hidden, Sold out, Seasonal). Reorder via Move up/down buttons plus drag handle (dnd with keyboard support). Row actions in sheet: Edit, Duplicate, Hide, Sold out. |
| Product editor | domain | Sectioned long form: Photos, Names and descriptions (EN and FR side by side on `md`+, stacked with language tag on phones), Price and notice, Allergens (Chips), Category, Option groups (repeatable cards with choices, price delta, required, limits), Seasonal dates. Sticky bar: "Preview" (`secondary`) + "Save" (`primary`). Missing FR text shows `warning` hint "French missing, English will show". |
| Promotion editor / list | domain | List rows with status badge (Scheduled `info`, Live `success`, Ended `muted-fg`, Inactive `muted-fg`); editor with EN/FR fields, date-time range, placement radios, discount table per product. |
| Sales summary | domain | Period tabs, Stat tiles, top 5 list, source breakdown, unpaid list; "Export CSV" `secondary`. Zero state per tile. |
| Team / Customers / Settings / Availability | domain | Lists of rows + editors following Form patterns. Owner-only screens are absent from More for Admins; a typed URL shows an "Owner only" empty state with a back link. |

## Patterns

- **Forms:** label above, hint under label, error under control. Validate on blur for format (email, phone), on submit for required; once a field has errored, re-validate on change. On submit with errors: summary Alert at top (links to each field), focus moved to it. Keyboards: `tel` for phone (+230 prefilled hint, not value), `email`, `numeric` for prices and quantities. `autocomplete` on every personal field. Spam protection is invisible (no puzzles).
- **Empty states:** one sentence in brand voice + one next action; never a blank area. Filters with no results say which filters to clear and offer "Clear filters".
- **Loading:** server-rendered first paint; skeletons for client-fetched sections after 300 ms with exact box sizes; button spinners for actions; > 1 s uploads show per-item progress. Never a full-page spinner.
- **Errors:** field → inline; action → Alert in context (persists) plus optional toast; page → Error state with Retry, home link and WhatsApp. Messages follow the brand pattern: what happened + what to do + no blame ("We need 3 days' notice for this cake. The earliest date is Fri 13 Dec.").
- **Commerce states (customer):**
  - *Sale price:* struck original (`muted-fg`) + sale (`primary-strong`) + Sale badge on card; product page also shows promo name and end date ("Offer ends Sun 15 Dec").
  - *Sold out:* label on card, card still links; product page replaces Add with "Sold out this week" + WhatsApp; Reorder skips with note.
  - *Unavailable date / too soon / closed:* struck day in picker + reason on tap.
  - *Price changed at submit:* Alert shows old → new, button becomes "Place order at Rs X".
- **Navigation:** customer = sticky top bar + menu drawer + footer; admin = small top header (title, role) + bottom bar; flat hierarchy, back button on detail screens.
- **Sticky action bar (shared):** fixed to bottom above safe area (`env(safe-area-inset-bottom)`), `surface` bg, `shadow.md`, padding `space.3`/`space.4`; holds context (price or total, left, `price` style) + one primary button (right, `lg`, min 50% width). Page content gets bottom padding equal to bar height so nothing hides behind it. Hides when the on-screen keyboard is open *(decided)* to keep the focused field visible.
- **Bilingual content:** every component takes already-translated strings; no string concatenation (use ICU messages with placeholders for "from {price}", "{count} items"). `lang` on `<html>`, and on inline fragments in the other language (language switch labels).

### EN/FR text length

- Design every label for **FR +30%** (short labels can grow more: "Menu" → "Carte", "Basket" → "Panier" fine; "Add to basket" 13 → "Ajouter au panier" 17; "Place order" 11 → "Passer la commande" 18 if the copy changes from "Commander").
- Buttons: `min-height` 44, `height: auto`, text wraps to 2 lines, never ellipsis. Sticky-bar button takes remaining width.
- Chips and tabs: horizontal scroll on phones; never shrink font to fit.
- Prices and dates: `nowrap` units; FR dates are longer ("sam. 14 déc." vs "Sat 14 Dec") — date blocks reserve the FR width.
- Bottom bar labels max ~10 characters in both languages: Today/Aujourd'hui (11, allowed at `small` 14 px in a 75 px column at 375 px), Orders/Commandes, Calendar/Calendrier, Menu/Carte, More/Plus. Test at 320 px: labels may wrap to 2 lines under the icon; never truncate *(admin UI is EN-first at launch but follows the admin's language setting, FR-046)*.
- Test every screen with the FR locale and with a pseudo-locale (+40%) before DD-REVIEW.

### Admin one-handed patterns

- **Bottom bar** (FR-047): five items Today · Orders · Calendar · Menu · More, each icon (24 px) + label, column min height 56 px, full-width tap columns; active = `primary-strong` icon and label + 2 px top indicator + `aria-current="page"`; inactive `muted-fg`. Count dot on Orders when To review > 0 (with accessible text "3 to review"). `<nav aria-label="Admin">`. Hidden when a full-screen sheet or the keyboard is open.
- **Sticky action bar** on Order detail, Manual order, Product editor, Promotion editor: sits directly above the bottom bar (bar stacks; total bottom chrome ≤ 128 px at 375×667). One primary (the next valid step), one "More actions" icon button (44 px) opening a bottom sheet.
- **Thumb zone:** primary actions and frequent toggles in the bottom third; top of screen holds only title, back and read-only status. Never put a destructive action next to the primary in the bar.
- **One-tap next status** with Undo toast rather than confirm dialogs for forward moves; confirm dialogs only for Decline, Cancel, Deactivate, Block day with existing orders.
- **Bottom sheets** for every secondary flow (filters, quote, template, day), swipe-down to close, max 90% height, content scrolls inside.
- **Lists:** rows ≥ 64 px, whole row is the link; pull-to-refresh is not relied on (explicit "Refresh" in header overflow); search field sticky under the tabs.
- **Installed app (PWA):** respects safe areas top and bottom; standalone display; no browser-only gestures relied on.

## Accessibility rules

- Contrast: text ≥ 4.5:1, large text and UI ≥ 3:1, in light and dark (verified pairs in `tokens.json $extensions.contrast`). `color.primary` never on `accent`/`muted`; `color.decorative` never text.
- Visible focus: `color.ring` 2 px (`size.focus-ring-width`), offset 2 px (`size.focus-ring-offset`), on every interactive element, `:focus-visible` only; never removed.
- Targets: 44×44 px minimum (`size.tap-target`), 8 px between adjacent targets in bars and rows.
- Semantics: `<button>` for actions, `<a>` for navigation (language switch, cards, tabs that change route); one `<h1>` per page; landmarks `header`, `nav`, `main`, `footer`; `fieldset/legend` for option groups and radio sets.
- Dialogs, sheets and drawers trap focus, close on Esc, restore focus to the trigger, and have a labelled title.
- Live regions: basket count, price updates on option change (polite, debounced), date-unavailable reason, form error summary (assertive via focus), toasts (`role=status`).
- Never colour alone: status, fulfilment, availability, selected chips and errors all carry an icon and/or word.
- Motion: everything honours `prefers-reduced-motion`; no autoplay; nothing essential conveyed by motion.
- Text resize to 200% and 320 px width without horizontal scroll or clipped actions.
- Images: alt from the product/photo name in the current locale; decorative motifs `alt=""`.
- Checkout fully keyboard-operable (NFR-002), including the date picker (arrow keys move by day, PageUp/Down by month, unavailable days focusable and announced with reason).
- `lang` set per page and on other-language fragments.

## Adding a component

1. Check this document first: a new **variant** of an existing component (new prop value) is preferred over a new component. Variants are added when the need is the same purpose with a different emphasis or content.
2. A new component is justified only when no existing component fits the purpose, it is needed by at least one spec/story, and it cannot be composed from existing primitives on the page.
3. Propose to `design-director` with: the need (spec/FR link), why existing components fail, variants, all states (incl. loading, empty, error, disabled and any commerce state), token usage, a11y behaviour, EN/FR length check, and the shadcn/Radix source.
4. Once approved, add it to the tables above and the Changelog in the same change as the code. Components never introduce raw colours, sizes or fonts; a missing token is requested through `/design-tokens`.
5. One-off styles that bypass the system are recorded here with the reason, or they are rejected at review.

## Open items (for owner or later passes)

- Identity v0.3 is chosen with the logo badges (SVG in `src/public/brand/`). The custom-cake band and "Notre collection" grid exist in the prototype; the real site gets them with the home page story (menu listing on the home page is not built yet).
- Status soft-tint backgrounds deferred (see Foundations).
- 24 h time windows in EN deviates from the brand guide's "2:30 pm" rule; `content-lead` to confirm.
- UX flows and feature specs do not exist yet; re-run `/design-system update` when `docs/design/ux/` and `docs/specs/features/` land.

## Changelog

- 2026-11-12 v0.3.1 (E-13 S-242..S-244): Top bar gets the laptop layout (logo, 7 links, language, account, basket) and the phone Menu button; Site menu becomes a full-screen modal dialog; Our collection cards (photo 4:3, name link stretched over the card with the ring on the card, "from Rs X", Sold out with icon, "Choose options") and type chips as in-page anchors.
- 2026-11-12 v0.3: rebrand to burgundy (Cherry Tart #660C0C), cream (Crème brûlée) and antique gold #BA8430 from the Owner's references, with the logo badges (SVG, outlined script) replacing the text wordmark. New colour roles `band`, `band-fg`, `band-muted-fg`, `band-gold`, `gold`; `band`, `section-title`, `section-title-start` utilities; burgundy header and footer bands; Cormorant Garamond 500/600 replaces Libre Caslon; dark theme "cellar"; admin keeps the palette without bands or gold lines.
- 2026-11-10 v0.2: rebrand to D4 Honey & cream (Owner feedback: v0.1 too pink). Honey/cream/ink colour roles plus `link-hover`; Libre Caslon Display/Text + Source Sans 3; buttons 12 px radius, 48 px tall; cards 14 px with 1 px border; bands 16 px; flat elevation; header = language link, centred wordmark, basket; centred footer.
- 2026-11-10 v0.1: initial inventory and specification from PRD, build brief, tokens and prototype `apb-v1` (automation mode; decisions marked *(decided)*).
