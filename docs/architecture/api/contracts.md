# API Contract — loaders, actions, hooks and jobs

Form: **framework-native typed contracts** (React Router v8 route modules on Cloudflare Workers; no public REST API, no OpenAPI). Owner: `lead-backend`; `lead-frontend` must agree to changes (coordination rule 5). Updated: 2026-11-10 · v0.1.
Sources: `docs/product/prd.md`, `data-model.md`, `architecture.md`. Feature specs (`docs/specs/features/*.md`) link to the sections here instead of repeating them.

## Conventions
- **Route module = contract unit.** Each row names the module, its `loader` (GET) output and its `action` (POST) intents. Multi-action routes post a discriminated union on a hidden `intent` field. Every customer route exists twice: `/x` (EN) and `/fr/x` (FR), same module.
- **Input** is `FormData` (or URL params/search) parsed with the zod schema named in the row, from `app/server/contracts/<area>.ts`. Types are `z.infer` of these schemas and are imported by both the route view and the service; that file **is** the typed contract in code.
- **Output:** loaders return plain JSON-serialisable objects (shapes below). Actions return either `redirect(...)`, `{ ok: true, ...data }`, or the error envelope via `data(body, { status })`:
  ```ts
  type ActionError = { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
  ```
  `message` is already localised for the page's locale; `fields` maps form field names to localised messages.
- **Auth column:** `public`; `token` (tracking token in path); `customer` (`requireCustomer`); `admin` (`requireAdmin`: active, session ≤ 30 days); `owner` (`requireAdmin({ role: 'owner' })`). Unauthenticated page requests redirect (`/account/sign-in?next=` or `/admin/login?next=`); Admin on an Owner route gets **403**; any non-admin on `/admin/*` (except login/invite/forgot) is redirected to `/admin/login`, and admin data is never returned (FR-039, FR-041).
- **Concurrency:** every order mutation carries `version` (int, from the loader). Mismatch → `409 ORDER_CHANGED`. Same for `settings`.
- **Idempotency:** `placeOrder` and `submitCustomRequest` carry `idempotencyKey` (uuid rendered into the form). A replay returns the original order's redirect, never a second order (FR-023).
- **Rate-limit classes** (architecture.md "Cross-cutting"): `RL-order`, `RL-request`, `RL-auth`, `RL-signup`, `RL-track`, `RL-upload`. Admin actions are not rate-limited beyond auth.
- **Bot check:** rows marked **TS** require `turnstileToken`.
- **Pagination:** admin lists use `?cursor=&limit=` (default 30, max 100) → `{ data, nextCursor: string | null }`; cursor = opaque base64 of the sort key.
- **Caching:** all HTML `no-store` (architecture.md); `/admin/sw.js` `no-cache`; Storage images are CDN-cached by path.
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
| `DATE_UNAVAILABLE` | 409 | blocked / closed day / too soon at submit; `fields.date` + reason |
| `PRICE_CHANGED` | 409 | server total ≠ `displayedTotalRs`; response includes repriced basket |
| `PRODUCT_UNAVAILABLE` | 409 | sold out, hidden, outside seasonal window; response lists line ids |
| `QUOTE_EXPIRED` | 409 | accept after `quote_expires_on` |
| `LAST_OWNER` | 409 | would leave zero active Owners |
| `EMAIL_IN_USE` | 409 | sign-up/invite email already an admin or customer account |
| `INVITE_INVALID` | 410 | invitation expired, revoked or accepted |
| `UPLOAD_REJECTED` | 422 | missing object, wrong MIME, > 1 MB, > 5 photos |
| `BASKET_FULL` | 422 | > 10 basket lines |
| `RATE_LIMITED` | 429 | rate-limit class exceeded; `Retry-After` header |
| `INTERNAL` | 500 | unexpected; Sentry event id in `message` for admins only |

