# Aux petits bonheurs — Build Brief

Nov 9, 2026 · @Sabera Shaik Joomun

## The brief

Build a bilingual (English / French), phone-first ordering website for **Aux petits bonheurs**, a home bakery in Mauritius. It has a public customer site and a private admin app that a small team of admins uses to run orders. This brief describes **what** to build and how to know it's done. The technology choices are up to the builder, within the ground rules below.

**How to use this doc**

- Build in the order of **Build phases**. Each phase ends with "done when" checks that must all pass before moving on.
- **Business rules** are the source of truth when a screen description seems to disagree.
- Where a detail isn't specified, choose the simplest option that fits these rules, note it in the README, and carry on. Don't stop for minor decisions.
- Use the values in **Defaults** until the owner confirms them. They must all be editable in Settings, never hard-coded.

**Ground rules**

- **Currency:** Mauritian rupees, shown as "Rs 1,250" with whole rupees and no decimals.
- **Time zone:** Indian/Mauritius (UTC+4) for every date, deadline and reminder.
- **No online payment.** Payment is by Juice or cash on delivery or pickup. The app only records paid or unpaid.
- **No paid messaging services.** Customer messages are emails. WhatsApp is only a link that opens a pre-written message for an admin to send.
- **Running costs:** everything must run on free plans that allow commercial use. The only paid item is the domain name.
- **Ownership:** every account and all code belong to the bakery (see Handover).
- **Standard and documented:** use widely known tools, so any web developer can take over later.

## Users and roles

There are three kinds of user. Admins have one of two roles, and there must always be at least one Owner.

| Area | Guest customer | Customer with account | Admin | Owner |
| --- | --- | --- | --- | --- |
| Browse, order, send custom requests | Yes | Yes | — | — |
| Track own orders, cancel while pending | Yes (by link) | Yes | — | — |
| Saved details, order history, reorder | — | Yes | — | — |
| Orders: approve, decline, quote, statuses, edit, mark paid, WhatsApp | — | — | Yes | Yes |
| Add manual orders | — | — | Yes | Yes |
| Calendar, prep list, block or unblock a single day | — | — | Yes | Yes |
| Menu, gallery and promotions | — | — | Yes | Yes |
| Customers list | — | — | Yes | Yes |
| Sales summary | — | — | Yes | Yes |
| Settings: availability rules, delivery fee, texts, templates | — | — | No | Yes |
| Manage admins: invite, change role, remove | — | — | No | Yes |

**Managing admins (Owner only)**

- **Invite:** enter a name, email and role. The person gets an invitation email (EN or FR) with a link to set a password. The link expires after 7 days and can be resent.
- **Change role** between Admin and Owner.
- **Deactivate:** blocks sign-in at once and keeps their name on past actions. They can be reactivated later.
- **Last-owner protection:** the last active Owner can't be deactivated or changed to Admin.
- **Activity log:** every order records who did what and when, e.g. "Approved by Sarah, 12 Nov 14:05". It is shown on the order.
- **Per-admin alerts:** each admin chooses whether they get push and email alerts for new orders and quotes. They see this in their own profile, together with their name, password and language.

## Data the app keeps

These are the records and the fields each one needs. Any text a customer sees is stored in both English and French.

| Record | Key fields |
| --- | --- |
| Product | type (cake, cupcake box, dessert, seasonal), name EN/FR, description EN/FR, photos (1–5, ordered), base price, category, allergen tags, notice days (optional, overrides the default), status (available, sold out, hidden), sort order, seasonal start and end dates |
| Option group | product, name EN/FR, kind (pick one, pick several, text, quantity), required yes/no, text character limit, quantity min/max, sort order |
| Option choice | option group, name EN/FR, price change (Rs, can be 0), sort order |
| Order | number (e.g. APB-0042), source (website, custom request, manual), status, customer, delivery or pickup, address and landmark note, date, time window, items, delivery fee, total, paid yes/no, customer note, private admin note, language, tracking token, created at |
| Order item | order, product (or free-text name for manual items), chosen options with their prices, message on cake, quantity, line total |
| Custom request | the request answers (occasion, servings, flavours, theme, text, budget), reference photos (up to 5), linked order, quote amount, quote note, quote expiry, status |
| Order event | order, who (admin, customer or system), what (e.g. approved, status changed, marked paid, edited), when, details |
| Customer | name, phone, email, language, saved addresses, account yes/no, created at |
| Admin | name, email, role (Owner, Admin), active yes/no, alert preferences, language, last sign-in |
| Gallery photo | image, occasion tag, caption EN/FR (optional), sort order |
| Blocked date | date or date range, reason (private), created by |
| Settings | one record: default notice days, weekly closed days, time windows (delivery and pickup), delivery fee, pickup address and map link, contact details, Juice number, Instagram link, homepage banner and featured products, About, FAQ and policies EN/FR, WhatsApp templates EN/FR, quote validity days |

