<!-- Template: feature-spec | Filled by: product-manager | Output: docs/specs/features/admin-menu-content.md -->
# Feature Spec: Admin menu, gallery, promotions, availability and settings

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 · Epic: E-TBD (admin content; assigned by /create-epics)

## Summary
Sabera and Sarah keep the shop's content current from a phone with no developer: menu and product editor (EN/FR, photos, option groups), gallery, promotions that start and end by themselves, and (Owner only) Availability and Settings that drive the customer site, emails and WhatsApp messages. Everything is live on the customer site without a deploy.

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-061 | Menu list by type, drag reorder, create, edit, duplicate, hide, sold out | UX Menu list, API `admin/menu`, AC1-AC6 |
| FR-062 | Product editor: EN/FR, 1-5 photos, price, notice, allergens, category, option groups, seasonal, preview | UX Product editor, API `admin/product`, AC7-AC17 |
| FR-029, NFR-001, NFR-009 | Image types, client-side shrinking, size caps | Photos rules, AC10-AC11 |
| FR-063 | Promotions list/status/editor/discounted products/end early | UX Promotions, API `admin/promotion(s)`, AC18-AC24 |
| FR-064 | Gallery multi-upload, tag, caption EN/FR, reorder, delete | UX Gallery, API `admin/gallery`, AC25-AC29 |
| FR-066 | Availability (Owner): notice, closed days, windows, blocked ranges + reasons | UX Availability, API `admin/availability`, AC30-AC34 |
| FR-067 | Settings (Owner): fee, address, contacts, Juice, texts, templates, quote validity | UX Settings, API `admin/settings`, AC35-AC41 |
| FR-005, FR-006, FR-013, FR-016, FR-017, FR-073, FR-003, FR-010 | Consumers of this content | Edge cases |
| FR-041, FR-008, FR-020, FR-030 | Role split; message limit; windows; quote validity | Permissions, Settings rules |
| NFR-002, NFR-007 | A11y; EN/FR with EN fallback | Non-functional |

## UX
Components: Menu manager, Product editor, Promotion editor/list, Sticky action bar, Sheet, Dialog, Option picker (design-system.md).

### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| Menu list | `/admin/menu` | Row skeletons by type | Type with none: "No cakes yet." + "Add product" | Alert + Retry | Toast on status/duplicate; reorder autosaves, "Saved" status |
| Product editor | `/admin/menu/new`, `/admin/menu/:id` | Form skeleton | n/a (new = blank form) | Summary Alert, focus to first error; upload failure per-photo with Retry | Toast "Saved"; stays on page; "Preview" opens customer view |
| Preview as customer | `/admin/menu/:id/preview` | Customer skeleton | n/a | "Cannot preview, save first" | Banner "Preview, not live" |
| Gallery | `/admin/gallery` | Grid skeleton | "No photos yet." + "Upload photos" | Per-file error chip + Retry | Photos appear as each upload finishes |
| Promotions list | `/admin/promotions` | Row skeletons | "No promotions yet." + "New promotion" | Alert + Retry | Toast "Promotion saved" |
| Promotion editor | `/admin/promotions/new`, `/:id` | Form skeleton | Discounted products: "None, banner/card only" | Summary Alert | Toast, returns to list |
| Availability (Owner) | `/admin/availability` | Skeleton | No blocks: "No blocked dates." | Alert; `SETTINGS_CHANGED`: "Someone changed this. Reload." | Toast "Saved" |
| Settings (Owner) | `/admin/settings` | Skeleton | n/a | as above | Toast "Saved" |
| Admin on Owner screen | typed URL | | | "Owner only" state with back link (403) | |

### Menu list
- Rows grouped by type (Cakes, Cupcake boxes, Desserts, Seasonal): photo, name, from-price, tags (Hidden, Sold out, Seasonal, Scheduled seasonal). Reorder by drag handle (keyboard dnd) **and** Move up/down buttons, within a type; order persists and drives the customer grid. Row sheet: Edit, Duplicate, Hide/Show, Mark sold out/available, Delete (confirm; recommends Hide).
- **Duplicate** copies fields, option groups, choices and photos; name gets " (copy)" / " (copie)", slug regenerated, status `hidden`; opens the copy in the editor.
- Status changes apply to the customer site at once (sold out = card label + not addable; hidden = absent, URL 404, FR-005).

