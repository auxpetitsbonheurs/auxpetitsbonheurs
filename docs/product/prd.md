<!-- Template: prd | Filled by: /write-prd (product-manager) | Output: docs/product/prd.md -->
# PRD — Aux petits bonheurs ordering website and admin app

Version: 0.1 · Status: draft · Owner: Sabera Shaik Joomun (bakery Owner) · Updated: 2026-11-09
Brief: docs/product/build-brief.md (source of truth; its Business rules win on conflicts), docs/product/feature-plan.md
Rigor: standard (PD-PRD review by product-director pending)

Legend: `[TO CONFIRM]` = unknown or assumed, needs the owner. "Default" values come from the build brief's Defaults table and must be editable in Settings, never hard-coded.

## 1. Problem & context

Aux petits bonheurs is a home bakery in Mauritius selling cakes, cupcake boxes, desserts and seasonal specials. Today orders arrive by hand through Instagram DMs, calls and walk-ins. This is slow, error-prone (dates, prices, options, allergens and cake messages are retyped and misread), has no single view of what must be baked each day, and cannot be shared with helpers.

Evidence: the briefs state that customers mostly arrive from Instagram on phones and that the owner manages everything from her phone. No quantitative baseline exists (orders per week, DM handling time, error rate) `[TO CONFIRM]`.

The product is a bilingual (EN/FR), phone-first public ordering site plus a private installable admin app. It replaces manual order-taking while keeping payment as it is today (Juice or cash on delivery or pickup). The owner stays in control: no website order is confirmed until approved, and any date can be blocked.

Hard constraints (from the briefs):
- Currency: Mauritian rupees, shown "Rs 1,250", whole rupees, no decimals.
- Time zone: Indian/Mauritius (UTC+4) for every date, deadline, promotion window, expiry and reminder.
- No online payment; the app records paid/unpaid only.
- No paid messaging services: customer messages are emails; WhatsApp is only a link that opens a pre-written message.
- Running costs: free plans that allow commercial use for every service; the domain name is the only paid item.
- Ownership: every account and all code belong to the bakery, created with the bakery's own email (see Handover, section 11).
- Standard, widely known, documented tools so any web developer can take over. Technology is chosen later in /setup-stack and is not decided here.

## 2. Users

Personas (no files yet in docs/product/personas/; defined inline, to be extracted later):
- **P1 Customer (guest or account)**: orders cakes and treats from a phone, often arriving from Instagram, in English or French. Wants to see what is available, the earliest date, an honest price, and to know the order status.
- **P2 Owner (Sabera)**: runs the bakery from her phone. Approves orders, sets prices, availability, settings and team.
- **P3 Admin (helper)**: invited by the Owner. Runs orders, calendar, menu, gallery, promotions and sees sales. Cannot open Settings, Availability or Team.

Roles: guest customer, customer with account, Admin, Owner. At least one active Owner must always exist.

Primary job to be done: "When I want a cake or treat for a specific date, I want to order it in a couple of minutes on my phone and know it is confirmed, so I don't have to chat back and forth." For the Owner: "When orders arrive from any channel, I want them in one list and calendar with a prep list, so I never lose or misread one."

## 3. Goals & success metrics

The briefs set no metrics. Targets below are proposed assumptions `[TO CONFIRM]` with the owner and product-director.

| Goal | Metric | Target | Timeframe |
|---|---|---|---|
| North Star: orders flow through the site | Share of all orders (website + custom + manual) recorded in the system | >= 90% | 60 days after launch |
| Customers can self-serve | Share of website orders placed without a follow-up question on WhatsApp/DM (admin-reported sample) | >= 80% | 60 days after launch |
| Checkout works on phones | Checkout completion rate (basket with items -> order sent) | >= 40% `[TO CONFIRM baseline]` | 30 days after launch |
| Owner trust in the data | Orders lost or with wrong price/date due to the system | 0 | Continuous from launch |
| Fast approval | Median time from order placed to Approved/Declined | <= 4 hours during waking hours | 30 days after launch |
| Performance | Home and menu load on mid-range phone over 4G | < 3 s (see NFR-001) | At launch |
| Zero running cost | Monthly recurring cost excluding domain | Rs 0 | Continuous |
| Independence | Owner can change a product, price, photo, date or setting without a developer | 100% of listed tasks | At handover |

## 4. Scope

### MVP (in): one-line user value each
- Bilingual customer site: Home, Menu, Product, Custom cake, Gallery, About, Contact/FAQ, Basket/checkout, Confirmation, Tracking. Value: order anytime from a phone, in EN or FR.
- Products with options, allergens, seasonal dates, per-product notice, live price. Value: correct price and date at order time.
- Availability engine (notice days, closed days, blocked dates, no daily cap). Value: owner never gets an impossible date.
- Promotions (banner, homepage card, automatic sale prices, scheduled). Value: owner promotes without a developer.
- Custom cake requests and quotes with automatic expiry. Value: one flow for bespoke cakes.
- Guest ordering, tracking by private link, self-cancel while pending. Value: no account friction.
- Optional customer accounts: saved details, My orders, Reorder, Save my details. Value: faster repeat orders.
- Admin app (installable, push): Today, Orders, Add order (manual), Calendar and prep list, Menu, Promotions, Gallery, Customers, Sales summary, Availability, Settings, Team, My profile. Value: run the whole bakery from one phone.
- Roles (Owner, Admin) with server-side enforcement and an activity log. Value: safe delegation and accountability.
- Customer emails (EN/FR), admin push + email alerts, evening-before reminder, WhatsApp templates. Value: nobody is left guessing, with no paid messaging.
- Weekly backups to bakery-owned storage, handover documentation.

