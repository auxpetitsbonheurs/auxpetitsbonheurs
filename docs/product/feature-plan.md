# Aux petits bonheurs — Website Feature Plan

Nov 9, 2026 · @Sabera Shaik Joomun

## Overview

The website lets customers browse and order everything Aux petits bonheurs makes (cakes, cupcake boxes, desserts and seasonal specials) and lets the owner run every order from her phone. It replaces taking orders by hand over Instagram DMs, while keeping payment the way it is today.

Guiding rules:

- **Phone first.** Customers mostly arrive from Instagram on their phones, and the owner manages everything from hers.
- **Bilingual.** Every customer-facing page and email is available in English and French, with a switch on every page.
- **She stays in control.** No order is confirmed until she approves it, and she can block any date.
- **No online payment.** Customers pay by Juice or cash on delivery or pickup. The site only tracks paid or unpaid.
- **Every order in one place.** Website orders and orders she takes elsewhere (DMs, calls, walk-ins) share the same list and calendar.
- **No developer needed day to day.** She can change products, prices, photos, dates and settings herself.

## Public pages

The customer site has eight pages, all reachable from a simple phone menu with a basket icon always visible.

| Page | What it shows |
| --- | --- |
| Home | Welcome banner with a hero photo, current seasonal specials, featured items, how ordering works in 3 steps, Instagram link, and buttons for "Order now" and "Custom cake" |
| Menu | All products, filtered by category (Cakes, Cupcake boxes, Desserts, Seasonal) and by allergen (e.g. eggless, nut-free). Each card shows a photo, name, starting price and a sold-out label when needed |
| Product page | Photo carousel, description, allergens, options with live price, earliest available date, and "Add to basket" |
| Custom cake | Request form (see Custom cake requests) |
| Gallery | Past creations in a photo grid, filtered by occasion (birthday, wedding, baby shower, christening and so on). Tapping a photo opens it full screen, with a "Request something similar" button |
| About | Her story, photo, and how she works (notice needed, delivery, pickup) |
| Contact and FAQ | WhatsApp button, phone, email, Instagram, pickup address with a map, and answers on notice, delivery, payment, allergens, storage and cancellation |
| Basket and checkout | See Ordering and checkout |

On every page:

- An **EN / FR switch**. The choice is remembered and used for the customer's emails.
- A **footer** with contact links, the pickup address and short policy notes (allergens, cancellation).
- A **sign in / my orders** link for customers with an account.

## Products and options

There are four product types, all managed from the same menu editor. Each type gets the options that suit it.

| Type | Sold as | Typical options |
| --- | --- | --- |
| Cakes | One cake | Size or servings, flavour, filling, add-ons, message on cake |
| Cupcake boxes | Box of 6, 12 and so on | Box size, flavour (one or mixed), add-ons |
| Desserts and treats | Per piece or per box | Quantity or box size, flavour |
| Seasonal specials | Any of the above | Same as their base type, shown only between a start and end date |

Every product has:

- **Name and description** in English and French.
- **Photos:** up to 5, with the first as the main image.
- **Base price**, plus price changes per option (e.g. 8 servings +Rs 400, chocolate ganache +Rs 150).
- **Allergen tags:** nuts, eggs, gluten, dairy, soy, plus labels such as eggless or vegetarian. A note on every product reminds customers that everything is made in a kitchen that handles all of these.
- **Notice needed:** uses the site-wide minimum by default, but can be set higher per product (e.g. tiered cakes need 5 days).
- **Status:** available, sold out (visible but can't be ordered) or hidden.
- **Category and sort order**, so she controls what appears first.

Option types:

- **Pick one** (size, flavour, filling), each choice with its own price change.
- **Pick several** (add-ons such as candles, toppers, edible print, fresh flowers), each with a price.
- **Text** (message on cake), with a character limit she sets.
- **Quantity** (desserts), with a minimum and maximum.

The price on the product page updates as the customer changes options.

## Ordering and checkout

An order can hold several items, all for one date and one delivery or pickup. Checkout fits on one scrolling page.

1. **Basket:** each item with its chosen options, quantity, price and edit or remove buttons, plus a running subtotal.
2. **Delivery or pickup:**
   - *Pickup* shows her public pickup address and a map link.
   - *Delivery* asks for the full address and a landmark or directions note, and adds the flat delivery fee. She delivers anywhere, and if an address is too far she can decline or adjust when reviewing the order.
3. **Date:** a calendar that shows only available days. A day is unavailable if it is a blocked date, inside the notice period, or a weekday she has marked as closed. The notice period is the longest one among the items in the basket.
4. **Time window:** morning, afternoon or evening (she names and edits these). Windows can differ for delivery and pickup.
5. **Customer details:** name, phone (WhatsApp), email and an optional note (e.g. "surprise, don't call the recipient"). Signed-in customers have these filled in already.
6. **Summary:** items, delivery fee, **total**, payment method (Juice or cash on delivery or pickup) and acceptance of the short policies.
7. **Send order:** the order is saved as *Pending approval*, and the customer sees a confirmation screen with their order number and tracking link.

The confirmation screen and email say clearly that the order is **not yet confirmed** until she approves it.

## Custom cake requests

A custom request is a quote first and becomes an order only when the customer accepts the price.

**The request form asks for:**

- Occasion and the date needed (same availability rules as checkout)
- Number of servings or size
- Flavour and filling wishes
- Theme, colours and any text on the cake
- Up to 5 reference photos
- Budget range (optional)
- Delivery or pickup, and contact details

**What happens next:**

1. She sees the request in her admin, marked *Quote needed*.
2. She enters a price, an optional note (e.g. "fresh flowers instead of sugar flowers") and how long the quote is valid (default 3 days).
3. The customer gets an email with the quote and two buttons: **Accept** or **Decline**. They can also see it on their tracking page.
4. Accepting turns it into an approved order on the calendar. Declining or letting the quote expire closes it.
5. She can also decline a request outright, with an optional reason.

The "Request something similar" button in the gallery opens this form with that photo already attached.

## Customer accounts, tracking and cancellation

No one needs an account to order. An account just makes the next order faster.

**Guest customers:**

- Order with name, phone and email only.
- Get a private tracking link by email for each order, which works without signing in.
- After ordering, they're offered a one-tap "Save my details" to create an account.

**Customers with an account** (sign in with email and a password, or a one-time email link):

- Saved name, phone, email and delivery addresses.
- **My orders:** current and past orders with status.
- **Reorder:** put a past order's items back in the basket in one tap.
- Choose the language for emails.

**Tracking page** (for every order):

- Order number, items, date, time window, delivery or pickup, total and payment status.
- Current status shown as a progress bar, plus any note from her.
- For custom requests: the quote with Accept and Decline buttons.
- Her WhatsApp button for questions.

**Cancellation:**

- While an order is *Pending approval*, the customer can cancel it themselves from the tracking page, free and with no questions.
- Once she approves it, the cancel button disappears and the page says to contact her on WhatsApp for any change or cancellation.
- Customers can't edit an order themselves. She can edit any order from the admin.

## Owner admin

The admin is a private area for her and any helpers she invites. As Owner, she can add admins, who can manage orders, the menu and promotions and see the sales summary, while settings and the team stay Owner-only. It installs on her phone's home screen like an app and is laid out for one-handed use, with a bottom bar: **Today · Orders · Calendar · Menu · More**.

**Today (home screen)**

- Counts at the top: new orders to review, quotes to send, unpaid orders.
- Today's and tomorrow's orders in time-window order, each with delivery or pickup, items and a one-tap status button.

**Orders**

- Tabs: *To review*, *Upcoming*, *Completed*, *Cancelled / declined*, and a search by name, phone or order number.
- Each order shows items and options, message on cake, date and window, delivery address (one tap opens Google Maps), customer contact, notes, total and paid status.
- Actions: **Approve**, **Decline** (with an optional reason), **Send quote** (custom requests), **Move to next status**, **Mark paid / unpaid**, **Edit** (items, price, date, window, delivery fee, address), **Cancel**, and **Message on WhatsApp**.
- A private note field only she can see (e.g. "customer is a regular, give extra candles").

**Add order (manual)**

A quick form for orders that come in by Instagram DM, call or in person:

- Pick products and options from the menu or type a free-form item with its price.
- Customer name and phone, date, window, delivery or pickup.
- Skips approval and goes straight to *Approved*. It appears in the calendar and sales like any other order.
- Can send the customer the usual confirmation email if an email is entered.

**Calendar**

- Month view with a dot count per day, and week and day views listing each order.
- Delivery and pickup in different colours, and blocked days greyed out.
- Tap a day to see its orders, or to block or unblock it.
- A **prep list** for any day: every item due that day, grouped by product and flavour, so she knows what to bake.

**Menu**

- Add, edit, duplicate, reorder, hide or mark sold out any product.
- Edit options, prices, allergens, photos and translations.
- Set start and end dates for seasonal specials.

**More**

- **Gallery:** upload photos from her camera roll, tag them by occasion, reorder or delete.
- **Availability:** minimum notice (days), weekly closed days, blocked dates and ranges with an optional reason, and the time windows.
- **Settings:** delivery fee, pickup address, contact details, Instagram link, homepage banner and featured items, About text, FAQ and policies (EN and FR), and the WhatsApp message templates.
- **Customers:** a simple list with name, phone, email, number of orders and total spent, and each customer's past orders.
- **Sales summary:** totals for this week, this month or a chosen period. It shows revenue, number of orders, average order value, delivery vs pickup, best-selling products and a list of unpaid orders with their amounts.

## Notifications

Customers get automatic emails in their chosen language. She gets a push notification and an email for anything that needs her. WhatsApp is always a message she sends herself in one tap.

| Event | Customer gets | She gets |
| --- | --- | --- |
| New order placed | Email: order received, not yet confirmed, with tracking link | Push + email |
| New custom request | Email: request received | Push + email |
| Quote sent | Email with price and Accept / Decline buttons | — |
| Quote accepted or declined | Email: confirmation | Push + email |
| Order approved | Email: confirmed, with summary, date, window and pickup address or delivery details | — |
| Order declined | Email with her reason, if given | — |
| Customer cancels (before approval) | Email: cancellation confirmed | Push + email |
| Ready for pickup / out for delivery | Email | — |
| Order completed | Email: thank you, with a link to order again | — |
| Reminder | — | Push the evening before: tomorrow's orders |

**One-tap WhatsApp button**

Every order in the admin has a WhatsApp button that opens a chat with the customer and a ready-written message she can edit before sending. Templates (EN and FR, editable in Settings):

- Order approved, with date, window and total
- Ready for pickup
- On the way
- Reminder of payment by Juice, with her Juice number
- A blank message

## Order lifecycle

&#91;embedded content: order lifecycle · 3 ways in, 2 dead ends\]

Website orders wait for her approval, custom requests wait for the customer to accept a quote, and manual orders go straight to Approved. After approval, she moves each order along with one tap, and the customer gets an email at each step.

## Not in version 1

- Online payment (card or automatic Juice)
- Automatic WhatsApp messages
- A daily maximum of orders or cakes (can be added later)
- Admin roles beyond Owner and Admin (e.g. a delivery-only role)
- Promo codes, gift cards and loyalty points (promotions with banners and sale prices are included)
- Customer reviews and ratings
- Delivery fees by area or distance

## Open questions (defaults assumed)

- [ ] **Minimum notice:** 2 days by default, with longer notice per product where needed. Is that right?
- [ ] **Time windows:** Morning (9–12), Afternoon (12–5), Evening (5–8). Does she want other hours?
- [ ] **Closed days:** none by default. Does she close on any weekday?
- [ ] **Quote validity:** 3 days by default. Is that right?
- [ ] **Delivery fee:** what is the flat amount?
- [ ] **Juice number:** should it appear in the approval email and WhatsApp payment reminder?
- [ ] **Policies:** what is her cancellation policy after approval, and how should cakes be stored?