## Shared schemas (`app/server/contracts/shared.ts`)
```ts
Locale        = z.enum(["en", "fr"])
Uuid          = z.uuid()
MuDate        = z.iso.date()                          // Mauritius calendar date
Rs            = z.coerce.number().int().min(0).max(1_000_000)
Phone         = z.string().trim().min(6).max(20)      // normalised to E.164 (+230 default) by domain/phone
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
DeliveryDetail= z.discriminatedUnion("fulfilment", [
                  z.object({ fulfilment: z.literal("pickup") }),
                  z.object({ fulfilment: z.literal("delivery"), address: z.string().trim().min(5).max(300), landmark: z.string().max(200).optional() }) ])
```
Per-group limits (required, text max length, quantity min/max) are checked by `domain/pricing.ts` against the product, not by zod.

**Shared output shapes**
```ts
Localized      = { en: string; fr: string | null }        // views call t(localized, locale)
Money          = number                                    // Rs, whole rupees
ProductCard    = { id, slug, type, name: Localized, imageUrl: string | null, fromPriceRs: Money,
                   salePriceRs: Money | null, promoBadge: boolean, soldOut: boolean, allergens: string[] }
PricedLine     = { lineId, productId, name: Localized, options: { label: Localized; priceDeltaRs: Money }[],
                   cakeMessage: string | null, quantity, unitPriceRs: Money, originalUnitPriceRs: Money,
                   lineTotalRs: Money, promotionId: string | null, problem: "sold_out" | "hidden" | "out_of_season" | null }
DayStatus      = { date: MuDate; available: boolean; reason: "blocked" | "closed" | "too_soon" | null }
OrderSummary   = { id, number: string /* "APB-0042" */, status, source, fulfilment, fulfilOn: MuDate,
                   window: { id, start, end, label: Localized }, contactName, totalRs: Money, paid: boolean, itemsPreview: string[] }
OrderEventView = { at: string; actor: { type: "admin" | "customer" | "system"; name: string | null }; type: string;
                   fromStatus: string | null; toStatus: string | null; details: Record<string, unknown> | null }
```

## Root and layout
| Module | Loader output | Auth |
|---|---|---|
| `root.tsx` | `{ locale, banner: { id, title: Localized, text: Localized \| null, href: string \| null } \| null, footer: { whatsapp, phone, email, instagramUrl, pickupAddress, mapUrl }, basketCount: number, turnstileSiteKey, sentryEnabled }` | public |