### Later (candidates, not committed)
- Daily order/cake cap (design must not preclude it).
- Admin roles beyond Owner and Admin (e.g. delivery-only).
- Delivery fees by area or distance.
- Automatic WhatsApp or SMS (needs a paid service).

### Non-goals (this version)
- Online payment (card, automatic Juice).
- Automatic WhatsApp or SMS messages.
- A daily order cap.
- Promo codes, gift cards, loyalty points.
- Customer reviews and ratings.
- Delivery fees by area or distance.
- Taxes, and discounts other than product promotions.
- Customers editing orders themselves.
- A "Fully booked" message (never shown, because there is no cap).

## 5. Functional requirements

Priority: Must / Should / Could. Persona: P1 customer, P2 Owner, P3 Admin (P2/P3 = both). "Acceptance" is Given/When/Then shorthand that maps to tests; each is expanded in feature specs and stories.

### 5.1 Customer site: browsing

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-001 | An EN/FR switch is on every page; it keeps the customer on the same page, is remembered, and is stored on their orders so emails use that language. First visit uses the phone language if French, else English. | Must | P1 | Given phone language fr, when first visit, then site is FR. Given switch on /menu, then /menu in other language. Given order placed in FR, then all its emails are FR. |
| FR-002 | A top promo banner shows while a "top banner" promotion is live; dismissible for that visit; links to its target. | Must | P1 | Given a live banner promotion, then banner shows on every page; when dismissed, it stays hidden for the visit; after promotion end time it never shows. |
| FR-003 | Every page has a footer with WhatsApp, phone, email, Instagram, pickup address, and links to FAQ and policies. All values come from Settings. | Must | P1 | Given Settings values, then footer shows them; changing a setting updates it with no code change. |
| FR-004 | Home shows hero photo and tagline, live promotion cards, seasonal specials (when live), featured products (chosen in Settings), "How it works" in 3 steps, gallery preview, and "Order now" / "Custom cake" buttons. | Must | P1 | Given a live promotion, then its card and banner show; when it ends, both disappear automatically. |
| FR-005 | Menu is a product grid filterable by type (Cakes, Cupcake boxes, Desserts, Seasonal) and allergen (e.g. eggless, nut-free), filters combine; each card shows main photo, name, "from Rs X", sale price and promo badge when relevant, and a Sold out label; hidden products never appear. | Must | P1 | Given type + allergen filters, then only products matching both show. Given a sold-out product, then it cannot be added to basket. Given a hidden product, then it is absent from grid and direct URL is not orderable. |
| FR-006 | Seasonal products appear and can be ordered only between their start and end dates inclusive (Mauritius time). | Must | P1 | Given end date D, then the product is orderable on D and not on D+1. |
| FR-007 | Product page shows swipeable photos (1-5), description, allergen tags with the note that the kitchen handles all allergens, option pickers by kind (pick one, pick several, text, quantity), message-on-cake field with live character count, quantity, live price, "Earliest date: [date]", and Add to basket. | Must | P1 | Given required option unselected, then Add to basket is blocked. Given choices, then displayed price equals the server-computed price. |
| FR-008 | Message-on-cake limit is enforced (default 40 characters, editable per option group). | Must | P1 | Given limit 40, when 41st character typed, then it is rejected client-side and server-side. |
| FR-009 | Gallery shows photos in a grid filtered by occasion, opens full screen with swipe, and each photo has "Request something similar". | Should | P1 | Given the button, then the custom form opens with that photo attached. |
| FR-010 | About, Contact and FAQ pages show content from Settings in the visitor's language (contact buttons, pickup address with map link, FAQ, policies). | Must | P1 | Given FR locale and a missing FR text, then EN text is shown (fallback). |