### Product editor (sections, order)
1. **Photos:** 1-5 from camera roll/camera; first = main/card image; drag + up/down to reorder; remove. Client-side: HEIC/JPEG/PNG/WebP accepted (max 10 MB source), resized to <= 1600 px long edge and re-encoded WebP/JPEG to <= 300 kB (target; hard cap 1 MB, UPLOAD_REJECTED above); per-photo progress when > 1 s; uploaded via signed URLs, bucket `public-images`. Alt text = product name (no field).
2. **Names and descriptions:** EN required, FR optional; side by side on `md`+, stacked with language tag on phones; missing FR shows hint "French missing, English will show".
3. **Price and notice:** base price (Rs, integer >= 0); notice days 0-60 or blank = "Use default (N)" showing the current Settings default.
4. **Allergens:** chips from tag list (eggless, nut_free, ...); the kitchen-handles-all-allergens note is site-wide (FR-007), not per product.
5. **Category** (free label, suggestions from existing) and **type** (cake, cupcake_box, dessert, seasonal).
6. **Option groups:** repeatable cards: name EN/FR, kind (pick one, pick several, text, quantity), required, limits (text max length, default Settings message max = 40; quantity min/max), choices with name EN/FR and price change (integer, may be 0 or negative). Quick-add buttons "+ Size", "+ Flavour", "+ Add-ons", "+ Message" prefill sensible kinds. Reorder groups and choices. Max 10 groups, 30 choices per group (assumption).
7. **Seasonal dates:** optional start/end (inclusive, MU); both or neither; end >= start. Out of window = not shown/orderable (FR-006).
8. **Status:** available / sold out / hidden. A product with no photo cannot be set available (hidden allowed).
- Sticky bar: Preview (secondary) + Save (primary). Unsaved-changes guard on leave. Goal: a new cake with sizes, flavours, add-ons, message creatable in under 5 minutes on a phone (FR-062).
- **Preview as customer:** opens the real customer product page (EN/FR toggle) rendered from the saved draft, including hidden/out-of-season products, behind the admin session, with a "Preview" banner; cannot add to basket.

### Gallery
Multi-select upload (<= 20 per batch, same compression as above), occasion tag per photo (list from existing + free add: birthday, wedding, baby shower, ...), optional caption EN/FR, drag/arrow reorder, delete with confirm. Photos appear on `/gallery` and the home preview (first 6 by order).

### Promotions
- List rows: title, dates (MU), placement, status badge: Scheduled (info), Live (success), Ended, Inactive (inactive = active switch off, takes precedence over dates). Status is computed from now (FR-016), no job.
- Editor: title and text EN/FR (EN required), optional image (compressed), start/end date+time (MU, end > start), placement banner/card/both, link (none, product, category, custom form), active switch ("End early" = off), discounted products table: product, kind (percent 1-99 or fixed sale price), value; shows resulting price per product. Discount applies to base price only, never options or delivery; lowest price wins, no stacking (FR-016, FR-017); editor shows note when a selected product is already in another live/scheduled promotion with the lowest-wins reminder.
- Delete only for Scheduled/Ended/Inactive (confirm); orders keep their promotion snapshot.

### Availability (Owner)
Default notice days (0-60, default 3), closed weekdays (default Sunday), delivery windows and pickup windows (each: label EN/FR, start, end; default Morning 9-12, Afternoon 12-17, Evening 17-20; delivery and pickup may differ; at least one window each; no overlaps), blocked dates/ranges with private reason (add, list, remove). Adding a block shows existing orders in its range as a warning (FR-059); existing orders unaffected. Window ids are stable so existing orders keep their snapshot.