## Customer site
| Module (path) | Loader input → output | Action intents (input schema → success) | Auth / RL | Req |
|---|---|---|---|---|
| `site/home` (`/`) | → `{ hero: { tagline: Localized, imageUrl }, promoCards: PromoCard[], seasonal: ProductCard[], featured: ProductCard[], gallery: GalleryThumb[6] }` | — | public | FR-004 |
| `site/menu` (`/menu`) | `?type=cake\|cupcake_box\|dessert\|seasonal&allergen=eggless,nut_free` → `{ products: ProductCard[], filters: { types, allergens } }` | — | public | FR-005, FR-006 |
| `site/product` (`/menu/:slug`) | → `{ product: { id, slug, type, name, description, allergens, photos: { url, width, height }[], basePriceRs, salePriceRs \| null, promotionId \| null, optionGroups: { id, name, kind, required, textMaxLength, quantityMin, quantityMax, choices: { id, name, priceDeltaRs }[] }[] }, earliestDate: MuDate, cakeMessageMax, seo: { title, description, imageUrl } }`; 404 if hidden/out of season | `addToBasket`: `BasketLine` minus `lineId` → redirect `/basket` or `{ ok, basketCount }` (fetcher) · errors `VALIDATION_FAILED` (missing required option, text too long), `PRODUCT_UNAVAILABLE`, `BASKET_FULL` | public | FR-007, FR-008 |
| `site/basket` (`/basket`) | → `{ lines: PricedLine[], itemsTotalRs, deliveryFeeRs, windows: { delivery, pickup }, days: DayStatus[90], earliestDate, pickup: { address, mapUrl }, payment: { juiceNumber }, prefill: { contact, addresses[] } \| null, idempotencyKey: Uuid }` | `updateLine` `{ lineId, quantity }` · `removeLine` `{ lineId }` → `{ ok }` · **`placeOrder`** `{ idempotencyKey, displayedTotalRs: Rs, date: MuDate, windowId, ...DeliveryDetail, contact: Contact, acceptPolicies: z.literal("on"), turnstileToken }` → redirect `/order/:token/confirmed` (clears basket cookie) · errors `DATE_UNAVAILABLE`, `PRICE_CHANGED` (+`lines`), `PRODUCT_UNAVAILABLE`, `VALIDATION_FAILED`, `RATE_LIMITED`, `BOT_CHECK_FAILED` | public; `placeOrder` RL-order, **TS** | FR-011..015, FR-018..024 |
| `site/order-confirmed` (`/order/:token/confirmed`) | → `{ number, trackingUrl, offerSaveDetails: boolean, email }` | — | token | FR-025, FR-038 |
| `site/tracking` (`/t/:token`) | → `{ order: OrderSummary & { items: PricedLine[], deliveryFeeRs, address, landmark, customerNote, declineReason, version }, progress: { steps: string[], current: number }, quote: { amountRs, note, expiresOn, canRespond } \| null, canCancel: boolean, whatsappUrl }`; same 404 for wrong token | `cancel` `{ version }` → `{ ok }` · `acceptQuote` `{ version }` → `{ ok }` (status approved) · `declineQuote` `{ version }` → `{ ok }` (closed) · errors `CANCEL_NOT_ALLOWED`, `QUOTE_EXPIRED`, `INVALID_TRANSITION`, `ORDER_CHANGED` | token; RL-track | FR-026, FR-027, FR-031 |
| `site/custom-cake` (`/custom-cake`) | `?fromGallery=<uuid>` → `{ days: DayStatus[90], windows, prefill, attachedGalleryPhoto: { id, url } \| null, idempotencyKey, limits: { photos: 5, maxSourceMb: 10 } }` | `requestUploadUrls` `{ uploadSessionId: Uuid, files: { type: "image/jpeg"\|"image/png"\|"image/webp", size: ≤1_048_576 }[1..5], turnstileToken }` → `{ ok, uploads: { path, signedUrl, token }[] }` (RL-upload) · **`submitCustomRequest`** `{ idempotencyKey, uploadSessionId, photoPaths: string[≤5], galleryPhotoId?, occasion, date, windowId, servings: 1..500, flavours, theme, cakeText ≤ 200, budgetRs?: Rs, details ≤ 2000, ...DeliveryDetail, contact: Contact, acceptPolicies, turnstileToken }` → redirect `/order/:token/confirmed` · errors `UPLOAD_REJECTED`, `DATE_UNAVAILABLE`, `VALIDATION_FAILED`, `RATE_LIMITED` | public; RL-request, **TS** | FR-028..030 |
| `site/gallery` (`/gallery`) | `?occasion=` → `{ photos: { id, url, width, height, caption: Localized \| null, occasion }[], occasions: string[] }` | — | public | FR-009 |
| `site/about`, `site/contact`, `site/faq` | → `{ about \| contact \| faq+policies+privacyNote }` from Settings, localised with EN fallback | — | public | FR-010 |

## Customer accounts
| Module (path) | Loader → output | Action intents | Auth / RL | Req |
|---|---|---|---|---|
| `account/sign-in` (`/account/sign-in`) | `?next=` → `{ next }` | `password` `{ email, password, turnstileToken }` → redirect `next` · `magicLink` `{ email, turnstileToken }` → `{ ok }` (always, no account enumeration) | public; RL-auth, **TS** | FR-034 |
| `account/sign-up` | — | `signUp` `{ name, email, phone, password: min 10, locale, turnstileToken }` → `{ ok }` (confirm email sent) · `EMAIL_IN_USE` shown as generic success + email | public; RL-signup, **TS** | FR-034 |
| `account/reset` | — | `requestReset` `{ email, turnstileToken }` → `{ ok }` · `setPassword` `{ password }` (session from link) → redirect `/account` | public; RL-auth | FR-034 |
| `auth/confirm` (`/auth/confirm`) | `?token_hash&type=magiclink\|recovery\|signup\|email_change&next` → verifies OTP, sets cookies, redirect | — | public | FR-034 |
| `account/profile` (`/account`) | → `{ name, phone, email, locale }` | `updateProfile` `{ name, phone, locale }` → `{ ok }` | customer | FR-035 |
| `account/addresses` | → `{ addresses: { id, label, address, landmark, isDefault }[] }` | `addAddress` / `updateAddress` `{ id?, label, address, landmark?, isDefault }` · `deleteAddress` `{ id }` | customer | FR-035 |
| `account/orders` (`/account/orders`) | → `{ current: OrderSummary[], past: OrderSummary[], trackingUrls: Record<id, string> }` | `reorder` `{ orderId }` → redirect `/basket` with `{ skipped: { name, reason }[] }` flash | customer (own orders only) | FR-036, FR-037 |
| `account/save-details` (`/account/save-details`) | `?t=<tracking token>` → `{ email, name }` | `saveDetails` `{ trackingToken, password: min 10, turnstileToken }` → redirect `/account/orders`; links all orders with that email · `EMAIL_IN_USE` → offer sign-in | token; RL-signup, **TS** | FR-038 |
| `account/sign-out` | — | POST → redirect `/` | customer | — |