### 5.2 Pricing, availability and promotions (rules)

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-011 | Item price = (base price + sum of chosen option price changes) x quantity. Order total = sum of items + delivery fee if delivery. No taxes. The server always recalculates; a browser-sent price is never trusted. | Must | P1 | Given a tampered client price, then the stored total equals the server calculation. |
| FR-012 | Prices are copied onto the order when placed; later product price changes never alter existing orders. | Must | P1,P2 | Given an existing order, when product price changes, then the order's totals are unchanged. |
| FR-013 | A date is selectable only if it is not blocked, not a weekly closed day, and at least N calendar days (Mauritius time) after today; N is the largest notice-days among basket items, else the default (2). With 2 days notice, an order on Monday may be for Wednesday or later. | Must | P1 | Given default 2, today Monday, then Tuesday is disabled and Wednesday enabled. Given a basket item with notice 5, then earliest date moves to today+5. |
| FR-014 | There is no daily maximum; no "Fully booked" is shown. The date picker greys out unavailable days and explains why when tapped (blocked, closed day, too soon). | Must | P1 | Given a blocked day, when tapped, then the reason category is shown without the private block reason. |
| FR-015 | At submit the server re-checks date availability, product status (sold out/hidden/seasonal window) and prices. If a date became blocked or a price changed, the order is refused and the customer sees the problem (new price shown). | Must | P1 | Given a date blocked after checkout opened, when sent, then refused with message. Given price change, then new price shown and order not placed until accepted. |
| FR-016 | A promotion is live only between start and end (Mauritius time) and while active; outside that it is invisible and gives no discount. Discount (percentage or fixed sale price per product) applies to base price only, not options or delivery. Original price is struck through next to the sale price. | Must | P1,P3 | Given promo ending 18:00, then at 17:59 sale price is charged and at 18:00 it is not. |
| FR-017 | When several live promotions discount the same product, the lowest price applies; discounts never stack. The applied promotion is recorded on the order item. No promo codes. | Must | P1 | Given two live promos, then the lowest price is used and the order item references that promo. |

### 5.3 Checkout, orders and tracking

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-018 | Basket and checkout is one page: basket (edit/remove, subtotal), delivery or pickup, date, time window, details, summary, send. Basket icon with item count is in the top bar. | Must | P1 | Given 2 items, then both appear with options and subtotal; edit/remove works. |
| FR-019 | Pickup shows the public pickup address and map link. Delivery asks for full address and a landmark note and adds the flat delivery fee (Default Rs 200, editable). The Owner/Admin may decline or adjust a too-far address on review. | Must | P1 | Given delivery, then fee is added to total; given pickup, then no fee. |
| FR-020 | Time windows (Default Morning 9:00-12:00, Afternoon 12:00-17:00, Evening 17:00-20:00) are chosen from Settings; delivery and pickup may differ. | Must | P1 | Given edited windows in Settings, then checkout shows the new ones. |
| FR-021 | Customer details: name, phone, email, optional note. Phone stored in international format (+230 when no code). Signed-in customers get details and saved addresses prefilled. | Must | P1 | Given "5712 3456", then stored as +23057123456. |
| FR-022 | Customer must tick acceptance of the short policies before sending; summary shows items, delivery fee, total and payment information (Juice or cash on delivery/pickup). | Must | P1 | Given box unticked, then Send is blocked. |
| FR-023 | A double tap or repeated submit creates only one order (idempotent submit). | Must | P1 | Given two rapid submits, then exactly one order exists. |
| FR-024 | Sending creates an order with status Pending approval, a sequential number (APB-0001, APB-0002...) and a long random tracking token separate from the number. | Must | P1 | Given two orders, then numbers are consecutive; token not derivable from number. |
| FR-025 | Confirmation screen shows order number, a "not confirmed until approved" notice and the tracking link. | Must | P1 | Given order sent, then all three are shown. |
| FR-026 | Tracking page (private token link, works signed out) shows items, date, window, delivery/pickup, total, paid status, status progress bar, bakery messages and a WhatsApp button. For quotes: amount, note, expiry, Accept/Decline. A wrong token shows "not found". | Must | P1 | Given a valid token signed out, then page loads; given a wrong token, then "not found". |
| FR-027 | Customers can cancel only while an order is Pending approval or Quote needed; the Cancel button disappears afterwards and the page tells them to contact the bakery on WhatsApp. Customers cannot edit orders. | Must | P1 | Given Pending approval, then cancel works; given Approved, then no Cancel button and cancel call is refused by the server. |

### 5.4 Custom requests and quotes

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-028 | Custom cake form: occasion, date (same availability rules), servings, flavours, theme/colours, text on cake, up to 5 reference photos, optional budget, delivery or pickup, contact details and details. | Must | P1 | Given the form submitted, then the request appears in admin within seconds with its photos and the customer receives "Request received". |
| FR-029 | Photo uploads accept JPEG, PNG, WebP and HEIC (converted), max 10 MB each, up to 5, shrunk before upload; other files are rejected. | Must | P1,P3 | Given a PDF, then rejected; given an 8 MB HEIC, then stored as a compressed image. |
| FR-030 | A new custom request has status Quote needed. Admin can send a quote (full order total including delivery if chosen, optional note, expiry default today + quote validity days (3)) or decline with optional reason. | Must | P2,P3 | Given Send quote, then status Quote sent and customer gets "Your quote". |
| FR-031 | Customer accepts or declines the quote from the email link or tracking page. Accept makes the order Approved. An expired quote cannot be accepted. | Must | P1 | Given an expired quote, then Accept is refused. Given accept, then order is Approved and appears on the calendar. |
| FR-032 | Quotes past expiry move to Closed automatically, at least once a day, with a "Quote closed" email and a push to admins. | Must | P2,P3 | Given quote expiry passed, then within 24 h status is Closed. |
| FR-033 | While Quote sent, admin can re-send a new quote that replaces the old one. | Should | P2,P3 | Given a new quote, then the old link/amount can no longer be accepted. |

