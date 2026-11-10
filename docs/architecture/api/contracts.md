# API Contract — loaders, actions, hooks and jobs

Form: **framework-native typed contracts** (React Router v8 route modules on Cloudflare Workers; no public REST API, no OpenAPI). Owner: `lead-backend`; `lead-frontend` must agree to changes (coordination rule 5). Updated: 2026-11-10 · v0.2 (feature-spec consolidation).
Sources: `docs/product/prd.md`, `data-model.md`, `architecture.md`. Feature specs (`docs/specs/features/*.md`) link to the sections here instead of repeating them.

## Conventions
- **Route module = contract unit.** Each row names the module, its `loader` (GET) output and its `action` (POST) intents. Multi-action routes post a discriminated union on a hidden `intent` field. Every customer route exists twice: `/x` (EN) and `/fr/x` (FR), same module.
- **Input** is `FormData` (or URL params/search) parsed with the zod schema named in the row, from `app/server/contracts/<area>.ts`. Types are `z.infer` of these schemas and are imported by both the route view and the service; that file **is** the typed contract in code.
- **Output:** loaders return plain JSON-serialisable objects (shapes below). Actions return either `redirect(...)`, `{ ok: true, ...data }`, or the error envelope via `data(body, { status })`:
  ```ts
  type ActionError = { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
  ```
  `message` is already localised for the page's locale; `fields` maps form field names to localised messages.
- **Auth column:** `public`; `token` (tracking token in path); `customer` (`requireCustomer`); `admin` (`requireAdmin`: active, session ≤ 30 days); `owner` (`requireAdmin({ role: 'owner' })`). Unauthenticated page requests redirect (`/account/sign-in?next=` or `/admin/login?next=`); Admin on an Owner route gets **403**; any non-admin on `/admin/*` (except login, invite, forgot, reset) — including a signed-in **customer** — is redirected to `/admin/login` (the customer session is left intact, never upgraded), and admin data is never returned (FR-039, FR-041). Decision 2026-11-10: redirect, not 404 (the login page is public anyway, so a 404 hides nothing).
- **Concurrency:** every order mutation carries `version` (int, from the loader). Mismatch → `409 ORDER_CHANGED`. Same for `settings`. Exception: private notes (`admin/order` and `admin/customer` `saveNote`) neither take nor bump `version` (last write wins), so note autosave never conflicts with a status change.
- **Customer matching (security, 2026-11-10, threat-model G-02):** website orders (`placeOrder`, `submitCustomRequest`) resolve the customer like this: signed-in customer → their own row; else an exact lower-cased email match; else a **new** row (never matched by phone alone). Admin `order-new` `create` matches by email, then phone (FR-057). No order path ever writes `customer.email` or `customer.auth_user_id` on an existing row; typed contact data goes only to the order snapshot (`contact_*`). Only `auth/confirm` sets `auth_user_id`; only `account/profile` changes a signed-in customer's own row.
- **Idempotency:** `placeOrder`, `submitCustomRequest` and admin `order-new` `create` carry `idempotencyKey` (uuid rendered into the form, stored in `orders.idempotency_key`). A replay returns the original order's redirect, never a second order or email (FR-023).
- **Rate-limit classes** (architecture.md "Cross-cutting"): `RL-order`, `RL-request`, `RL-auth`, `RL-signup`, `RL-track`, `RL-upload`. Admin actions are not rate-limited beyond auth.
- **Bot check:** rows marked **TS** require `turnstileToken`.
- **Pagination:** admin lists use `?cursor=&limit=` (default 30, max 100) → `{ data, nextCursor: string | null }`; cursor = opaque base64 of the sort key.
- **Caching:** all HTML `no-store` (architecture.md); `/admin/sw.js` `no-cache`; Storage images are CDN-cached by path.
- **Limits** live as constants in `contracts/shared.ts` (`BASKET_MAX_LINES = 10`, `LINE_MAX_QUANTITY = 50`, `MAX_PHOTOS = 5`, `UPLOAD_MAX_BYTES = 1_048_576`, `UPLOAD_TARGET_BYTES = 307_200`, `DAY_HORIZON = 90`), imported by views and services; loaders do not echo them.
- **Uploads:** the browser compresses every photo to ≤ 300 kB (target, NFR-009) at ≤ 1600 px; the server hard cap is 1 MB per object (`UPLOAD_REJECTED` above it). Same rule for customer and admin uploads.
- **Order status groups** (single definition, `domain/status.ts`): *active* = every status except declined, cancelled, closed (calendar counts and lists, Today); *confirmed* = approved, in_preparation, ready_for_pickup, out_for_delivery, completed (prep list, evening reminder count, unpaid list).
- **Money** is integer rupees (`Rs`), **dates** are `YYYY-MM-DD` in Mauritius time, **instants** are ISO-8601 UTC strings.