**Promotion** (an extra record): title EN/FR, short text EN/FR, optional image, start and end date and time, active yes/no, where it shows (top banner, homepage card, or both), optional link (a product, a category or the custom-cake form), and optionally a set of products with a discount (percentage, or a fixed sale price per product).

Prices on an order are copied at the time it is placed. Changing a product's price later must not change existing orders.

## Business rules

These rules decide what customers can do and how orders move. The app must enforce them, not just display them.

**Availability**

- A date can be chosen only if all of these are true: it is not a blocked date, not a weekly closed day, and at least N days after today. N is the largest notice-days value among the items in the basket, or the default if no item sets one.
- Notice counts calendar days in Mauritius time. With a 2-day notice, an order placed any time on Monday can be for Wednesday or later.
- There is **no daily maximum** on orders or cakes.
- Blocking a date doesn't affect orders already booked for it. The admin sees a warning listing them.
- Admins can choose any date for manual orders and edits, ignoring these rules, but they get a warning if the date is blocked or too soon.

**Promotions**

- A promotion is live only between its start and end (Mauritius time) and while it is active. Outside that window it is invisible and gives no discount.
- When a live promotion discounts a product, the discount applies to the base price only, not to options or delivery. The product shows the original price struck through, next to the sale price.
- If several live promotions discount the same product, the customer gets the lowest price. Discounts never stack.
- The discounted price is copied onto the order like any other price, and the order item records which promotion applied.
- There are no promo codes in this version. Promotions apply automatically.

**Pricing**

- Item price = (base price + the price change of every chosen option) × quantity.
- Order total = sum of the items + the delivery fee if delivery is chosen. There are no taxes or discounts.
- The server always recalculates the price. A price sent by the browser is never trusted.
- Sold-out and hidden products can't be ordered, and products are re-checked when the order is sent.
- Seasonal products appear and can be ordered only between their start and end dates (inclusive).

**Order statuses**

| From | To | Who | Customer email |
| --- | --- | --- | --- |
| (new website order) | Pending approval | Customer | Order received, not yet confirmed |
| Pending approval | Approved | Admin | Order confirmed |
| Pending approval | Declined | Admin (optional reason) | Order declined |
| Pending approval | Cancelled | Customer (tracking page) or admin | Cancellation confirmed |
| (new custom request) | Quote needed | Customer | Request received |
| Quote needed | Quote sent | Admin | Your quote |
| Quote needed | Declined | Admin | Request declined |
| Quote sent | Approved | Customer accepts | Order confirmed |
| Quote sent | Closed | Customer declines, or the quote expires | Quote closed |
| (new manual order) | Approved | Admin | Order confirmed, only if an email was entered |
| Approved | In preparation | Admin | none |
| In preparation | Ready for pickup / Out for delivery | Admin | Ready / On the way |
| Ready / Out for delivery | Completed | Admin | Thank you |
| Approved or later (not Completed) | Cancelled | Admin only | Cancellation confirmed |

- An admin can move an order back one step to fix a mistake. That doesn't send an email.
- **Paid / unpaid** is a separate flag that can be changed at any status. Marking paid records who did it and when.
- Every change is saved as an order event.

**Quotes**

- A quote has an amount (the full order total, including delivery if chosen), an optional note and an expiry date (default: today + quote validity days).
- The customer accepts or declines from a link in the email or on the tracking page. An expired quote can't be accepted.
- Expired quotes move to Closed automatically, at least once a day.
- An admin can re-send a new quote while the status is Quote sent. The new quote replaces the old one.