## Admin app
All `admin` unless marked **owner**. Every order-mutating intent takes `{ version: Version }` and returns `{ ok: true, order: { status, version } }` or `ORDER_CHANGED` / `INVALID_TRANSITION`. Each success writes an `order_event` with the acting admin and queues the email in PRD Appendix B.

| Module (path) | Loader input → output | Action intents | Req |
|---|---|---|---|
| `admin/login` (`/admin/login`) — public | `?next` | `signIn` `{ email, password }` (RL-auth) → redirect; non-admin or inactive → generic "invalid credentials" | FR-040 |
| `admin/forgot` — public | — | `requestReset` `{ email }` (RL-auth) → `{ ok }` always | FR-040 |
| `admin/invite` (`/admin/invite/:token`) — public | → `{ name, email, role }` or `INVITE_INVALID` | `accept` `{ password: min 10, locale }` → creates auth user + admin, signs in, redirect `/admin` | FR-042 |
| `admin/sign-out` | — | POST → deletes this device's push subscription (optional `endpoint`), redirect `/admin/login` | — |
| `admin/layout` (`/admin`) | → `{ me: { id, name, role, locale }, nav: { ownerItems: boolean }, vapidPublicKey }` | — | FR-047 |
| `admin/today` (`/admin`) | → `{ counts: { toReview, quotesToSend, unpaid }, today: OrderSummary[], tomorrow: OrderSummary[] }` with `nextStatus` + `version` per order | `advance` `{ orderId, version }` | FR-048 |
| `admin/orders` (`/admin/orders`) | `?tab=review\|upcoming\|completed\|closed&q&date&fulfilment&paid=true\|false&cursor&limit` → `{ data: OrderSummary[], nextCursor }` | — | FR-049 |
| `admin/order` (`/admin/orders/:id`) | → `{ order: full order + items + customRequest (with signed photo URLs, 10 min) + version, customer: { id, name, phone, email }, mapsUrl, telUrl, whatsapp: { templates: { key, label }[] }, events: OrderEventView[], allowed: { approve, decline, sendQuote, advance: nextStatus \| null, revert: prevStatus \| null, cancel, edit } }` | `approve` · `decline` `{ reason?: ≤ 500 }` · `sendQuote` `{ amountRs: Rs, note?: ≤ 1000, expiresOn: MuDate ≥ today }` (also re-quote while `quote_sent`) · `advance` `{ to?: ready_for_pickup\|out_for_delivery }` · `revert` (no email) · `cancel` `{ reason? }` · `setPaid` `{ paid: boolean }` · `saveNote` `{ adminNote: ≤ 2000 }` · `whatsappLink` `{ template }` → `{ ok, url }` (no state change) | FR-050..054, FR-073 |
| `admin/order-edit` (`/admin/orders/:id/edit`) | → `{ order, catalogue: product picker data, windows, days: DayStatus[] }` | `save` `{ version, lines: (BasketLine \| { freeText: { name ≤ 120, priceRs: Rs, quantity } })[], fulfilment detail, date, windowId, deliveryFeeRs: Rs, contact, overrideTotalRs?: Rs }` → `{ ok, warnings: ("blocked" \| "too_soon")[] }`; refused if completed | FR-053, FR-056 |
| `admin/order-new` (`/admin/orders/new`) | → same picker data as edit | `findCustomer` `{ phone?, email? }` → `{ ok, customer \| null }` · `create` `{ lines, contact: Contact with email optional, date, windowId, fulfilment detail, deliveryFeeRs, paid: boolean }` → redirect to order; reuses customer by email then phone | FR-055..057 |
| `admin/calendar` (`/admin/calendar`) | `?month=YYYY-MM&view=month\|week\|day&date` → `{ days: { date, delivery: n, pickup: n, blocked: boolean }[], list: OrderSummary[] }` (excludes declined/cancelled/closed) | `blockDay` `{ date, reason?: ≤ 200 }` → `{ ok, existingOrders: OrderSummary[] }` · `unblockDay` `{ date }` (single-day blocks only for Admin) | FR-058, FR-059 |
| `admin/prep` (`/admin/calendar/:date/prep`) | → `{ date, groups: { product: Localized, variants: { label, quantity, messages: string[] }[] }[], shareText }` | — | FR-060 |
| `admin/menu` (`/admin/menu`) | → `{ byType: Record<type, { id, name, status, imageUrl, sortOrder }[]> }` | `reorder` `{ type, ids: Uuid[] }` · `setStatus` `{ id, status }` · `duplicate` `{ id }` → redirect · `delete` `{ id }` | FR-061 |
| `admin/product` (`/admin/menu/new`, `/admin/menu/:id`) | → `{ product \| null, categories, allergenTags, previewUrl }` | `requestUploadUrls` (as customer, bucket `public-images`, no TS) · `save` `ProductInput` = `{ id?, slug, type, category?, name: {en, fr?}, description: {en?, fr?}, basePriceRs, allergens[], noticeDays?: 0..60, status, seasonal?: { startsOn, endsOn }, photos: { path, width, height }[1..5], optionGroups: { id?, name, kind, required, textMaxLength?, quantityMin?, quantityMax?, choices: { id?, name, priceDeltaRs: int }[] }[] }` → `{ ok, id }` | FR-062 |
| `admin/promotions` (`/admin/promotions`) | → `{ promotions: { id, title, status: "scheduled"\|"live"\|"ended"\|"inactive", startsAt, endsAt, placement }[] }` | `setActive` `{ id, active }` · `delete` `{ id }` | FR-063 |
| `admin/promotion` (`/admin/promotions/new`, `/:id`) | → `{ promotion \| null, products: picker }` | `save` `{ id?, title, text, imagePath?, startsAt, endsAt (MU local "YYYY-MM-DDTHH:mm"), active, placement, link: { kind, productId?, category? }, discounts: { productId, kind: "percent"\|"sale_price", percentOff?: 1..99, salePriceRs?: Rs }[] }` | FR-063 |
| `admin/gallery` (`/admin/gallery`) | → `{ photos: { id, url, occasion, caption, sortOrder }[] }` | `requestUploadUrls` · `addPhotos` `{ photos: { path, width, height, occasion? }[≤20] }` · `update` `{ id, occasion?, caption? }` · `reorder` `{ ids }` · `delete` `{ id }` | FR-064 |
| `admin/customers` (`/admin/customers`) | `?q&cursor&limit` → `{ data: { id, name, phone, email, orderCount, totalSpentRs }[], nextCursor }` | — | FR-065 |
| `admin/customer` (`/admin/customers/:id`) | → `{ customer, orders: OrderSummary[] }` | `saveNote` `{ adminNote ≤ 2000 }` | FR-065 |
| `admin/availability` (`/admin/availability`) — **owner** | → `{ defaultNoticeDays, closedWeekdays, deliveryWindows, pickupWindows, blocks: { id, startsOn, endsOn, reason }[], version }` | `saveRules` `{ version, defaultNoticeDays: 0..60, closedWeekdays: 1..7[], deliveryWindows, pickupWindows }` · `addBlock` `{ startsOn, endsOn, reason? }` → `{ ok, existingOrders }` · `removeBlock` `{ id }` | FR-059, FR-066 |
| `admin/settings` (`/admin/settings`) — **owner** | → settings row (minus availability) + `version` + Resend daily usage | `save` `{ version, ...SettingsInput }` → `{ ok }` / `SETTINGS_CHANGED` | FR-067 |
| `admin/sales` (`/admin/sales`) | `?range=week\|month\|last_month\|custom&from&to` → `{ range, revenueRs, orderCount, averageRs, delivery: n, pickup: n, top5: { name, quantity, revenueRs }[], bySource: Record<source, Rs>, unpaid: { id, number, contactName, totalRs }[] }` (revenue = completed orders by `fulfil_on`) | — | FR-068 |
| `admin/sales-csv` (`/admin/sales.csv`) resource | same query → `text/csv; charset=utf-8`, `Content-Disposition: attachment` | — | FR-069 |
| `admin/team` (`/admin/team`) — **owner** | → `{ admins: { id, name, email, role, active, lastSignInAt }[], invites: { id, email, name, role, expiresAt }[] }` | `invite` `{ name, email, role, locale }` · `resendInvite` `{ id }` · `revokeInvite` `{ id }` · `changeRole` `{ adminId, role }` · `deactivate` `{ adminId }` · `reactivate` `{ adminId }` · errors `LAST_OWNER`, `EMAIL_IN_USE` | FR-042..044 |
| `admin/profile` (`/admin/profile`) | → `{ name, email, locale, alertPush, alertEmail, pushDevices: n }` | `updateProfile` `{ name, locale }` · `changePassword` `{ password: min 10 }` · `setAlerts` `{ alertPush, alertEmail }` · `subscribePush` `{ endpoint: url, keys: { p256dh, auth } }` → `{ ok }` · `unsubscribePush` `{ endpoint }` | FR-046, FR-072 |
| static | `/admin/manifest.webmanifest` (scope `/admin/`), `/admin/sw.js` (push + `notificationclick` → `data.url`) | — | FR-047 |