### 5.5 Customer accounts

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-034 | Customers can sign up and in with email + password or a one-time email link, and reset a password. Account is optional; no one needs one to order. | Must | P1 | Given a guest, then an order can be placed without an account. |
| FR-035 | Account has profile, saved addresses and email language. | Should | P1 | Given a saved address, then checkout offers it. |
| FR-036 | My orders lists current and past orders with status. | Should | P1 | Given 3 orders, then all listed with status. |
| FR-037 | Reorder puts a past order's items in the basket at today's prices, skipping unavailable items with a note. | Should | P1 | Given a sold-out item, then it is skipped with a note and others are added at current prices. |
| FR-038 | After a guest order, "Save my details" creates an account with a password and links past orders made with the same email. | Should | P1 | Given prior orders with same email, then they appear in My orders. |
| FR-039 | A customer account cannot open any admin page or data. | Must | P1 | Given a customer session, when opening /admin, then refused. |

### 5.6 Admin: access, team, roles

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-040 | Admin sign-in with email + password, forgot-password, sessions staying signed in 30 days on a phone. | Must | P2,P3 | Given sign-in, then still signed in after 29 days. |
| FR-041 | Roles are enforced on the server for every action and data read; Owner-only screens (Availability, Settings, Team) are hidden from Admins and blocked even by typed address. | Must | P2,P3 | Given Admin session, when calling an Owner endpoint or URL, then refused. |
| FR-042 | Owner can invite an admin (name, email, role); invitation email in EN or FR with a set-password link valid 7 days, resendable. | Must | P2 | Given an invite, then link works within 7 days and fails after; resend issues a new link. |
| FR-043 | Owner can change role (Admin/Owner), deactivate (blocks sign-in at once, keeps name on past actions) and reactivate. | Must | P2 | Given deactivation, then the admin's session is ended immediately and the log still shows their name. |
| FR-044 | The last active Owner cannot be deactivated or changed to Admin. | Must | P2 | Given one active Owner, when attempting either, then refused. |
| FR-045 | Every order change is saved as an order event (who: admin/customer/system, what, when, details) and shown as an activity log on the order (e.g. "Approved by Sarah, 12 Nov 14:05"). | Must | P2,P3 | Given any action, then an event is stored and visible. |
| FR-046 | My profile: name, password, language, and per-admin switches for push and email alerts. | Must | P2,P3 | Given alerts off, then that admin receives none. |
| FR-047 | The admin app is installable to the home screen with icon and push notifications, built for one-handed phone use with bottom bar Today, Orders, Calendar, Menu, More. | Must | P2,P3 | Given install on iPhone and Android, then a test push arrives. |

### 5.7 Admin: orders

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-048 | Today shows counts (to review, quotes to send, unpaid approved-or-later) and today's and tomorrow's orders sorted by window with main items, delivery/pickup and a one-tap next-status button. | Must | P2,P3 | Given seeded orders, then counts equal the underlying data. |
| FR-049 | Orders has tabs To review (Pending approval, Quote needed), Upcoming, Completed, Cancelled/Declined/Closed; search by name, phone or order number; filters by date, delivery/pickup, paid. | Must | P2,P3 | Given a phone number search, then matching orders show. |
| FR-050 | Order detail shows all order data, address with "Open in Maps", Call and WhatsApp buttons, custom request photos, private admin note, activity log. | Must | P2,P3 | Given a delivery order, then the Maps link opens the address. |
| FR-051 | Status transitions follow exactly the table in the build brief (see Appendix B), enforced on the server; invalid transitions are refused. | Must | P2,P3 | Given Completed order, when Cancel attempted, then refused. |
| FR-052 | Admin actions: Approve, Decline (optional reason), Send quote, Next status, Back one step (no email), Mark paid/unpaid (any status; records who/when), Edit, Cancel (Approved or later, not Completed). | Must | P2,P3 | Each action produces the right status, email (or none), and event. |
| FR-053 | Admin can edit any field of any order not Completed; the total is recalculated unless overridden; every edit is logged. | Must | P2,P3 | Given an edit of item quantity, then total recalculates and an event stores before/after. |
| FR-054 | Two admins acting on the same order cannot conflict; the second sees "this order changed, reload". | Must | P2,P3 | Given stale version, when submitting an action, then rejected with that message. |
| FR-055 | Manual order: pick products/options or add free-text item with price; customer name, phone, optional email, date, window, delivery/pickup, editable delivery fee, paid yes/no. Saves as Approved, source manual. | Must | P2,P3 | Given save, then order appears Approved in calendar and prep list. |
| FR-056 | Manual orders and edits ignore availability rules but warn if the date is blocked or too soon. | Must | P2,P3 | Given a blocked date, then a warning shows and save is still possible. |
| FR-057 | Manual order finds an existing customer by phone or email instead of creating a duplicate; sends the confirmation email only if an email was entered. | Must | P2,P3 | Given existing phone, then no new customer record. |