## Error codes
| Code | HTTP | When |
|---|---|---|
| `VALIDATION_FAILED` | 400 | zod failure; `fields` populated |
| `BOT_CHECK_FAILED` | 400 | Turnstile verify failed |
| `UNAUTHENTICATED` | 401 | no/expired session on an action called by fetcher (pages redirect instead) |
| `FORBIDDEN` | 403 | Admin calling an Owner action; customer session on admin action |
| `NOT_FOUND` | 404 | unknown slug/id/token (tracking: same response for wrong and unknown token) |
| `ORDER_CHANGED` | 409 | optimistic version mismatch ("This order changed, reload") |
| `SETTINGS_CHANGED` | 409 | settings version mismatch |
| `INVALID_TRANSITION` | 409 | status change not allowed by PRD Appendix B |
| `CANCEL_NOT_ALLOWED` | 409 | customer cancel outside pending_approval / quote_needed |
| `DATE_UNAVAILABLE` | 409 | blocked / closed / too soon / too far (beyond `DAY_HORIZON`) at submit; `fields.date` + `reason` (`DayStatus.reason` enum) |
| `PRICE_CHANGED` | 409 | server total (items + fee) ≠ `displayedTotalRs`; body `{ ok: false, error, lines: PricedLine[], itemsTotalRs, deliveryFeeRs, totalRs }` |
| `PRODUCT_UNAVAILABLE` | 409 | sold out, hidden, outside seasonal window; response lists line ids |
| `QUOTE_EXPIRED` | 409 | accept/decline when `todayMU > quote_expires_on`; checked **before** the version check |
| `LAST_OWNER` | 409 | would leave zero active Owners |
| `EMAIL_IN_USE` | 409 | sign-up/invite email already an admin or customer account |
| `INVITE_INVALID` | 410 | invitation expired, revoked or accepted |
| `UPLOAD_REJECTED` | 422 | missing object, wrong MIME, > 1 MB, > 5 photos (custom request: `photoPaths` + `galleryPhotoId` together ≤ 5) |
| `BASKET_FULL` | 422 | > 10 basket lines |
| `RATE_LIMITED` | 429 | rate-limit class exceeded; `Retry-After` header |
| `INTERNAL` | 500 | unexpected; Sentry event id in `message` for admins only |

## Shared schemas (`app/server/contracts/shared.ts`)
```ts
Locale        = z.enum(["en", "fr"])
Uuid          = z.uuid()
MuDate        = z.iso.date()                          // Mauritius calendar date
Rs            = z.coerce.number().int().min(0).max(1_000_000)
Phone         = z.string().trim().min(6).max(20)      // normalised to E.164 (+230 default) by domain/phone; wa.me links use its digits
Email         = z.email().trim().toLowerCase().max(254)
Version       = z.coerce.number().int().min(1)
Fulfilment    = z.enum(["delivery", "pickup"])
WindowId      = z.string().min(1).max(40)             // id from settings windows
TurnstileToken= z.string().min(1).max(2048)
OptionPick    = z.object({ groupId: Uuid, choiceIds: z.array(Uuid).max(20).default([]),
                           text: z.string().max(200).optional(), quantity: z.coerce.number().int().min(0).max(99).optional() })
BasketLine    = z.object({ lineId: z.string().max(16), productId: Uuid, options: z.array(OptionPick).max(20),
                           cakeMessage: z.string().max(200).optional(), quantity: z.coerce.number().int().min(1).max(50) })
Contact       = z.object({ name: z.string().trim().min(1).max(80), phone: Phone, email: Email, note: z.string().max(1000).optional() })
AdminContact  = Contact.extend({ email: Email.optional() })       // admin manual orders only
FreeTextLine  = z.object({ freeText: z.object({ name: z.string().trim().min(1).max(120), priceRs: Rs, quantity: z.coerce.number().int().min(1).max(50) }) })
AdminLine     = z.union([BasketLine, FreeTextLine])                // manual create and edit
DeliveryDetail= z.discriminatedUnion("fulfilment", [
                  z.object({ fulfilment: z.literal("pickup") }),
                  z.object({ fulfilment: z.literal("delivery"), address: z.string().trim().min(5).max(300), landmark: z.string().max(200).optional() }) ])
```
Per-group limits (required, text max length, quantity min/max) and the product minimum (`product.min_quantity`, NULL = none; else `VALIDATION_FAILED fields.quantity`) are checked by `domain/pricing.ts` against the product, not by zod.

**Shared output shapes**
```ts
Localized      = { en: string; fr: string | null }        // views call t(localized, locale)
Money          = number                                    // Rs, whole rupees
ProductCard    = { id, slug, type, name: Localized, imageUrl: string | null, fromPriceRs: Money,
                   salePriceRs: Money | null, promoBadge: boolean, soldOut: boolean, allergens: string[] }
PricedLine     = { lineId, productId, name: Localized, options: { label: Localized; priceDeltaRs: Money }[],
                   cakeMessage: string | null, quantity, unitPriceRs: Money, originalUnitPriceRs: Money,
                   lineTotalRs: Money, promotionId: string | null, problem: "sold_out" | "hidden" | "out_of_season" | null }
DayStatus      = { date: MuDate; available: boolean; reason: "blocked" | "closed" | "too_soon" | "too_far" | null }   // priority blocked > closed > too_soon > too_far
OrderSummary   = { id, number: string /* "APB-0042" */, status, source, fulfilment, fulfilOn: MuDate,
                   window: { id, start, end, label: Localized }, contactName, totalRs: Money, paid: boolean, itemsPreview: string[], version: number }
OrderEventView = { at: string; actor: { type: "admin" | "customer" | "system"; name: string | null }; type: string;
                   fromStatus: string | null; toStatus: string | null; details: Record<string, unknown> | null }
```