**Cancellations and edits**

- Customers can cancel only while an order is Pending approval or Quote needed. Afterwards the tracking page tells them to contact the bakery on WhatsApp.
- Customers can't edit orders. Admins can edit any field of any order that isn't Completed. Editing recalculates the total unless the admin overrides it, and is logged.

**Order numbers**

- Sequential, human-friendly numbers: APB-0001, APB-0002 and so on. Tracking links use a separate random token, so one customer can't guess another's link.

## Customer site

The customer site is phone-first, with a top bar holding the logo, an EN/FR switch, a basket icon with an item count, and a menu. Each page lists what it must do and its done-when checks.

**Every page**

- A **promo banner** at the top while a promotion set to "top banner" is live. It can be dismissed for that visit and links to its target.
- The EN/FR switch keeps the customer on the same page. The choice is remembered and saved on their orders, so emails go out in that language. The first visit uses the phone's language if it's French, otherwise English.
- A footer with WhatsApp, phone, email, Instagram, the pickup address and links to the FAQ and policies.

**Home**

- Hero photo and tagline, live promotions as cards, seasonal specials (when live), featured products (chosen in Settings), "How it works" in 3 steps, a gallery preview, and buttons for "Order now" and "Custom cake".
- *Done when:* a live promotion shows its card and banner, and both disappear automatically when it ends.

**Menu**

- Product grid filtered by type (Cakes, Cupcake boxes, Desserts, Seasonal) and allergen (e.g. eggless, nut-free). Each card shows the main photo, name, "from Rs X", any sale price and a promo badge, and a Sold out label when needed. Hidden products don't appear.
- *Done when:* filters combine correctly, sold-out items can't be added, and seasonal items appear only in their window.

**Product page**

- Swipeable photos, description, allergens with a kitchen-allergen note, option pickers by kind, message-on-cake field with a live character count, quantity, a live price (showing the sale price when relevant), "Earliest date: \[date\]", and Add to basket.
- *Done when:* the live price always equals the server's price, required options block Add to basket until chosen, and the text limit is enforced.

**Basket and checkout** (one page)

- The steps from Business rules: basket, delivery or pickup, date, window, details, summary, send.
- The date picker greys out unavailable days and explains why when tapped ("Fully booked" is never shown, because there is no cap). Signed-in customers get their details and saved addresses filled in.
- Before sending, the customer accepts the short policies with a checkbox.
- *Done when:* the order can't be sent for an unavailable date or a changed price (the customer is shown the new price), and a double tap doesn't create two orders.

**Order confirmation and tracking page**

- Confirmation shows the order number, a "not confirmed until approved" notice and the tracking link.
- Tracking (private token link) shows the items, date, window, delivery or pickup, total, paid status, a status progress bar and any message from the bakery. For quotes, it shows the amount, note, expiry and Accept / Decline. It has a Cancel button only while cancelling is allowed, and a WhatsApp button.
- *Done when:* the token link works signed out, a wrong token shows "not found", and Cancel disappears after approval.

**Custom cake request**

- A form with occasion, date, servings, flavours, theme and colours, text on cake, up to 5 photos (max 10 MB each, shrunk before upload), optional budget, delivery or pickup, and details. "Request something similar" from the gallery opens it with that photo attached.
- *Done when:* the request appears in the admin within seconds with its photos, and the customer gets the email.

**Gallery, About, Contact and FAQ**

- Gallery: a photo grid filtered by occasion, opening full screen with swipe.
- About: text and photo from Settings.
- Contact and FAQ: contact buttons, pickup address with a map link, and FAQ and policies from Settings.

**Customer account**