### 5.8 Admin: calendar, content, reporting

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-058 | Calendar: month view with order counts per day, week and day lists; delivery/pickup colour-coded; blocked days greyed; cancelled/declined/closed excluded. | Must | P2,P3 | Given a cancelled order, then it is not counted. |
| FR-059 | Admin can block/unblock a single day from the calendar; Owner can block ranges with a private reason in Availability. Blocking applies immediately to new customer orders. Existing orders on that date are unaffected, and the admin sees a warning listing them. | Must | P2,P3 | Given blocked day, then customer date picker disables it immediately. |
| FR-060 | Prep list for a day: items grouped by product, then size and flavour, with quantities and messages on cakes; shareable and printable. | Must | P2,P3 | Given 2 identical cakes, then one line with quantity 2. |
| FR-061 | Menu management: list by type, drag to reorder; create, edit, duplicate, hide, mark sold out. | Must | P2,P3 | Given sold out, then customers see the label and cannot order. |
| FR-062 | Product editor: EN/FR names/descriptions, 1-5 ordered photos (camera-roll upload, shrunk before upload), base price, notice days, allergen tags, category, option groups (pick one/several/text/quantity; required; limits) and choices with price change (can be Rs 0), seasonal dates. "Preview as customer" button. | Must | P2,P3 | Given a new cake with sizes, flavours, add-ons and message field, then it is creatable on a phone in under 5 minutes. |
| FR-063 | Promotions management: list with status (scheduled, live, ended, inactive); create/edit title and text EN/FR, optional image, start/end, placement (banner, card, both), link (product, category, custom form), optional discounted products, active switch to end early. | Must | P2,P3 | Given a scheduled promotion, then it goes live and ends with no admin action. |
| FR-064 | Gallery management: upload several photos at once, tag by occasion, optional caption EN/FR, reorder, delete. | Must | P2,P3 | Given 5 photos selected, then all upload. |
| FR-065 | Customers: searchable list with order count and total spent, each customer's orders, private note per customer. | Should | P2,P3 | Given a customer, then totals equal their orders. |
| FR-066 | Availability (Owner): default notice days, weekly closed days, time windows, blocked dates/ranges with reasons. | Must | P2 | Given Admin, then screen is blocked. |
| FR-067 | Settings (Owner): delivery fee, pickup address and map link, contact details, Juice number, Instagram, homepage banner and featured products, About, FAQ, policies, WhatsApp templates, quote validity, all EN/FR where relevant. All Defaults are editable here. | Must | P2 | Given a changed value, then the site reflects it without deployment. |
| FR-068 | Sales summary for this week, this month, last month or custom range: revenue from Completed orders, order count, average order, delivery vs pickup, top 5 products, revenue by source, unpaid list with amounts. Visible to Admins and Owner. | Must | P2,P3 | Given test orders, then totals match the orders. |
| FR-069 | Sales summary can be exported as CSV. | Should | P2,P3 | Given export, then CSV totals equal the screen. |

### 5.9 Notifications

| ID | Requirement | Pri | Persona | Acceptance |
|---|---|---|---|---|
| FR-070 | Automatic customer emails, in the order's language (EN and FR), sent on the events in Appendix B / the build brief email table: order received, request received, your quote, order confirmed, order/request declined, cancellation confirmed, quote closed, ready/on the way, thank you, sign-in link, password reset. | Must | P1 | Given each event in each language, then the right email arrives with required content. |
| FR-071 | Email content: Order received (number, items, date, window, total, "not confirmed yet", tracking link); Your quote (amount, note, expiry, Accept/Decline buttons); Order confirmed (full summary, payment reminder with Juice number or cash, pickup address or delivery details, tracking link); Thank you (link to order again and Instagram). Emails are readable on a phone and carry bakery name and colours. | Must | P1 | Per email checklist in the launch test. |
| FR-072 | Admin push + email alerts for: new website order, new custom request, quote accepted/declined, customer cancelled. Push only: 18:00 evening-before reminder with tomorrow's count and prep-list link; quote expiry. Respect per-admin preferences. Tapping a push opens the relevant order or day. | Must | P2,P3 | Given alerts on, then an admin receives push and email for a new order. |
| FR-073 | WhatsApp button opens a chat with the customer's number and a pre-filled editable message from a template in the order's language. Templates: Order approved, Ready for pickup, On the way, Payment reminder (Juice number and total), Blank; placeholders {name}, {order_number}, {date}, {window}, {total}, {juice_number}, {pickup_address}, {tracking_link}; edited in Settings. | Must | P2,P3 | Given each template in EN and FR, then placeholders resolve. |
| FR-074 | If an email fails, the order is still saved, admins are still alerted, and failed emails are retried. | Must | P1,P2 | Given email provider outage, then order exists and retry succeeds later. |