## Root and layout
| Module | Loader output | Auth |
|---|---|---|
| `root.tsx` | `{ locale, banner: { id, title: Localized, text: Localized \| null, href: string \| null } \| null, footer: { whatsapp, phone, email, instagramUrl, pickupAddress, mapUrl }, basketCount: number, turnstileSiteKey, sentryEnabled }`; `banner` is null when its id is in the `apb_banner_dismissed` session cookie; `href` is null when it would point at a hidden product | public |

Action (root): `dismissBanner` `{ promotionId: Uuid }` → `{ ok: true }`, appends the id to the session cookie `apb_banner_dismissed` (HttpOnly, SameSite=Lax, no Max-Age, ≤ 10 ids). Public; no DB write.

## Customer site
| Module (path) | Loader input → output | Action intents (input schema → success) | Auth / RL | Req |
|---|---|---|---|---|
| `site/home` (`/`) | → `{ hero: { tagline: Localized, imageUrl }, promoCards: PromoCard[], seasonal: ProductCard[], featured: ProductCard[], gallery: GalleryThumb[6] }` | — | public | FR-004 |
| `site/menu` (`/menu`) | `?type=cake\|cupcake_box\|dessert\|seasonal&allergen=eggless,nut_free` → `{ products: ProductCard[], filters: { types, allergens } }` | — | public | FR-005, FR-006 |
| `site/product` (`/menu/:slug`) | → `{ product: { id, slug, type, name, description, allergens, photos: { url, width, height }[], status: "available" \| "sold_out", minQuantity: number \| null, basePriceRs, salePriceRs \| null, promotionId \| null, promotion: { title: Localized, endsAt: string } \| null, optionGroups: { id, name, kind, required, textMaxLength, quantityMin, quantityMax, choices: { id, name, priceDeltaRs }[] }[] }, earliestDate: MuDate, cakeMessageMax, seo: { title, description, imageUrl } }`; 404 if hidden/out of season; sold-out products render (status `sold_out`, not addable) | `addToBasket`: `BasketLine` minus `lineId` → redirect `/basket` or `{ ok, basketCount }` (fetcher); an identical configuration merges into the existing line (quantity capped at 50) · errors `VALIDATION_FAILED` (missing required option, text too long, below `minQuantity`), `PRODUCT_UNAVAILABLE`, `BASKET_FULL` | public | FR-007, FR-008 |
| `site/basket` (`/basket`) | → `{ lines: PricedLine[], itemsTotalRs, deliveryFeeRs, windows: { delivery, pickup }, days: DayStatus[90], earliestDate, pickup: { address, mapUrl }, payment: { juiceNumber }, prefill: { contact, addresses[] } \| null, idempotencyKey: Uuid, reorderSkipped: { name: Localized, reason: "sold_out" \| "hidden" \| "out_of_season" \| "option_removed" \| "free_text" \| "basket_full" }[] \| null }` (`reorderSkipped` read once from the reorder flash) | `updateLine` `{ lineId, quantity }` (checked against `minQuantity`) · `removeLine` `{ lineId }` → `{ ok }` · **`placeOrder`** `{ idempotencyKey, displayedTotalRs: Rs, date: MuDate, windowId, ...DeliveryDetail, contact: Contact, acceptPolicies: z.literal("on"), turnstileToken }` → redirect `/order/:token/confirmed` (clears basket cookie) · errors `DATE_UNAVAILABLE`, `PRICE_CHANGED` (+`lines`, `itemsTotalRs`, `deliveryFeeRs`, `totalRs`), `PRODUCT_UNAVAILABLE`, `VALIDATION_FAILED`, `RATE_LIMITED`, `BOT_CHECK_FAILED` | public; `placeOrder` RL-order, **TS** | FR-011..015, FR-018..024 |
| `site/order-confirmed` (`/order/:token/confirmed`) | → `{ number, trackingUrl, offerSaveDetails: boolean, email }` | — | token | FR-025, FR-038 |
| `site/tracking` (`/t/:token`) | → `{ order: OrderSummary & { items: PricedLine[], deliveryFeeRs, address, landmark, customerNote, declineReason, version }, payment: { juiceNumber: string \| null }, progress: { steps: string[], current: number }, quote: { amountRs, note, expiresOn, canRespond } \| null, canCancel: boolean, whatsappUrl }` (`whatsappUrl` from `domain/whatsapp.ts`, order number prefilled); token must match `^[A-Za-z0-9_-]{43}$` before any DB read; same 404 for wrong and unknown token | `cancel` `{ version }` → `{ ok }` · `acceptQuote` `{ version }` → `{ ok }` (status approved) · `declineQuote` `{ version }` → `{ ok }` (closed) · errors `CANCEL_NOT_ALLOWED` and `QUOTE_EXPIRED` (both checked before version), `INVALID_TRANSITION`, `ORDER_CHANGED` | token; RL-track | FR-026, FR-027, FR-031 |
| `site/custom-cake` (`/custom-cake`) | `?fromGallery=<uuid>` → `{ days: DayStatus[90], windows, prefill, attachedGalleryPhoto: { id, url } \| null, idempotencyKey, limits: { photos: 5, maxSourceMb: 10 } }` | `requestUploadUrls` `{ uploadSessionId: Uuid, files: { type: "image/jpeg"\|"image/png"\|"image/webp", size: ≤1_048_576 }[1..5], turnstileToken }` → `{ ok, uploads: { path, signedUrl, token }[] }` (RL-upload) · **`submitCustomRequest`** `{ idempotencyKey, uploadSessionId, photoPaths: string[≤5], galleryPhotoId? (counts toward the 5; referenced, not copied), occasion, date, windowId, servings: 1..500, flavours, theme, cakeText ≤ 200, budgetRs?: Rs, details ≤ 2000, ...DeliveryDetail, contact: Contact, acceptPolicies, turnstileToken }` → redirect `/order/:token/confirmed` · errors `UPLOAD_REJECTED`, `DATE_UNAVAILABLE`, `VALIDATION_FAILED`, `RATE_LIMITED` | public; RL-request, **TS** | FR-028..030 |
| `site/gallery` (`/gallery`) | `?occasion=` → `{ photos: { id, url, width, height, caption: Localized \| null, occasion }[], occasions: string[] }` | — | public | FR-009 |
| `site/about`, `site/contact`, `site/faq` | → `{ about \| contact \| faq+policies+privacyNote }` from Settings, localised with EN fallback | — | public | FR-010 |

