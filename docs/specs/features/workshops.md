# Feature spec: Workshop events and registration (E-15)

Status: building · Owner: product-director · Leads: lead-backend, lead-frontend, ux-lead · Updated: 2026-11-14
PRD: FR-087 to FR-094 (section 5.11) · Epic: production/epics/E-15-workshop-events.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Contract: docs/architecture/api/contracts.md "Workshops (E-15)" · Data model: `workshop_event`, `workshop_registration` (migration 0026)

## Summary
The bakery runs occasional workshops (example: Valentine's, 10 cakes prepared, 10 couples decorate their own). Owner and Admin create events in Admin → More → Workshops; customers see upcoming events on `/workshops` and register on each event's page. The flow is the website orders' approve-then-pay flow: registration → the client accepts or refuses → Juice payment instructions by email (and WhatsApp from admin) → the customer pays → "Payment received". Unpaid: a reminder at 12 h, the place freed at 24 h after acceptance.

## Decisions (Owner and client, 2026-11-14)
1. One registration = one or more cakes; each cake is shared by up to 2 people ("up to 2 people per cake"). Capacity = number of cakes (stations). Price in Rs per cake.
2. Each event has its own list of cake options (e.g. Chocolate, Red velvet); the registrant chooses one per cake.
3. Event fields: title and description EN/FR, optional photo (480/960 copies, the product photo rules), date, start and end time (Mauritius time), address (free text) with an optional map link, price, capacity, cake options.
4. Registration fields: name, phone, email, number of cakes (1 to the places left, at most 10), the cake for each, the people's names (optional), **allergies or dietary needs: an explicit choice "None" or "Yes, please describe" (required choice; the description is required with Yes)**, a message (optional), the privacy note link. Signed-in customers get name, phone and email prefilled (E-11). Turnstile and RL-request (3 per 10 min per IP, its own count) like custom cake.
5. Places are held while the registration is pending, awaiting payment or confirmed (and after completion); refused, cancelled and unpaid registrations free them. Never oversell: the capacity check and the insert are one database CALL under the event row's lock.
6. Registrations are orders (ADR-0005): they appear in Orders and Today with a "Workshop" badge, are tracked, paid, refunded and counted in Sales like orders.
7. Cancelling an event tells every registrant by email (queued) and lists WhatsApp links for each in admin; paid registrations get the refund step.
8. The event is marked completed after it happens; its confirmed registrations become completed and count in Sales.
9. Allergies are health data: shown in admin on the registration and highlighted on the printable list; never in admin alert pushes or admin alert emails; only the customer's own emails may repeat them; cleared by Anonymise customer.
10. `/workshops` stays a browsing page (server-rendered, deferred JS); the event page hydrates for the form only. The existing intro content (admin Pages) stays above the list; the old single "next event" field of the Pages editor is replaced by the events list.

## Screens and states
### Customer: `/workshops` (S-302)
Intro (Pages content, unchanged) → "Upcoming workshops": one card per published event whose date has not passed, soonest first: photo (480/960), title, date, times, address, price "Rs 1,500 per cake · up to 2 people per cake", "3 places left" / "1 place left" / **"Full"** (badge, the card still links), link "See the workshop and register". Empty: the calm "No workshop planned right now" text and the WhatsApp call to action (unchanged).
### Customer: `/workshops/:slug` (S-303)
Title, photo, date, times, address (+ "Open in maps" when set), price, places left, description, then the form (section "Register"). Full: "This workshop is full" with the WhatsApp ask instead of the form. Cancelled: "This workshop was cancelled"; past or completed: "This workshop has taken place" (both with a link to all workshops, noindex). A draft or unknown slug: 404. After a refusal the form keeps every value; WORKSHOP_FULL shows the places now left and caps the number. Success → `/order/:token/confirmed` (workshop wording: "Registration received; we will confirm and send the payment details").
### Admin: More → Workshops (S-301, S-305, S-306)
List (upcoming first, then past): title, date, status (Draft, Published, Cancelled, Completed), "6 of 10 places held", pending count. "New workshop". Event screen: editor (sections Texts, Photo, When and where, Price and places, Cake options) with Save; status actions (Publish / Unpublish, Cancel workshop with reason and confirm dialog, Mark completed from its date); Registrations: each with number, name, status badge, cakes and choices, total, allergy badge, people's names, link to the order (accept, refuse, payment received happen on the order screen, unchanged pattern); totals per cake option; "Print or share list" opens `/admin/workshops/:id/list` (print stylesheet like the prep list).
### Admin: Orders, Today, order screen (S-305)
A "Workshop" badge on rows of source `workshop`; the order screen shows the event, people's names and allergies, and "Accept" (the shared approve) for a pending registration (moves to Awaiting payment).

## Emails (outbox, EN/FR; S-307)
`workshop_received` (registration received, what happens next), `payment_instructions` from the shared approve (worded for a workshop: accepted + Juice payment steps, deadline 24 h), `order_confirmed` / `payment_reminder` / `order_cancelled_unpaid` / `order_declined` / `order_refunded` use workshop wording for a workshop order (event title, date, times, address, map link), `workshop_cancelled` (event cancelled, reason, refund line when paid). Admin: `admin_alert_new_workshop` email and a push "New workshop registration" (number, name, event, cakes; never allergies).

## Permissions
Owner and Admin: everything in Workshops (like Promotions). Customers: register; see their own registration on the tracking page and My orders.

## Edge cases
- Price or capacity changed after registrations: existing registrations keep their price (copied); capacity cannot go below the places held (field error "N places are already held").
- Date or times changed: active registrations move with the event (their order date and window); registrants are not emailed automatically (the admin uses the WhatsApp links); recorded as a gap for E-10.
- A cake option removed: existing registrations keep their copied choice.
- Two people register for the last place at once: one succeeds, the other gets "Only 0 places left" with the form kept.
- The 24 h release frees the place; the event shows the place again at once.

## Non-functional
`/workshops`: no added client JS (deferred hydration as today), LCP budget unchanged, images lazy below the fold with explicit sizes. Event page: form JS only, within the 170 kB budget. WCAG 2.2 AA, 44 px targets, 320/375/1280 px, EN and FR.