## 6. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-001 | Performance | Home and menu load in under 3 s on a mid-range phone over 4G. project.yaml budgets also apply: Lighthouse perf >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, initial JS <= 170 kB gzipped per route. Images are resized/compressed automatically and lazy-loaded; max image 250 kB (project.yaml) – see Risk R9. |
| NFR-002 | Accessibility | WCAG 2.2 AA (project.yaml); Lighthouse accessibility >= 95. Readable contrast, labels on every form field, alt text (product name by default), keyboard-usable checkout. Tap targets >= 44 px. |
| NFR-003 | Security | Admin pages and data protected on the server; role checked on every action; uploads images only with size limit; spam protection on public forms without puzzles; tracking tokens long and random; rate limits on sign-in, signup, password reset, public forms and email-sending endpoints; webhooks, if any, idempotent. |
| NFR-004 | Privacy | Customer data visible only to admins. Emails contain only necessary personal data. A short privacy note explains what is collected and why. No tracking cookies requiring a consent banner. `privacy.regions` in project.yaml is empty; the applicable regime is Mauritius Data Protection Act 2017 `[TO CONFIRM]`. Retention periods `[TO CONFIRM]`. |
| NFR-005 | Reliability / availability | An order is never lost. Automatic weekly backups of all data and photos to storage the bakery owns, with a tested restore. Keep-alive check if a free-plan service pauses on inactivity. Uptime target `[TO CONFIRM]` (proposed: best effort on free plans; no paid SLA). |
| NFR-006 | Browsers/devices | Design for 375 px wide first, then tablet and desktop. No sideways scroll. Correct keyboards for phone/email/number fields. Last 2 versions of Safari iOS, Chrome Android, and desktop Chrome/Safari/Firefox/Edge. Admin push verified on iPhone and Android. |
| NFR-007 | i18n | Locales en and fr. No hard-coded customer-facing text: every label, error, email and template has EN and FR; a missing FR text falls back to EN. Customer-visible data fields are stored in both languages. Note: project.yaml `i18n.locales` is `[en]` and must be updated to `[en, fr]`. |
| NFR-008 | Locale formats | Currency "Rs 1,250" (whole rupees); all dates, deadlines, promotion windows, quote expiries and reminders in Indian/Mauritius (UTC+4). |
| NFR-009 | Cost | Everything runs on free plans that allow commercial use; the only paid item is the domain. Stay within free limits (about 100 emails/day, 1 GB photos). Photos compressed to roughly 300 kB or less. |
| NFR-010 | SEO / sharing | Titles, descriptions and share previews (photo and title) for home, menu and product pages; Lighthouse SEO >= 95. |
| NFR-011 | Analytics | Optional privacy-friendly free visitor count; no tracking cookies requiring consent. |
| NFR-012 | Maintainability / ownership | Widely known tools; README explains services, local run, deploy, backup restore and every setting; staging and live sites with automatic deploys; all secrets in the bakery's accounts, none only on a developer machine. |
| NFR-013 | Data integrity | Sequential order numbers with no gaps from concurrency; optimistic concurrency on orders (FR-054); every status change stored as an event. |

## 7. Key user journeys

Critical journeys are those Playwright e2e tests must protect.

1. **J1 Guest delivery order**: open Menu on a phone -> choose a cake with options -> basket -> delivery + date + window + details + accept policies -> send -> confirmation with number and tracking link -> email received (critical: yes). Maps FR-005..008, 011..027, 070.
2. **J2 Pickup order**: same with pickup, no fee (critical: yes). FR-018..025.
3. **J3 Cancel while pending, and no cancel after approval**: tracking link -> Cancel -> cancelled; separate order approved -> Cancel button gone (critical: yes). FR-027, 051.
4. **J4 Owner approves and fulfils an order**: push/email alert -> To review -> Approve -> In preparation -> Ready/Out for delivery -> Completed, marked paid; each step logged and emailed (critical: yes). FR-045, 048..054, 070, 072.
5. **J5 Custom cake request to order**: gallery "Request something similar" -> form with photos -> admin sends quote -> customer accepts -> Approved order on calendar; variant: quote expires and cannot be accepted (critical: yes). FR-009, 028..033.
6. **J6 Manual order**: admin Add order -> existing customer matched -> Approved -> visible in calendar and prep list (critical: yes). FR-055..060.
7. **J7 Promotion lifecycle**: scheduled promotion goes live (banner, card, struck-through price, charged price) and ends automatically (critical: yes). FR-016, 017, 063.
8. **J8 Availability**: admin blocks a day -> customer cannot pick it; date blocked mid-checkout -> order refused; longer-notice product moves the earliest date (critical: yes). FR-013..015, 059.
9. **J9 Admin onboarding and roles**: Owner invites admin -> admin sets password and signs in -> cannot open Owner screens -> Owner deactivates admin -> signed out at once (critical: yes). FR-041..044.
10. **J10 Returning customer**: guest "Save my details" -> account -> sign in -> My orders -> Reorder (critical: no). FR-034..038.
11. **J11 Evening reminder and prep**: 18:00 push -> tap -> day's prep list shared/printed (critical: no). FR-060, 072.
12. **J12 Bilingual**: switch FR on any page; order in FR; every email in FR (critical: yes). FR-001, 070.

## 8. Monetisation