- Sign up or in with email and password, or a one-time email link. Includes password reset, profile, saved addresses, language, My orders (current and past) and Reorder (puts the items back in the basket at today's prices, skipping unavailable ones with a note).
- After a guest order, offer "Save my details". This creates an account with a password and links past orders made with the same email.

## Admin app

The admin app is private. It lives at its own address (e.g. /admin), can be installed on the home screen with an icon and push notifications, and is built for one-handed phone use. A bottom bar holds **Today · Orders · Calendar · Menu · More**. Screens marked *(Owner)* are hidden from Admins.

**Sign-in**

- Email and password, with "forgot password" and sessions that stay signed in for 30 days on a phone. Deactivated admins are signed out at once.
- *Done when:* a customer account can't open any admin page, and an Admin can't open Owner screens even by typing their address.

**Today**

- Counts: to review, quotes to send, unpaid (approved or later). Below them, today's and tomorrow's orders sorted by window, each with its main items, delivery or pickup, and a one-tap "next status" button.

**Orders**

- Tabs: To review (Pending approval and Quote needed), Upcoming, Completed, Cancelled/Declined/Closed. Search by name, phone or order number, and filter by date, delivery or pickup, and paid.
- Order detail: everything on the order, the address with an "Open in Maps" link, the customer's contact with Call and WhatsApp buttons, reference photos for custom requests, the private note, and the activity log.
- Actions: Approve, Decline (with reason), Send quote (amount, note, expiry), Next status, Back one step, Mark paid/unpaid, Edit, Cancel, WhatsApp (pick a template).
- *Done when:* every action follows Business rules, sends the right email, logs who did it, and two admins acting on the same order at once can't create a conflict (the second sees "this order changed, reload").

**Add order (manual)**

- Pick products and options, or add a free-text item with a price. Enter customer name, phone and optional email, date, window, delivery or pickup, the delivery fee (editable) and paid yes/no. Saving creates an Approved order with source = manual.
- It finds an existing customer by phone or email instead of making a duplicate.

**Calendar**

- Month view with the number of orders per day, and week and day lists. Delivery and pickup are colour-coded, blocked days greyed out. Cancelled, declined and closed orders are excluded.
- Tap a day to see its orders, block or unblock it, or open its **prep list**: the day's items grouped by product, then by size and flavour, with quantities and messages on cakes. It can be shared or printed.
- *Done when:* blocking a day stops new customer orders for it immediately.

**Menu**

- List products by type, with drag to reorder. Create, edit, duplicate, hide, or mark a product sold out.
- The editor covers EN/FR texts, photos (upload from the camera roll, reorder, shrink before upload), base price, notice days, allergens, option groups and choices, and seasonal dates. A "preview as customer" button shows how it looks.

**Promotions**

- List of promotions with their status (scheduled, live, ended, inactive).
- Create or edit: title and text EN/FR, image, start and end, where it shows (banner, homepage card, or both), link target, and optional discounted products (percentage or sale price per product). An active switch can end it early.
- *Done when:* a scheduled promotion goes live and ends on its own, with no admin action.

**More**

- **Gallery:** upload several photos at once, tag by occasion, reorder, delete.
- **Customers:** a searchable list with order count and total spent, and each customer's orders. Admins can add a private note to a customer.
- **Availability** *(Owner)*: default notice days, weekly closed days, time windows, and blocked dates and ranges with reasons. Admins can still block a single day from the calendar.
- **Settings** *(Owner)*: delivery fee, pickup address and map link, contact details, Juice number, Instagram, homepage banner and featured products, About, FAQ, policies, WhatsApp templates and quote validity, all EN/FR where relevant.
- **Sales summary**: for this week, this month, last month or a custom range. Shows revenue from completed orders, order count, average order, delivery vs pickup, top 5 products, revenue by source (website, custom, manual), and an unpaid list with amounts. Can be exported as a CSV.
- **Team** *(Owner)*: list of admins with role, status and last sign-in, plus Invite, Change role, Deactivate or Reactivate, and Resend invite (rules in Users and roles).
- **My profile:** name, password, language, and push and email alert switches.

## Notifications

All customer messages are automatic emails in the order's language. Admin alerts go to each active admin who switched them on. Nothing is sent by a paid SMS or WhatsApp service.

**Customer emails** (EN and FR versions of each, with the bakery name and colours, plain enough to read well on a phone)

| Email | Sent when | Must include |
| --- | --- | --- |
| Order received | Website order placed | Order number, items, date, window, total, "not confirmed yet", tracking link |
| Request received | Custom request sent | Summary of the request, tracking link |
| Your quote | Quote sent | Amount, note, expiry, Accept and Decline buttons |
| Order confirmed | Approved (including accepted quotes, and manual orders with an email) | Full summary, payment reminder (Juice number or cash), pickup address or delivery details, tracking link |
| Order declined / Request declined | Declined | Reason if given, link to the menu |
| Cancellation confirmed | Cancelled | Order number |
| Quote closed | Declined by the customer or expired | Link to send a new request |
| Ready for pickup / On the way | Status changed | Pickup address and window, or delivery window |
| Thank you | Completed | Link to order again and to Instagram |
| Admin invitation | Owner invites an admin | Set-password link (valid 7 days) |
| Sign-in link / Password reset | Requested | One-time link |

**Admin alerts**

- **Push + email:** new website order, new custom request, quote accepted or declined, customer cancelled.
- **Push only:** the evening before (18:00) with tomorrow's count and a link to its prep list, and an alert when a quote expires.
- Tapping a push opens the relevant order or day.

**WhatsApp templates**

- The WhatsApp button opens a chat with the customer's number and a pre-filled message from a template, in the order's language. The admin can edit it before sending.
- Templates: Order approved · Ready for pickup · On the way · Payment reminder (with Juice number and total) · Blank.
- Templates can use placeholders such as {name}, {order\_number}, {date}, {window}, {total}, {juice\_number}, {pickup\_address} and {tracking\_link}. They're edited in Settings.
- Phone numbers are stored in international format (+230 for Mauritius when no code is given).

## Quality requirements

- **Phone first:** design for a 375 px-wide screen first, then tablet and desktop. Tap targets are at least 44 px, forms use the right keyboards (phone, email, number), and nothing scrolls sideways.
- **Speed:** the home and menu pages load in under 3 seconds on a mid-range phone over 4G. Images are resized and compressed automatically and load as they come into view.
- **Bilingual:** no customer-facing text is hard-coded. Every label, error, email and template has EN and FR versions. A missing French text falls back to English.
- **Accessibility:** readable contrast, labels on every form field, image alt text (the product name by default), and keyboard-usable checkout.
- **Security:** admin pages and data are protected on the server, not just hidden. Roles are checked on every action. Uploads are images only (JPEG, PNG, WebP, HEIC converted), with a size limit. Forms are protected against spam bots without annoying puzzles. Tracking tokens are long and random.
- **Privacy:** customer data is visible only to admins. Order emails contain no more personal data than needed. A short privacy note explains what is collected and why.
- **Reliability:** an order is never lost. If an email fails, the order is still saved and the admin is still alerted, and failed emails are retried. Automatic weekly backups of all data and photos go to storage the bakery owns.
- **Free-plan fit:** stay within free limits (about 100 emails a day, 1 GB of photos). Photos are compressed to roughly 300 KB or less.
- **Keep-alive:** if a service pauses after inactivity on its free plan, include an automatic check that prevents it.
- **Search and sharing:** page titles, descriptions and share previews (photo and title) for the home, menu and product pages, so links look good when posted on Instagram or WhatsApp.
- **Basic analytics:** a privacy-friendly, free visitor count is optional. No tracking cookies that would need a consent banner.

## Build phases

There are seven phases, each building on the last. Use sample products and photos until the real content arrives in phase 6.

1. **Foundations**
   - Project setup, all accounts under the bakery's email (see Handover), a staging site and a live site, automatic deploys, and the README started.
   - Data records from "Data the app keeps", EN/FR text system, the Mauritius time zone and rupee formatting.
   - Admin sign-in, the Owner account, roles and the Team screen (invite, change role, deactivate).
   - *Done when:* the Owner can invite an Admin by email, the Admin can sign in, and the Admin can't open Owner screens.
2. **Menu and content management**
   - Admin Menu (products, options, photos, allergens, seasonal dates), Gallery, Settings, Availability and Promotions.
   - Sample data: 8 products across the four types, 12 gallery photos, one live and one scheduled promotion.
   - *Done when:* an admin can create a cake with sizes, flavours, add-ons and a message field from a phone in under 5 minutes.
3. **Customer site and checkout**
   - Every page in Customer site, the basket, checkout with availability and pricing rules, confirmation, the tracking page with cancel, and promotion display.
   - *Done when:* a guest can place a 2-item delivery order on a phone, cancel it from the tracking page, and every Business rules check under Availability, Pricing and Promotions passes.
4. **Order management**
   - Today, Orders (all actions and the activity log), manual orders, the Calendar and prep list, custom requests and quotes (including automatic expiry), Customers, the Sales summary.
   - *Done when:* one order of each source (website, custom, manual) can be taken from start to Completed by two different admins, and the log shows who did each step.
5. **Notifications and accounts**
   - Every customer email (EN/FR), admin push and email alerts with per-admin preferences, the evening-before reminder, WhatsApp templates, customer accounts (sign-up, email link, saved addresses, My orders, Reorder, "Save my details").
   - *Done when:* every row of the email table arrives correctly in both languages, and a push reaches an installed admin app on both iPhone and Android.
6. **Real content and polish**
   - Load the bakery's products, photos, texts and translations. Apply the visual identity. Add share previews, the privacy note, speed tuning and accessibility checks.
   - *Done when:* the Quality requirements are met on a real mid-range phone.
7. **Testing, launch and handover**
   - A full test pass on the owner's phone (see the checklist below). Then connect the domain, back up, launch, do the walkthrough and complete the Handover list.
   - *Done when:* the owner has placed a real test order as a customer and approved it as admin on her own phone, and every Handover item is ticked.

**Launch test checklist**

- [ ] Order with delivery, and order with pickup
- [ ] Order for a date blocked after the customer opened checkout is refused
- [ ] Product with longer notice moves the earliest date
- [ ] Promotion price shows and is charged, then disappears after the end time
- [ ] Custom request, quote, accept, and an expired quote that can't be accepted
- [ ] Customer cancels while pending; the cancel button is gone after approval
- [ ] Manual order shows in the calendar and prep list
- [ ] Owner-only screens are hidden and blocked for an Admin
- [ ] Deactivated admin is signed out
- [ ] All emails in EN and FR, all WhatsApp templates
- [ ] Sales summary totals match the orders
- [ ] Backup runs and can be restored

## Handover and ownership

The bakery must own everything and be able to switch to another developer without the original builder's help.

- [ ] Every service account (hosting, domain, database, email, code repository) is created with the bakery's own email address, not a personal one
- [ ] Two-step sign-in uses a method that can be handed over (the bakery's phone or shared password manager)
- [ ] The domain is registered to Aux petits bonheurs, with auto-renew on and the bakery's card on file before the first renewal
- [ ] All secrets and settings live in the bakery's accounts, and none exist only on a developer's computer
- [ ] The README explains what each service does, how to run the site locally, how to deploy, how to restore a backup, and every setting
- [ ] A one-page handover sheet lists each service, its purpose, where its login is kept, and its yearly cost
- [ ] Weekly backups run automatically to storage the bakery owns, and a test restore has been done
- [ ] The code, design and content are stated to belong to Aux petits bonheurs
- [ ] The builder stays on as a team member during the 3-month aftercare. After that, the Owner can remove them

## Defaults and open questions

Use these values until the owner confirms them. All of them are editable in Settings.

| Setting | Default to use |
| --- | --- |
| Minimum notice | 2 days |
| Weekly closed days | None |
| Time windows | Morning 9:00–12:00 · Afternoon 12:00–17:00 · Evening 17:00–20:00 (same for delivery and pickup) |
| Delivery fee | Rs 200 (placeholder) |
| Quote validity | 3 days |
| Message-on-cake limit | 40 characters |
| Evening reminder | 18:00 |
| Order number prefix | APB- |
| Brand look | Warm and soft: cream background, one pastel accent, a rounded serif for headings, a clean sans-serif for text. Placeholder until the owner chooses |

**Not in this version:** online payment, automatic WhatsApp or SMS, a daily order cap, promo codes, gift cards, loyalty points, customer reviews, delivery fees by area.

**Open questions for the owner**

- [ ] Delivery fee amount, pickup address, Juice number
- [ ] Notice period, closed days and time windows: are the defaults right?
- [ ] Cancellation policy after approval, and cake storage advice (for the FAQ)
- [ ] Confirmed: Admins can see the Sales summary
- [ ] Confirmed: Admins can create and edit promotions
- [ ] Domain name