## Customer accounts
| Module (path) | Loader → output | Action intents | Auth / RL | Req |
|---|---|---|---|---|
| `account/sign-in` (`/account/sign-in`) | `?next=` → `{ next }` | `password` `{ email, password, turnstileToken }` → redirect `next` · `magicLink` `{ email, turnstileToken }` → `{ ok }` (always, no account enumeration; Supabase `shouldCreateUser: false`) | public; RL-auth, **TS** | FR-034 |
| `account/sign-up` | — | `signUp` `{ name, email, phone, locale, turnstileToken }` (**no password**, threat-model G-01) → the server creates the Supabase user with a random 32-byte password that is discarded, and sends the confirmation email → `{ ok }`; the account is usable, linked and given a password only after confirmation. A repeat sign-up for an unconfirmed email only resends the confirmation · `EMAIL_IN_USE` shown as generic success + email | public; RL-signup, **TS** | FR-034 |
| `account/reset` | — | `requestReset` `{ email, turnstileToken }` → `{ ok }` · `setPassword` `{ password: min 10 }` (session from a recovery link, or the first-confirmation session with `?mode=new`) → redirect `next` (default `/account`) | public; RL-auth | FR-034 |
| `auth/confirm` (`/auth/confirm`) | `?token_hash&type=magiclink\|recovery\|signup\|email_change&next` → verifies OTP, sets cookies, redirect. On `type=signup` (first confirmation) it links the account: `UPDATE customer SET auth_user_id = :uid WHERE email = :confirmedEmail AND auth_user_id IS NULL` (else inserts the row), in one transaction; this is the **only** place guest orders get linked. After a first confirmation it redirects to `/account/reset?mode=new&next=/account/orders` (choose a password; skippable, magic link still works). The password is never chosen before email ownership is proven (threat-model G-01) | — | public | FR-034, FR-038 |
| `account/profile` (`/account`) | → `{ name, phone, email, locale }` | `updateProfile` `{ name, phone, locale }` → `{ ok }` | customer | FR-035 |
| `account/addresses` (`/account/addresses`) | → `{ addresses: { id, label, address, landmark, isDefault }[] }` | `addAddress` / `updateAddress` `{ id?, label, address, landmark?, isDefault }` · `deleteAddress` `{ id }` · at most one default per customer (setting `isDefault` clears the others in the same transaction; DB partial unique index) · another customer's id → `NOT_FOUND` | customer | FR-035 |
| `account/orders` (`/account/orders`) | → `{ current: OrderSummary[], past: OrderSummary[], trackingUrls: Record<id, string> }` | Lists orders where `customer_id` = the session's customer row **and** (`lower(contact_email)` = the confirmed auth email **or** `source = manual`) (threat-model G-02) · `reorder` `{ orderId }` (same ownership filter, else `NOT_FOUND`) → redirect `/basket` with flash `{ skipped: { name: Localized, reason: "sold_out" \| "hidden" \| "out_of_season" \| "option_removed" \| "free_text" \| "basket_full" }[] }` (shown via basket `reorderSkipped`); current prices apply | customer (own orders only) | FR-036, FR-037 |
| `account/save-details` (`/account/save-details`) | `?t=<tracking token>` → `{ email, name }` | `saveDetails` `{ trackingToken, turnstileToken }` (**no password**, threat-model G-01: a forwarded tracking link must not let someone pre-set the password of another person's account) → creates an **unconfirmed** Supabase user for the order's email with a random discarded password and sends the confirmation email; returns `{ ok, confirmationSent: true }` ("Check your email"). **No orders are linked and no history is shown at this step** (security, 2026-11-10: otherwise anyone who placed a guest order with someone else's email could read that person's order history). Linking happens in `auth/confirm` `type=signup` only · `EMAIL_IN_USE` → offer sign-in (same response timing) | token; RL-signup, **TS** | FR-038 |
| `account/sign-out` | — | POST → redirect `/` | customer | — |

## Admin app
All `admin` unless marked **owner**. Every order-mutating intent takes `{ version: Version }` and returns `{ ok: true, order: { status, version } }` or `ORDER_CHANGED` / `INVALID_TRANSITION`. Each success writes an `order_event` with the acting admin and queues the email in PRD Appendix B.

| Module (path) | Loader input → output | Action intents | Req |
|---|---|---|---|
| `admin/login` (`/admin/login`) — public | `?next` | `signIn` `{ email, password }` (RL-auth) → redirect; non-admin or inactive → generic "invalid credentials" | FR-040 |
| `admin/forgot` — public | — | `requestReset` `{ email }` (RL-auth) → `{ ok }` always; recovery link `redirect_to` = `/admin/reset` | FR-040 |
| `admin/reset` (`/admin/reset`) — public, recovery session from `auth/confirm` | → `{ email }`, or 410 `INVITE_INVALID`-style \"link expired\" when the recovery session is missing/expired | `setPassword` `{ password: min 10 }` (RL-auth) → redirect `/admin` (Today); caller must be an active admin, else generic error | FR-040 |
| `admin/invite` (`/admin/invite/:token`) — public | → `{ name, email, role }` or `INVITE_INVALID` | `accept` `{ password: min 10, locale }` → creates auth user + admin, signs in, redirect `/admin` | FR-042 |
| `admin/sign-out` | — | POST → deletes this device's push subscription (optional `endpoint`), redirect `/admin/login` | — |
| `admin/layout` (`/admin`) | → `{ me: { id, name, role, locale }, nav: { ownerItems: boolean }, vapidPublicKey }` | — | FR-047 |
| `admin/today` (`/admin`) | → `{ counts: { toReview, quotesToSend, unpaid }, today: (OrderSummary & { nextStatus: OrderStatus \| null })[], tomorrow: (same)[] }` (*active* orders; `nextStatus` null when the row needs Approve/quote) | `advance` `{ orderId, version }` | FR-048 |
| `admin/orders` (`/admin/orders`) | `?tab=review\|upcoming\|completed\|closed&q&date&fulfilment&paid=true\|false&cursor&limit` → `{ data: OrderSummary[], nextCursor, counts: { review, upcoming, completed, closed } }`. Tabs: review = pending_approval, quote_needed; upcoming = quote_sent, approved, in_preparation, ready_for_pickup, out_for_delivery; completed; closed = cancelled, declined, closed. `q` searches the active tab | — | FR-049 |
| `admin/order` (`/admin/orders/:id`) | → `{ order: full order + items + customRequest (with signed photo URLs, 10 min) + version, customer: { id, name, phone, email }, mapsUrl, telUrl, whatsapp: { templates: { key, label }[] }, events: OrderEventView[], quoteDefaults: { expiresOn: MuDate /* today + quote_validity_days */ }, allowed: { approve, decline, sendQuote, advance: nextStatus \| null, revert: prevStatus \| null, cancel, edit, setPaid, saveNote } }`; `allowed.cancel` is true for pending_approval, quote_needed, approved, in_preparation, ready_for_pickup, out_for_delivery (not quote_sent, not completed or terminal) | `approve` · `decline` `{ reason?: ≤ 500 }` · `sendQuote` `{ amountRs: Rs ≥ 1, note?: ≤ 1000, expiresOn: MuDate ≥ today }` (also re-quote while `quote_sent`; sets `total_rs` = amount) · `advance` `{}` (target derived from status + fulfilment; no `to`) · `revert` (no email) · `cancel` `{ reason? }` · `setPaid` `{ paid: boolean }` · `saveNote` `{ adminNote: ≤ 2000 }` (no `version`, no event) · `whatsappLink` `{ template }` → `{ ok, url }` (no state change) | FR-050..054, FR-073 |
| `admin/order-edit` (`/admin/orders/:id/edit`) | → `{ order, catalogue: product picker data, windows, days: DayStatus[] }` | `save` `{ version, lines: AdminLine[], ...DeliveryDetail, date, windowId, deliveryFeeRs: Rs, contact: AdminContact, overrideTotalRs: Rs \| null }` (null clears an override) → redirect to the order with flash `{ warnings: ("blocked" \| "closed" \| "too_soon")[] }`; refused (`INVALID_TRANSITION`) if completed or terminal; no customer email | FR-053, FR-056 |
| `admin/order-new` (`/admin/orders/new`) | → same picker data as edit + `idempotencyKey: Uuid`, default `deliveryFeeRs`, `days: DayStatus[365]` (admin horizon 365 days; reasons shown as warnings, not blocking) | `findCustomer` `{ phone?, email? }` → `{ ok, customer: { id, name, phone, email, locale, orderCount } \| null, conflict: boolean }` (`conflict` = email and phone match different customers; the email match wins) · `create` `{ idempotencyKey, lines: AdminLine[], contact: AdminContact, locale, customerNote?: ≤ 1000, adminNote?: ≤ 2000, date: MuDate ≥ today, windowId, ...DeliveryDetail, deliveryFeeRs: Rs, paid: boolean }` → redirect to the order with flash `{ warnings: ("blocked" \| "closed" \| "too_soon")[] }`; status approved, source manual; reuses customer by email then phone; sold-out/hidden products → `PRODUCT_UNAVAILABLE`; replayed key → original redirect | FR-055..057 |
| `admin/calendar` (`/admin/calendar`) | `?month=YYYY-MM&view=month\|week\|day&date` → `{ days: { date, delivery: n, pickup: n, blocked: boolean, closedDay: boolean, blockKind: "single" \| "range" \| null, blockReason: string \| null }[], list: OrderSummary[] }` (counts and `list` = *active* orders, incl. pending ones; `list` covers the view's range, so `view=day` gives the day sheet's orders; weeks start Monday) | `blockDay` `{ date, reason?: ≤ 200 }` → `{ ok, existingOrders: OrderSummary[] }` · `unblockDay` `{ date }` (an Admin may remove single-day blocks only; a range → `FORBIDDEN` with `details.reason = "range_block"`) | FR-058, FR-059 |
| `admin/prep` (`/admin/calendar/:date/prep`) | → `{ date, summary: { orders: n, items: n }, groups: { product: Localized, variants: { label, quantity, orderCount, messages: string[] }[] }[], shareText }` (*confirmed* orders only, approved..completed; free-text items under "Other"; no customer PII; `shareText` built server-side in the admin's locale) | — | FR-060 |
| `admin/menu` (`/admin/menu`) | → `{ byType: Record<type, { id, name, status, imageUrl, sortOrder }[]> }` | `reorder` `{ type, ids: Uuid[] }` · `setStatus` `{ id, status }` · `duplicate` `{ id }` → redirect to the copy (status hidden; photo objects copied server-side to new paths) · `delete` `{ id }` | FR-061 |
| `admin/product` (`/admin/menu/new`, `/admin/menu/:id`) | → `{ product \| null, categories, allergenTags, previewUrl: "/admin/menu/:id/preview" \| null, settingsDefaults: { noticeDays, cakeMessageMax } }` | `requestUploadUrls` (as customer, bucket `public-images`, no TS) · `save` `ProductInput` = `{ id?, slug, type, category?, name: {en, fr?}, description: {en?, fr?}, basePriceRs, allergens[], noticeDays?: 0..60, minQuantity?: 1..50 \| null, status, seasonal?: { startsOn, endsOn }, photos: { path, width, height }[1..5], optionGroups: { id?, name, kind, required, textMaxLength?, quantityMin?, quantityMax?, choices: { id?, name, priceDeltaRs: int }[] }[] }` → `{ ok, id }` | FR-062 |
| `admin/product-preview` (`/admin/menu/:id/preview`) | → same shape as the `site/product` loader for any status (incl. hidden, out of season), rendered with a "Preview" ribbon, `noindex` | — | FR-062 |
| `admin/promotions` (`/admin/promotions`) | → `{ promotions: { id, title, status: "scheduled"\|"live"\|"ended"\|"inactive", startsAt, endsAt, placement, hasDiscounts: boolean, productCount: n }[] }` | `setActive` `{ id, active }` · `delete` `{ id }` | FR-063 |
| `admin/promotion` (`/admin/promotions/new`, `/:id`) | → `{ promotion \| null, products: picker }` | `save` `{ id?, title, text, imagePath?, startsAt, endsAt (MU local "YYYY-MM-DDTHH:mm"), active, placement, link: { kind, productId?, category? }, discounts: { productId, kind: "percent"\|"sale_price", percentOff?: 1..99, salePriceRs?: Rs }[] }` | FR-063 |
| `admin/gallery` (`/admin/gallery`) | → `{ photos: { id, url, occasion, caption: Localized \| null, sortOrder }[], occasions: string[] }` | `requestUploadUrls` · `addPhotos` `{ photos: { path, width, height, occasion?: ≤ 40 }[≤20] }` · `update` `{ id, occasion?, caption?: { en, fr? } }` · `reorder` `{ ids }` · `delete` `{ id }` | FR-064 |
| `admin/customers` (`/admin/customers`) | `?q&sort=last_order\|name\|spent&cursor&limit` → `{ data: { id, name, phone, email, orderCount, totalSpentRs, lastOrderOn: MuDate \| null }[], nextCursor }` (`q` ≤ 80, phone digits normalised; orderCount = orders not declined/cancelled/closed; totalSpent = completed only) | — | FR-065 |
| `admin/customer` (`/admin/customers/:id`) | → `{ customer: { id, name, phone, email, locale, hasAccount, adminNote }, telUrl, whatsappUrl, orders: OrderSummary[] }` | `saveNote` `{ adminNote ≤ 2000 }` (no version) | FR-065 |
| `admin/availability` (`/admin/availability`) — **owner** | → `{ defaultNoticeDays, closedWeekdays, deliveryWindows, pickupWindows, blocks: { id, startsOn, endsOn, reason }[], version }` | `saveRules` `{ version, ...AvailabilityInput }` → `{ ok, affectedOrders: OrderSummary[] }` (active orders on newly closed weekdays; warning only) · `addBlock` `{ startsOn, endsOn, reason? }` → `{ ok, existingOrders }` · `removeBlock` `{ id }` | FR-059, FR-066 |
| `admin/settings` (`/admin/settings`) — **owner** | → settings row (minus availability) + `version` + Resend daily usage + `previewSample` (sample order values for the WhatsApp template preview) | `save` `{ version, ...SettingsInput }` → `{ ok }` / `SETTINGS_CHANGED`; unknown template placeholder → `VALIDATION_FAILED` with `fields["whatsappTemplates.<key>.<locale>"]` | FR-067, FR-073 |
| `admin/sales` (`/admin/sales`) | `?range=week\|month\|last_month\|custom&from&to` → `{ range, revenueRs, orderCount, averageRs, delivery: n, pickup: n, deliveryRevenueRs, pickupRevenueRs, top5: { name, quantity, revenueRs }[], bySource: Record<"website"\|"custom_request"\|"manual", Rs> /* all three keys, 0 when none */, unpaid: { id, number, contactName, status, fulfilOn, totalRs }[], unpaidTotalRs }`. Definitions: revenue = sum of `total_rs` (incl. delivery fee) of completed orders with `fulfil_on` in range; average rounds half up; top5 by units desc, then revenue desc, then name (free-text items excluded); unpaid = *confirmed* orders with `paid = false` and `fulfil_on` in range; `custom` range ≤ 366 days | — | FR-068 |
| `admin/sales-csv` (`/admin/sales.csv`) resource | same query → `text/csv; charset=utf-8` with BOM and CRLF, `Content-Disposition: attachment; filename="apb-sales-<from>_<to>.csv"`; sections Summary, Top products, By source, Unpaid, Orders (one row per completed order); cells starting with `=`, `+`, `-` or `@` are prefixed with an apostrophe | — | FR-069 |
| `admin/team` (`/admin/team`) — **owner** | → `{ admins: { id, name, email, role, active, lastSignInAt }[], invites: { id, email, name, role, expiresAt }[] }` | `invite` `{ name, email, role, locale }` → `{ ok, emailQueued: boolean }` · `resendInvite` `{ id }` · `revokeInvite` `{ id }` · `changeRole` `{ adminId, role }` · `deactivate` `{ adminId }` · `reactivate` `{ adminId }` · errors `LAST_OWNER`, `EMAIL_IN_USE` | FR-042..044 |
| `admin/profile` (`/admin/profile`) | → `{ name, email, locale, alertPush, alertEmail, pushDevices: n }` | `updateProfile` `{ name, locale }` · `changePassword` `{ password: min 10 }` · `setAlerts` `{ alertPush, alertEmail }` · `subscribePush` `{ endpoint: url, keys: { p256dh, auth } }` → `{ ok }` · `unsubscribePush` `{ endpoint }` · `sendTestPush` `{}` → `{ ok, sent: n }` (caller's own devices only) | FR-046, FR-072 |
| static | `/admin/manifest.webmanifest` (scope `/admin/`), `/admin/sw.js` (push + `notificationclick` → `data.url`) | — | FR-047 |

**Push payload** (sent by server, read by `sw.js`): `{ title: string, body: string, url: "/admin/orders/<id>" | "/admin/calendar/<date>/prep", tag: string }`. `/admin/orders/<id>` for new order, new custom request, quote accepted/declined, customer cancelled, 24-hour pending and quote expired; `/admin/calendar/<tomorrow>/prep` for the evening reminder — localised to the admin's `locale`; contains order number and first name only (NFR-004).

**Admin input schemas** (`app/server/contracts/admin.ts`)
```ts
LocalizedInput   = z.object({ en: z.string().trim().min(1), fr: z.string().trim().optional() })
TimeHHmm         = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
WindowInput      = z.object({ id: WindowId, start: TimeHHmm, end: TimeHHmm, label: LocalizedInput })   // start < end, ids stable
AvailabilityInput= z.object({ defaultNoticeDays: z.coerce.number().int().min(0).max(60),
                     closedWeekdays: z.array(z.coerce.number().int().min(1).max(7)).max(6),            // ISO; not all 7
                     deliveryWindows: z.array(WindowInput).min(1).max(6), pickupWindows: z.array(WindowInput).min(1).max(6) })
                     // refine: no overlapping windows within a list
TemplateKey      = z.enum(["approved", "ready", "on_the_way", "payment_reminder", "blank"])
Placeholder      = "{name}" | "{order_number}" | "{date}" | "{window}" | "{total}" | "{juice_number}" | "{pickup_address}" | "{tracking_link}"
SettingsInput    = z.object({
  deliveryFeeRs: Rs.max(100_000), pickupAddress: z.string().max(300), pickupMapUrl: z.url().or(z.literal("")),
  contactPhone: Phone, contactWhatsapp: Phone, contactEmail: Email, juiceNumber: z.string().max(30), instagramUrl: z.url().or(z.literal("")),
  heroTagline: LocalizedInput, heroImagePath: z.string().max(300).nullable(), featuredProductIds: z.array(Uuid).max(6),
  about: LocalizedInput, aboutImagePath: z.string().max(300).nullable(), faq: LocalizedInput, policies: LocalizedInput, privacyNote: LocalizedInput,
  whatsappTemplates: z.record(TemplateKey, z.object({ en: z.string().max(1000), fr: z.string().max(1000) })),  // refine: only Placeholder tokens
  quoteValidityDays: z.coerce.number().int().min(1).max(60), cakeMessageMax: z.coerce.number().int().min(10).max(200),
  eveningReminderAt: TimeHHmm, orderNumberPrefix: z.string().regex(/^[A-Z]{1,5}-?$/) })                        // prefix change affects new orders only
EmailTemplate    = z.enum([ /* customer */ "order_received", "request_received", "quote", "order_confirmed", "order_declined",
                     "request_declined", "cancellation_confirmed", "quote_closed", "ready_for_pickup", "on_the_way", "thank_you",
                     /* admin */ "admin_invitation", "admin_alert_new_order", "admin_alert_new_request", "admin_alert_quote_accepted",
                     "admin_alert_quote_declined", "admin_alert_customer_cancelled" ])  // = email_outbox.template; catalogue in specs/features/notifications.md
```

## Webhooks and resource endpoints
| Endpoint | Method | Auth | Input | Output |
|---|---|---|---|---|
| `/hooks/supabase/send-email` | POST | Standard Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature`, secret `SUPABASE_AUTH_HOOK_SECRET`); reject if timestamp skew > 5 min | `{ user: { email, user_metadata: { locale? } }, email_data: { token_hash, redirect_to, email_action_type: "signup"\|"magiclink"\|"recovery"\|"email_change"\|"invite", site_url } }` | `200 {}` after the email is sent (direct Resend call, not outbox: user is waiting); `401` bad signature; `500 { error: { http_code, message } }` so Supabase surfaces the failure. Idempotent on `webhook-id` (outbox `dedupe_key`). |
| `/healthz` | GET | public | — | `200 { ok: true, db: "ok", auth: "ok" }` or `503` with failing part; `no-store`; no secrets or versions |
No inbound webhooks from Resend in v1 (delivery status is not needed; failures are known from the API response).

## Scheduled jobs (`workers/app.ts` → `scheduled` → `app/jobs/dispatch.ts`)
Not HTTP. Contract: `dispatch(now: Date, env: Env, ctx: ExecutionContext): Promise<JobReport[]>` where `JobReport = { job: JobName; ran: boolean; processed: number; error?: string }`. Each job is `(deps: { db, now, sendEmail, sendPush, log }) => Promise<JobReport>` so it is unit-testable with a fixed clock.
| Job | Trigger rule (MU time) | Effects | Idempotency |
|---|---|---|---|
| `keepAlive` | every tick | DB `select 1`, `GET {SUPABASE_URL}/auth/v1/health` | stateless |
| `retryEmails` | every tick | send ≤ 50 due outbox rows; permanent provider errors (4xx except 429) go to `dead` at once; daily cap (architecture.md, Resend row) defers non-critical rows | row status + `dedupe_key` |
| `expireQuotes` | every tick | `quote_sent` with `quote_expires_on < todayMU` → `closed`, event (system), "Quote closed" email, push | versioned update; already-closed rows skipped |
| `pendingAlerts` | every tick | website `pending_approval` older than 24 h, marker NULL → set `pending_alert_sent_at`, push | marker set in the same update (`… AND pending_alert_sent_at IS NULL RETURNING`) |
| `eveningReminder` | first tick from the hour of `settings.evening_reminder_at` until 21:00 | push "Tomorrow: n orders" (n = *confirmed* orders, same as the prep list) → `/admin/calendar/<tomorrow>/prep`; n = 0 → no push, run key still claimed | `job_run('evening_reminder', todayMU)` |
| `purge` | 03:00 | retention deletes (data-model.md) | delete-by-predicate |

## Frontend review (Phase 3, lead-frontend checklist)
Checked against PRD screens: every page gets its data from one loader (no client waterfalls); date picker gets 90 `DayStatus` entries with reasons (FR-014); product page gets `earliestDate` and server prices so the live price matches (FR-007); checkout errors return the repriced basket to show new prices (FR-015); tracking returns `version`, `canCancel`, `quote.canRespond`; admin order detail returns `allowed` actions so the UI never offers an invalid transition; Today returns `nextStatus` per order. No over-fetching: lists return `OrderSummary`, detail returns the full order. Open request: none. Re-checked 2026-11-10 against the 11 feature specs (`docs/specs/features/README.md`); their open contract changes are applied in v0.2.

## Versioning and breaking changes
Internal contract shipped with the UI in one deploy, so there is no API versioning. Breaking changes (removed fields, narrowed inputs) must land in the same commit as both the route module and its view; a change to the push payload or `sw.js` must stay backward-compatible for one release, because installed service workers update lazily.

## Changelog
- 2026-11-10 v0.1 initial contract for all routes, webhook, health and cron jobs.
- 2026-11-10 v0.2 consolidation of the 11 feature specs (agreed lead-backend + lead-frontend): `dismissBanner`; product `status`/`minQuantity`/`promotion`; `too_far`; `PRICE_CHANGED` totals; tracking `payment`; reorder flash; **save-details links orders only after email confirmation** (security); `magicLink` no auto-create; `admin/reset`; customer on `/admin` → login redirect; `sendTestPush`; invite `emailQueued`; manual `create` idempotency/locale/notes/warnings, `findCustomer` conflict; `AdminContact`/`AdminLine`; `saveNote` unversioned; `advance` without `to`; `allowed` flags + cancel rule; tab counts; `OrderSummary.version`; calendar day fields, range-block rule; prep `orderCount`/confirmed statuses; product preview route; duplicate copies photos; gallery occasions; promotions counts; `SettingsInput`, `AvailabilityInput`, `EmailTemplate`; sales/CSV/customer fields; status groups; upload target 300 kB / cap 1 MB; job rules for `eveningReminder` and `retryEmails`.
- 2026-11-10 v0.3 security (threat-model G-01, G-02): `signUp` and `saveDetails` take no password; the password is set after the first confirmation (`account/reset?mode=new`); customer-matching convention (no phone-only match on website orders, never overwrite `email`/`auth_user_id`); My orders filtered by the confirmed email.