None. Revenue is the bakery's product sales, paid outside the app (Juice or cash). No platform fees, plans or paid features. See non-goals.

## 9. Integrations & dependencies

Providers are not chosen here (decided in /setup-stack and ADRs); constraints only:
- Transactional email: free plan allowing commercial use, ~100 emails/day, EN/FR templates, retry on failure.
- Web push for the installable admin app (iPhone and Android), free.
- Hosting/database/file storage on free commercial-use plans, with staging and live environments, automatic deploys, bakery-owned weekly backups, and a keep-alive if the plan pauses.
- Authentication for customers (password and email link) and admins (password, invitation, 30-day sessions).
- Scheduled jobs: quote expiry (>= daily), 18:00 Mauritius reminder, promotion going live/ending, email retries, backups, keep-alive.
- WhatsApp: `wa.me`-style link only; no API. Google Maps: link only.
- Domain name: bought by the bakery (only paid item); name `[TO CONFIRM]`.
- No payment provider, no SMS provider, no paid AI.

## 10. Risks & assumptions

| ID | Risk / assumption | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Free-plan limits (emails ~100/day, 1 GB photos, service pauses) cause lost notifications or downtime | Med | High | Image compression, email retry queue, keep-alive job, usage monitoring, Settings-visible quota notes |
| R2 | Owner approval is slow, so customers wait on unconfirmed orders | Med | High | Push + email alerts, Today counts, clear "not confirmed" copy, median-approval metric |
| R3 | Push on iOS requires the installed home-screen app; owners may not install | Med | High | Onboarding walkthrough at handover; email alert as fallback; test on real iPhone |
| R4 | Time-zone/notice-day errors produce wrong availability | Med | High | All rules in Indian/Mauritius time; boundary tests (Monday example, midnight, promo end) |
| R5 | Price drift between browser and server | Low | High | Server-side recalculation; live price equals server price test |
| R6 | Allergen mistakes harm a customer | Low | High | Allergen tags + kitchen note on every product page; allergen copy reviewed by the owner |
| R7 | Concurrent admin edits overwrite each other | Med | Med | Optimistic concurrency (FR-054) |
| R8 | Content (photos, translations, policies) arrives late and blocks phase 6/7 | Med | Med | Sample data first; owner content checklist with dates `[TO CONFIRM]` |
| R9 | Briefs disagree on image size (300 kB vs 250 kB budget) and speed (3 s vs LCP 2.5 s) | Low | Low | Stricter project.yaml values apply unless the owner decides otherwise |
| R10 | Personal-data obligations (Mauritius DPA 2017) not yet reviewed | Med | Med | Privacy note, minimal data in emails, confirm regime and retention `[TO CONFIRM]` |
| R11 | Customer cannot reach owner when a quote or order is stuck (no daily cap, no auto-expiry of Pending approval) | Med | Med | Today "To review" count; consider auto-reminder `[TO CONFIRM]` |