### Pages (Owner and Admin; E-13 S-245..S-247, FR-078)
More > Pages lists Our story, Workshops, Gallery, Contact us and Custom order (row >= 64 px, "Sample text" badge while the page still holds the seeded placeholder, last edit and who). `/admin/pages/:key` edits that page's text fields in English and French (Introduction <= 300, other fields <= 10,000 characters per language; plain text only, a blank line starts a paragraph; French left empty shows "English will show in French") with one versioned Save (`PAGE_CHANGED` when another admin saved first: typed text stays until Reload is chosen) and the leave prompt. Our story (4), Workshops (6) and Custom order (3) take photos with the S-047 rules (browser compression to WebP <= 1600 px / 300 kB, HEIC, signed upload under `site/pages/<key>/`, Retry per photo, server re-check of path and bytes), an English description required per photo, Move up / Move down, Remove with an inline confirm. Workshop dates, seats and photos are edited in Admin → Workshops (E-15); the old "Next workshop" block was removed (tidy, 2026-11-14). Contact tells Owners that WhatsApp, phone, address and map link are in Settings (link) and Admins the same in words. Gallery photos stay in Gallery. The editor is its own route chunk (product editor JS budget). Contract: `admin/pages`, `admin/page-editor` (contracts.md v0.34).

### Settings (Owner)
Delivery fee (Rs, default 200), pickup address and map link, contact phone/WhatsApp/email, Juice number, Instagram, homepage hero tagline+image and featured products (<= 6), About, FAQ, policies (must keep cancellation and storage entries, FR-010, shown as required-section hint), privacy note, WhatsApp templates (6: approved, ready, on_the_way, payment_instructions, payment_reminder, blank; EN and FR each; placeholders {name} {order_number} {date} {window} {total} {juice_name} {juice_number} {deadline} {pickup_address} {tracking_link}; unknown placeholder rejected; live preview with sample data), quote validity days (default 5), cake message max (default 40), evening reminder time (18:00), order number prefix (APB-, change affects new orders only). All EN/FR where relevant. Single Save with a version check.

### Copy
i18n keys `admin.menu.*`, `admin.gallery.*`, `admin.promo.*`, `admin.availability.*`, `admin.settings.*`; defaults and wording by copywriter; EN-first admin UI follows the admin locale (FR-046).