**Push payload** (sent by server, read by `sw.js`): `{ title: string, body: string, url: "/admin/orders/<id>" | "/admin/calendar/<date>/prep", tag: string }` — localised to the admin's `locale`; contains order number and first name only (NFR-004).

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
| `retryEmails` | every tick | send ≤ 50 due outbox rows | row status + `dedupe_key` |
| `expireQuotes` | every tick | `quote_sent` with `quote_expires_on < todayMU` → `closed`, event (system), "Quote closed" email, push | versioned update; already-closed rows skipped |
| `pendingAlerts` | every tick | website `pending_approval` older than 24 h, marker NULL → set `pending_alert_sent_at`, push | marker set in the same update (`… AND pending_alert_sent_at IS NULL RETURNING`) |
| `eveningReminder` | hour of `settings.evening_reminder_at` | push "Tomorrow: n orders" → prep list | `job_run('evening_reminder', todayMU)` |
| `purge` | 03:00 | retention deletes (data-model.md) | delete-by-predicate |

## Frontend review (Phase 3, lead-frontend checklist)
Checked against PRD screens: every page gets its data from one loader (no client waterfalls); date picker gets 90 `DayStatus` entries with reasons (FR-014); product page gets `earliestDate` and server prices so the live price matches (FR-007); checkout errors return the repriced basket to show new prices (FR-015); tracking returns `version`, `canCancel`, `quote.canRespond`; admin order detail returns `allowed` actions so the UI never offers an invalid transition; Today returns `nextStatus` per order. No over-fetching: lists return `OrderSummary`, detail returns the full order. Open request: none.

## Versioning and breaking changes
Internal contract shipped with the UI in one deploy, so there is no API versioning. Breaking changes (removed fields, narrowed inputs) must land in the same commit as both the route module and its view; a change to the push payload or `sw.js` must stay backward-compatible for one release, because installed service workers update lazily.

## Changelog
- 2026-11-10 v0.1 initial contract for all routes, webhook, health and cron jobs.