Assumptions:
- A1 Defaults table values (2-day notice, no closed days, three windows, Rs 200 fee, 3-day quote validity, 40-character message limit, 18:00 reminder, APB- prefix, placeholder brand look) hold until the owner confirms.
- A2 Admins can see Sales summary and create/edit promotions (the briefs' role table says yes; confirmation still open).
- A3 Pending approval orders do not auto-expire (not specified).
- A4 Payment method is shown as information in the summary and emails; it is not a stored order field (the Order record has only paid yes/no).
- A5 A customer cannot cancel in Quote sent; they can Decline, which moves it to Closed.
- A6 Builder stays on as a team member for a 3-month aftercare.

## 11. Release plan

Seven build phases, each ending with "done when" checks that must all pass before the next. No calendar dates in the briefs `[TO CONFIRM]`.

| Phase | Scope | Exit criterion (done when) |
|---|---|---|
| 1 Foundations | Accounts under bakery email, staging + live, auto-deploy, README started, data records, EN/FR text system, Mauritius time and rupee formatting, admin sign-in, Owner, roles, Team | Owner invites an Admin by email, the Admin signs in, and the Admin cannot open Owner screens. |
| 2 Menu and content management | Menu, Gallery, Settings, Availability, Promotions; sample data (8 products over 4 types, 12 gallery photos, 1 live + 1 scheduled promotion) | An admin creates a cake with sizes, flavours, add-ons and a message field from a phone in under 5 minutes. |
| 3 Customer site and checkout | All customer pages, basket, checkout with availability and pricing rules, confirmation, tracking with cancel, promotion display | A guest places a 2-item delivery order on a phone, cancels it from tracking, and every Availability, Pricing and Promotions business-rule check passes. |
| 4 Order management | Today, Orders and log, manual orders, Calendar and prep list, custom requests and quotes (auto-expiry), Customers, Sales summary | One order of each source (website, custom, manual) goes start to Completed by two different admins, and the log shows who did each step. |
| 5 Notifications and accounts | All customer emails EN/FR, admin push + email with preferences, evening reminder, WhatsApp templates, customer accounts, Reorder, Save my details | Every row of the email table arrives correctly in both languages, and a push reaches the installed admin app on iPhone and Android. |
| 6 Real content and polish | Real products, photos, texts, translations; visual identity; share previews; privacy note; speed and accessibility | Quality requirements (section 6) met on a real mid-range phone. |
| 7 Testing, launch, handover | Full test pass on the owner's phone (Appendix A), domain, backup, launch, walkthrough, handover list | Owner placed a real test order as a customer and approved it as admin on her own phone, and every Handover item is ticked. |

Milestones: MVP = end of phase 5 on sample data (usable internally); beta = phase 6 with owner and a few trusted customers; launch = phase 7 done. Dates `[TO CONFIRM]`.

Handover checklist (must all be ticked at launch): all service accounts on the bakery's own email; two-step sign-in handed over to the bakery (phone or shared password manager); domain registered to Aux petits bonheurs with auto-renew and the bakery's card; secrets in the bakery's accounts; README (what each service does, run locally, deploy, restore backup, every setting); one-page handover sheet (service, purpose, login location, yearly cost); weekly backups to bakery storage with a tested restore; code, design and content stated to belong to Aux petits bonheurs; builder remains a team member for 3 months aftercare then removable by the Owner.

## 12. Open questions

For the owner (carried from the briefs):
1. Delivery fee amount, pickup address, Juice number. Default Rs 200 is a placeholder. — owner Sabera
2. Notice period, closed days, time windows: are the defaults right (2 days, none, 9-12/12-17/17-20)? — owner Sabera
3. Cancellation policy after approval, and cake storage advice (for FAQ/policies). — owner Sabera
4. Confirm Admins can see the Sales summary. — owner Sabera
5. Confirm Admins can create and edit promotions. — owner Sabera
6. Domain name. — owner Sabera
7. Should the Juice number appear in the approval email and the WhatsApp payment reminder? (build brief says yes; feature plan asks.) — owner Sabera
8. Quote validity 3 days correct? — owner Sabera

Gaps found by product-manager (proposed answers in assumptions):
9. Success-metric targets and baseline order volume (section 3). — owner Sabera / product-director
10. Launch date and phase dates. — owner Sabera / producer
11. Should Pending approval orders ever auto-expire or trigger a reminder to admins? (A3, R11) — owner Sabera
12. Applicable privacy regime (Mauritius DPA 2017?), data retention, who is the data controller. — owner Sabera
13. Which admin(s) beyond the Owner exist at launch, and their languages. — owner Sabera
14. Brand identity (placeholder: cream, one pastel accent, rounded serif headings, sans-serif text). — owner Sabera / design-director
15. Is payment method (Juice vs cash) a captured field or information only? (A4) — owner Sabera
16. project.yaml updates needed before design: `i18n.locales: [en, fr]`, `privacy.regions`. — product-director / user

## Appendix A: Launch test checklist (traceability)

| Check | Requirements |
|---|---|
| Order with delivery, and order with pickup | FR-018, 019, 024, 025 |
| Order for a date blocked after checkout opened is refused | FR-015, 059 |
| Product with longer notice moves the earliest date | FR-013 |
| Promotion price shows and is charged, then disappears after end time | FR-016, 017, 063 |
| Custom request, quote, accept, and expired quote cannot be accepted | FR-028..032 |
| Customer cancels while pending; cancel button gone after approval | FR-027 |
| Manual order shows in calendar and prep list | FR-055, 058, 060 |
| Owner-only screens hidden and blocked for an Admin | FR-041, 066, 067 |
| Deactivated admin is signed out | FR-043 |
| All emails in EN and FR, all WhatsApp templates | FR-070, 071, 073 |
| Sales summary totals match the orders | FR-068 |
| Backup runs and can be restored | NFR-005 |

## Appendix B: Order status transitions (enforced by FR-051)

| From | To | Who | Customer email |
|---|---|---|---|
| (new website order) | Pending approval | Customer | Order received |
| Pending approval | Approved | Admin | Order confirmed |
| Pending approval | Declined | Admin (optional reason) | Order declined |
| Pending approval | Cancelled | Customer (tracking page) or admin | Cancellation confirmed |
| (new custom request) | Quote needed | Customer | Request received |
| Quote needed | Quote sent | Admin | Your quote |
| Quote needed | Declined | Admin | Request declined |
| Quote needed | Cancelled | Customer or admin | Cancellation confirmed |
| Quote sent | Approved | Customer accepts | Order confirmed |
| Quote sent | Closed | Customer declines, or quote expires | Quote closed |
| (new manual order) | Approved | Admin | Order confirmed, only if email entered |
| Approved | In preparation | Admin | none |
| In preparation | Ready for pickup / Out for delivery | Admin | Ready / On the way |
| Ready / Out for delivery | Completed | Admin | Thank you |
| Approved or later (not Completed) | Cancelled | Admin only | Cancellation confirmed |

Rules: Back one step by an admin sends no email. Paid/unpaid is a separate flag at any status. Every change is an order event.

## Changelog
- 2026-11-09 v0.1 draft by product-manager from build-brief.md and feature-plan.md.