## API Contract
Reuses `docs/architecture/api/contracts.md` "Admin app": `admin/menu`, `admin/product`, `admin/promotions`, `admin/promotion`, `admin/gallery`, `admin/availability` (owner), `admin/settings` (owner), `requestUploadUrls`, `ProductInput`, error codes `VALIDATION_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `UPLOAD_REJECTED`, `SETTINGS_CHANGED`. Validation rules on top of those schemas:
| Operation | Rule | Errors |
|---|---|---|
| `save` product | slug unique, `[a-z0-9-]`, auto from EN name; 1-5 photos unless hidden; seasonal pair valid; group/choice limits; text group max <= 200; price delta int within +/-100000; at least one choice for single/multiple | `VALIDATION_FAILED` + fields; `409` slug taken (by a product or in slug history) as `fields.slug`; a changed slug stores the old one in `product_slug_history` |
| `reorder` | ids are exactly the products of that type | `VALIDATION_FAILED` |
| `setStatus` | available needs >= 1 photo | `VALIDATION_FAILED` |
| `delete` product | allowed; order items keep snapshot | `NOT_FOUND` |
| promotion `save` | end > start (MU); discounts unique per product; percent 1-99; sale price < base price (warning, not error) | `VALIDATION_FAILED` |
| gallery `addPhotos` | <= 20; occasion <= 40 chars | `UPLOAD_REJECTED` |
| availability `saveRules` | windows non-overlapping, start < end, ids kept; closed weekdays not all 7 | `VALIDATION_FAILED`, `SETTINGS_CHANGED` |
| settings `save` | URL, phone, email formats; template placeholders from allowed list; fee 0-100000; quote validity 1-60 | `VALIDATION_FAILED`, `SETTINGS_CHANGED` |
Owner routes called by an Admin: `FORBIDDEN` (loader and action).

### Open contract changes (applied 2026-11-10)
1. `admin/product` `previewUrl`: define as `/admin/menu/:id/preview` served by a customer-product view gated by admin session, including hidden and out-of-season products (the public loader 404s them). — **Resolved in contracts.md (2026-11-10).**
2. `duplicate` must copy photo objects in Storage server-side (new paths) and return the new id. — **Resolved in contracts.md (2026-11-10).**
3. `SettingsInput` and `AvailabilityInput` zod shapes are not defined in contracts.md; add them (fields in Settings above, incl. `heroTagline`, `heroImagePath`, `featuredProductIds`, `whatsappTemplates`, `quoteValidityDays`, `cakeMessageMax`, `eveningReminderAt`, `orderNumberPrefix`). — **Resolved in contracts.md (2026-11-10).**
4. `admin/gallery` loader add `occasions: string[]` (distinct tags) and `caption: Localized | null` as `{en, fr}`; `update` accepts `caption: {en, fr}`. — **Resolved in contracts.md (2026-11-10).**
5. `admin/promotions` list add `hasDiscounts: boolean`, `productCount`; `admin/product` loader add `settingsDefaults: { noticeDays, cakeMessageMax }`. — **Resolved in contracts.md (2026-11-10).**
6. Availability `addBlock` / Settings: `existingOrders` already returned; add the same on `saveRules` when closed weekdays change (count of active orders on newly closed weekdays). — **Resolved in contracts.md (2026-11-10).**
7. Upload constraint text: contracts say max 1 MB; NFR-001/NFR-009 say <= 250-300 kB. This spec: client target 300 kB, server hard cap 1 MB. Confirm. — **Resolved in contracts.md (2026-11-10).** Client target 300 kB, server cap 1 MB; PRD NFR-001 and project.yaml aligned to 300 kB.

## Data Model Changes
None required. Uses `product`, `product_photo` (sort_order 0..4, unique), `option_group`, `option_choice`, `promotion`, `promotion_product`, `gallery_photo`, `blocked_date`, `settings` (versioned). Suggested additions only if the owner wants them: none now. Product `sort_order` is per type. Slug history is kept in `product_slug_history` (owner Q19, 2026-11-10); the old URL redirects (301) to the new one.

## Permissions matrix
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| Menu, product editor, preview, duplicate, hide, sold out, delete | no | no | yes | yes |
| Gallery manage | no | no | yes | yes |
| Promotions create/edit/end early/delete | no | no | yes | yes |
| Availability (rules, windows, ranges) | no | no | no | yes |
| Settings | no | no | no | yes |
| Pages (brand page text and photos) | no | no | yes | yes |
Admins: Owner screens absent from More and refused by URL (FR-041).

## Analytics Events
No third-party analytics. Structured logs, no PII: `product_saved` (id, isNew), `product_duplicated`, `product_status_changed` (status), `promotion_saved` (id, placement, discountedCount), `gallery_uploaded` (count), `availability_saved`, `settings_saved` (changed keys only, never values for contact data), each with actorRole.

## Edge Cases
- Product removed while in a basket or on a live promotion: promotion_product cascades; order items keep snapshots; basket line shows `PRODUCT_UNAVAILABLE`.
- Hiding or selling out a featured product: it drops from the home featured list; Settings list shows it flagged "hidden".
- Sold out product still reachable by URL, not addable. Hidden = 404.
- Photo upload fails mid-way: saved product keeps previous photos; failed file retryable; non-image or > 10 MB source rejected before compression with a plain message; HEIC conversion failure falls back to error with "try a JPEG".
- Two admins edit the same product: last write wins (accepted, data-model.md); editor shows "Updated by X at HH:MM" on load only.
- Settings/availability concurrent edit: `SETTINGS_CHANGED`, reload, changes not merged.
- Promotion overlaps / same product in two promotions: lowest price wins; shown as warning.
- Promotion start in past: allowed (goes live immediately); end before now: allowed, saved as Ended.
- Promotion ends at 18:00 MU: sale price at 17:59, base price at 18:00 (FR-016).
- Changing a default (notice days, fee, windows) never alters existing orders (FR-012); removing a window used by existing orders keeps the order snapshot.
- Closing a weekday that has orders: warn with count; orders unaffected.
- Notice days blank = default; changing default affects all products with blank.
- Reordering with an unsaved concurrent insert: ids mismatch -> reload message.
- Large inputs: description <= 2000, names <= 120, caption <= 200, FAQ/policy fields <= 10,000 chars.
- Negative price delta that would push a line below Rs 0: allowed at product level, line total checked >= 0 at order time (data-model); editor warns when base + most negative delta < 0.
- Bilingual: FR empty everywhere falls back to EN on the site (NFR-007).

## Acceptance Criteria
- AC1 (FR-061): Given the Cakes group, when the admin drags a product up (or taps Move up) and releases, then the customer menu shows that order after the next request and it survives reload.
- AC2 (FR-061): Given a product marked sold out, when a customer views the menu, then the card shows "Sold out" and Add to basket is blocked server-side.
- AC3 (FR-061): Given a product set to hidden, when a customer opens its URL, then 404 and the product is absent from the grid.
- AC4 (FR-061): Given Duplicate on a cake with 3 groups and 3 photos, when confirmed, then a hidden copy with identical groups/choices/price and its own photo files opens in the editor.
- AC5 (FR-061): Given keyboard only, when reordering with the handle, then arrow keys move the item and a live region announces the new position.
- AC6 (FR-061): Given Delete on a product present in past orders, when confirmed, then the product is removed and past orders still show its name and prices.
- AC7 (FR-062): Given a new cake with 2 sizes, 3 flavours, add-ons and a message field, when saved on a 375 px phone, then it is created and creatable in under 5 minutes in the usability test.
- AC8 (FR-062): Given EN name only, when saved and viewed in FR, then the EN text shows.
- AC9 (FR-062): Given a required option group with no choices, when saving, then `VALIDATION_FAILED` highlights the group.
- AC10 (FR-029, NFR-001): Given an 8 MB HEIC photo, when added, then it is converted and compressed in the browser to <= 1600 px and <= 300 kB before upload and stored.
- AC11 (FR-029): Given a PDF or a source file over 10 MB, when added, then it is rejected before upload with a message; a forged upload > 1 MB is refused by the server (`UPLOAD_REJECTED`).
- AC12 (FR-062): Given 5 photos, when adding a sixth, then the control is disabled; given reorder, then the first photo becomes the card image.
- AC13 (FR-062, FR-006): Given seasonal dates 1-24 Dec, when viewed 24 Dec and 25 Dec MU, then orderable on the 24th and not the 25th.
- AC14b (Q19): Given a published product whose slug changes from `a` to `b`, when `/menu/a` is requested, then it answers 301 to `/menu/b`; a slug in history cannot be reused by another product (`409`).
- AC14 (FR-062): Given seasonal start after end, when saving, then `VALIDATION_FAILED` on the dates.
- AC15 (FR-062, FR-008): Given a text group with max 25, when a customer enters 26 characters, then rejected client and server side; blank max uses the Settings value.
- AC16 (FR-062): Given a choice with price change Rs 0, when saved, then accepted; the customer price equals base.
- AC17 (FR-062): Given Preview on a hidden unsaved-then-saved product, then the customer page renders with "Preview" banner and no Add to basket.
- AC18 (FR-063): Given a promotion starting tomorrow 09:00, when listed, then status Scheduled; at 09:00 MU it is Live with no admin action.
- AC19 (FR-063, FR-016): Given a promotion ending 18:00, when a customer orders at 17:59 and at 18:00, then sale price then base price.
- AC20 (FR-063): Given the active switch turned off on a live promotion, then it is Inactive and the banner/card/discount vanish at once.
- AC21 (FR-017): Given two live promotions on one product (15% and Rs 400 sale price), then the lower price applies and no stacking.
- AC22 (FR-063): Given end <= start, when saving, then `VALIDATION_FAILED`.
- AC23 (FR-063): Given placement banner, link product X, with 15% on X, then the banner links to X and X shows the struck price.
- AC24 (FR-063): Given a non-image image upload, then rejected.
- AC25 (FR-064): Given 5 photos selected, when uploaded, then all 5 appear, each compressed; one failure does not cancel the others.
- AC26 (FR-064): Given a photo tagged "Wedding", when a customer filters Wedding on the gallery, then it appears.
- AC27 (FR-064): Given reorder, then the gallery order and home preview follow it.
- AC28 (FR-064): Given Delete confirmed, then the photo disappears from the site; custom requests that referenced it keep their copy (source id set null).
- AC29 (FR-064): Given a caption only in EN, then FR pages show the EN caption.
- AC30 (FR-066): Given an Admin, when opening `/admin/availability` or calling its actions, then `FORBIDDEN` / "Owner only".
- AC31 (FR-066, FR-013): Given default notice 3, today Monday, then Tue and Wed are disabled and Thu enabled for a customer.
- AC32 (FR-066): Given closed weekday Sunday, then Sundays are disabled with reason "closed day"; given Sunday removed from the list, then Sundays are selectable.
- AC33 (FR-066, FR-020): Given edited windows, then checkout shows the new windows; delivery and pickup may differ; overlapping windows are rejected.
- AC34 (FR-059): Given an added range block over dates with 2 orders, then the response lists them, the block applies to new orders at once and the 2 orders keep their status.
- AC35 (FR-067, FR-003): Given a changed pickup address, then the footer, checkout and Order confirmed email use it with no deployment.
- AC36 (FR-067, FR-019): Given delivery fee 250, then new delivery orders get 250 and existing orders keep their fee.
- AC37 (FR-067, FR-073): Given a template with {name} and {unknown}, when saving, then `VALIDATION_FAILED` names the bad placeholder; given valid templates, then the preview resolves placeholders in EN and FR.
- AC38 (FR-067, FR-030): Given quote validity 5, then a new quote's default expiry is today + 5.
- AC39 (FR-067, FR-010): Given FAQ saved without the cancellation or storage entry, then a warning shows (save allowed).
- AC40 (FR-067, FR-054 style): Given two Owners, when the second saves a stale version, then `SETTINGS_CHANGED` and "Someone changed this. Reload."
- AC41 (FR-067): Given the Juice number changed, then Payment reminder template and Order confirmed email use it.

## Non-functional
- Performance: admin routes within initial JS <= 170 kB gzip per route (compression library lazy-loaded only on photo selection); uploads run in parallel (max 3) with progress; saved images <= 300 kB (NFR-009), served CDN-cached with explicit width/height.
- Accessibility: WCAG 2.2 AA; labelled fields, errors under controls plus summary; dnd with keyboard alternative; chips not colour-only; tap targets >= 44 px; status badges have text.
- Security: server role checks (Owner routes `FORBIDDEN`), zod validation at the boundary, signed upload URLs only, MIME allow-list, rich text not supported (plain text, rendered escaped, newlines only) to prevent XSS; no secrets in Settings (Juice number is public contact data).
- Privacy: Settings hold business contact data only; no customer data; image EXIF stripped by client re-encode (location).

## Rollout / flags
- Flag: none · Rollout: with admin launch; Settings seeded by migration with PRD defaults · Rollback: redeploy; content edits are data, not reversible except by re-edit (Settings version history not kept).

## Open Questions
1. Slug change after publish: **Resolved (owner, 2026-11-10, Q19):** old slug redirects 301 via slug history.
2. Resolved 2026-11-10: 300 kB target, 1 MB server cap; PRD NFR-001 and project.yaml now say 300 kB.
3. Gallery occasion list fixed vs free: assumption free with suggestions.
4. Max option groups/choices (10/30) acceptable? — Sabera.
