// E-15 workshops against PGlite with the real migrations: registerWorkshop and the
// register_workshop procedure (S-300, S-303), accept / pay / unpaid release (S-304), and the
// admin event actions (S-301, S-306). Fixed clock, no network.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { paymentDeadlines } from "~/jobs/payment-deadlines";
import type { JobContext } from "~/jobs/types";
import { parseWorkshopEvent } from "~/server/contracts/workshops";
import type { Database } from "~/server/db.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { WORKSHOP_DATE, WORKSHOP_NOW, insertWorkshopEvent, registerContext, registerTest, registrationForm } from "~/server/testing/workshops";
import type { TurnstileCheck } from "~/server/turnstile.server";
import { approveOrder, declineOrder, markPaid } from "./approve-then-pay.server";
import { registerWorkshop } from "./register-workshop.server";
import { cancelEvent, completeEvent, heldPlaces, publishEvent, saveWorkshopEvent, unpublishEvent } from "./workshop-events.server";

let database: TestDatabase;
let db: Database;
let adminId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
  adminId = (await insertAdmin(database, new FakeAuth(), { email: "owner@example.com" })).id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await database.client.query<T>(text, params)).rows;
const now = new Date(WORKSHOP_NOW);
const version = async (orderId: string) => (await query<{ version: number }>("select version from orders where id = $1", [orderId]))[0]!.version;

describe("register (S-300, S-303)", () => {
  test("a registration is a Pending approval workshop order with its cakes as items and its registration row", async () => {
    const eventId = await insertWorkshopEvent(database);
    const placed = await registerTest(database, eventId, {
      cakes: "3",
      "cake.0": "choc",
      "cake.1": "rv",
      "cake.2": "choc",
      peopleNames: "Aisha and Ravi",
      allergiesChoice: "yes",
      allergies: "Nuts (Ravi)",
      message: "Our anniversary!",
    });

    expect(placed).toMatchObject({ ok: true, orderNumber: "APB-0001", replayed: false });
    const [order] = await query("select source, status, total_rs, fulfil_on::text as on, time_window->>'start' as start, time_window->>'end' as end, customer_note, fulfilment from orders");
    expect(order).toEqual({ source: "workshop", status: "pending_approval", total_rs: 4500, on: WORKSHOP_DATE, start: "14:00", end: "16:30", customer_note: "Our anniversary!", fulfilment: "pickup" });
    expect(await query("select name_en, quantity, line_total_rs, options->0->'choice'->>'en' as cake from order_item order by sort_order")).toEqual([
      { name_en: "Valentine's cake workshop", quantity: 2, line_total_rs: 3000, cake: "Chocolate" },
      { name_en: "Valentine's cake workshop", quantity: 1, line_total_rs: 1500, cake: "Red velvet" },
    ]);
    expect(await query("select cakes, people_names, allergies from workshop_registration")).toEqual([{ cakes: 3, people_names: "Aisha and Ravi", allergies: "Nuts (Ravi)" }]);
  });

  test("'None' stores no allergies; no choice at all is a field error (never skipped by accident)", async () => {
    const eventId = await insertWorkshopEvent(database);
    await registerTest(database, eventId, { allergiesChoice: "none", allergies: "ignored" });
    expect(await query("select allergies from workshop_registration")).toEqual([{ allergies: null }]);

    const missing = await registerWorkshop(registrationForm(eventId, { allergiesChoice: undefined }), registerContext(database));
    expect(missing).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: ["allergiesChoice"] });
    const undescribed = await registerWorkshop(registrationForm(eventId, { allergiesChoice: "yes" }), registerContext(database));
    expect(undescribed).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: ["allergies"] });
  });

  test("every bad field at once, including a missing cake choice", async () => {
    const eventId = await insertWorkshopEvent(database);
    const result = await registerWorkshop(registrationForm(eventId, { "contact.email": "nope", cakes: "2", "contact.phone": "12" }), registerContext(database));
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect((result as { fields: string[] }).fields.sort()).toEqual(["cake.1", "contact.email", "contact.phone"]);
  });

  test("the customer email is queued; admins get an alert row that never carries the allergies", async () => {
    const eventId = await insertWorkshopEvent(database);
    const placed = await registerTest(database, eventId, { allergiesChoice: "yes", allergies: "Gluten" }, { locale: "fr" });
    const queued = await query<{ template: string; to_email: string; locale: string; payload: unknown }>("select template, to_email, locale, payload from email_outbox order by template");
    expect(queued).toEqual([
      { template: "admin_alert_new_workshop", to_email: "owner@example.com", locale: "en", payload: { orderId: placed.orderId } },
      { template: "workshop_received", to_email: "aisha@example.com", locale: "fr", payload: { orderId: placed.orderId } },
    ]);
  });

  test("never oversells: more cakes than the places left are refused with the places left", async () => {
    const eventId = await insertWorkshopEvent(database, { capacity: 3 });
    await registerTest(database, eventId, { cakes: "2", "cake.1": "rv" });
    const refused = await registerWorkshop(registrationForm(eventId, { cakes: "2", "cake.1": "rv" }), registerContext(database));
    expect(refused).toEqual({ ok: false, code: "WORKSHOP_FULL", placesLeft: 1 });
    await registerTest(database, eventId);
    expect(await registerWorkshop(registrationForm(eventId), registerContext(database))).toEqual({ ok: false, code: "WORKSHOP_FULL", placesLeft: 0 });
    expect(await heldPlaces(db, eventId)).toBe(3);
  });

  test("never oversells under concurrent registrations (the event row is locked)", async () => {
    const eventId = await insertWorkshopEvent(database, { capacity: 4 });
    const results = await Promise.all(Array.from({ length: 6 }, () => registerWorkshop(registrationForm(eventId), registerContext(database))));
    expect(results.filter((r) => r.ok)).toHaveLength(4);
    expect(await heldPlaces(db, eventId)).toBe(4);
  });

  test("a refused, cancelled or unpaid registration frees its places", async () => {
    const eventId = await insertWorkshopEvent(database, { capacity: 1 });
    const first = await registerTest(database, eventId);
    await declineOrder(db, { orderId: first.orderId, version: await version(first.orderId), adminId, now, reason: null });
    expect(await heldPlaces(db, eventId)).toBe(0);
    await registerTest(database, eventId);
    expect(await heldPlaces(db, eventId)).toBe(1);
  });

  test("a draft, cancelled or past event is closed; a cake not offered is a field error", async () => {
    const draft = await insertWorkshopEvent(database, { status: "draft" });
    const past = await insertWorkshopEvent(database, { eventOn: "2026-11-04" });
    const open = await insertWorkshopEvent(database);
    expect(await registerWorkshop(registrationForm(draft), registerContext(database))).toEqual({ ok: false, code: "WORKSHOP_CLOSED" });
    expect(await registerWorkshop(registrationForm(past), registerContext(database))).toEqual({ ok: false, code: "WORKSHOP_CLOSED" });
    expect(await registerWorkshop(registrationForm(open, { "cake.0": "lemon" }), registerContext(database))).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: ["cake.0"] });
    expect(await query("select count(*)::int as n from orders")).toEqual([{ n: 0 }]);
  });

  test("a replay returns the same registration; another email gets a neutral refusal", async () => {
    const eventId = await insertWorkshopEvent(database);
    const form = registrationForm(eventId);
    const first = await registerWorkshop(form, registerContext(database));
    const again = await registerWorkshop(form, registerContext(database));
    expect(again).toMatchObject({ ok: true, replayed: true, orderId: (first as { orderId: string }).orderId });
    const other = await registerWorkshop({ ...form, "contact.email": "someone@example.com" }, registerContext(database));
    expect(other).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true });
  });

  test("rate limit and bot check like the custom cake form", async () => {
    const eventId = await insertWorkshopEvent(database);
    const failing: TurnstileCheck = { siteKey: "x", verify: async () => "failed" } as unknown as TurnstileCheck;
    expect(await registerWorkshop(registrationForm(eventId), registerContext(database, { turnstile: failing }))).toEqual({ ok: false, code: "BOT_CHECK_FAILED" });
    const ip = "203.0.113.7";
    for (let i = 0; i < 3; i++) await registerTest(database, eventId, {}, { ip });
    expect(await registerWorkshop(registrationForm(eventId), registerContext(database, { ip }))).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
});

describe("approve then pay (S-304)", () => {
  test("Accept -> awaiting payment from now with the payment email; Payment received confirms it", async () => {
    const eventId = await insertWorkshopEvent(database);
    const { orderId } = await registerTest(database, eventId);
    const later = new Date("2026-11-06T09:00:00Z");
    const accepted = await approveOrder(db, { orderId, version: await version(orderId), adminId, now: later });
    expect(accepted).toEqual({ ok: true, order: { status: "awaiting_payment", version: 2, paid: false } });
    expect(await query("select awaiting_payment_since from orders")).toEqual([{ awaiting_payment_since: later }]);
    expect(await query("select template from email_outbox where template = 'payment_instructions'")).toHaveLength(1);

    const paid = await markPaid(db, { orderId, version: 2, adminId, now: later });
    expect(paid).toEqual({ ok: true, order: { status: "approved", version: 3 } });
    expect(await heldPlaces(db, eventId)).toBe(1);
  });

  test("Accept (approve) applies once, to a registration waiting for its answer", async () => {
    const eventId = await insertWorkshopEvent(database);
    const { orderId } = await registerTest(database, eventId);
    await approveOrder(db, { orderId, version: 1, adminId, now });
    expect(await approveOrder(db, { orderId, version: 2, adminId, now })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  test("unpaid: a reminder 12 h after acceptance, the place freed 24 h after acceptance", async () => {
    const eventId = await insertWorkshopEvent(database, { capacity: 1 });
    const { orderId } = await registerTest(database, eventId);
    const acceptedAt = new Date("2026-11-10T08:00:00Z");
    await approveOrder(db, { orderId, version: 1, adminId, now: acceptedAt });
    const run = (hours: number) => paymentDeadlines({ now: new Date(acceptedAt.getTime() + hours * 3_600_000), db } as unknown as JobContext);

    await run(11);
    expect(await query("select template from email_outbox where template = 'payment_reminder'")).toHaveLength(0);
    await run(12.5);
    expect(await query("select template from email_outbox where template = 'payment_reminder'")).toHaveLength(1);
    await run(24.5);
    expect(await query("select status, cancel_reason from orders")).toEqual([{ status: "cancelled", cancel_reason: "unpaid" }]);
    expect(await heldPlaces(db, eventId)).toBe(0);
  });
});

describe("admin event actions (S-301, S-306)", () => {
  const editorForm = (overrides: Record<string, string> = {}) => ({
    titleEn: "Mother's Day cupcakes",
    descriptionEn: "Six cupcakes to decorate.",
    eventOn: "2027-05-30",
    startsAt: "10:00",
    endsAt: "12:00",
    address: "12 Rue Example, Beau Bassin",
    priceRs: "1200",
    capacity: "8",
    "option.0.en": "Vanilla",
    "option.0.fr": "Vanille",
    ...overrides,
  });

  test("a new event is a draft with a slug from its title; publish needs a date not passed", async () => {
    const parsed = parseWorkshopEvent(editorForm());
    if (!parsed.ok) throw new Error(parsed.fields.join());
    const saved = await saveWorkshopEvent(db, parsed.data, { adminId, now });
    expect(saved).toMatchObject({ ok: true, slug: "mother-s-day-cupcakes", version: 1 });
    const again = await saveWorkshopEvent(db, parsed.data, { adminId, now });
    expect(again).toMatchObject({ ok: true, slug: "mother-s-day-cupcakes-2" });
    const id = (saved as { id: string }).id;
    expect(await publishEvent(db, { eventId: id, version: 1, adminId, now, today: "2026-11-05" })).toEqual({ ok: true, version: 2, status: "published" });
    expect(await unpublishEvent(db, { eventId: id, version: 1, adminId, now })).toEqual({ ok: false, code: "EVENT_CHANGED" });
    expect(await unpublishEvent(db, { eventId: id, version: 2, adminId, now })).toEqual({ ok: true, version: 3, status: "draft" });
    expect(await publishEvent(db, { eventId: id, version: 3, adminId, now, today: "2027-06-01" })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  test("the editor's problems are listed by field; the end must be after the start", () => {
    const parsed = parseWorkshopEvent(editorForm({ titleEn: "", endsAt: "09:00", capacity: "0", "option.0.en": "", "option.0.fr": "" }));
    expect(parsed.ok ? [] : parsed.fields.sort()).toEqual(["capacity", "endsAt", "options", "titleEn"]);
  });

  test("moving the date or time moves its active registrations; capacity never below the places held", async () => {
    const eventId = await insertWorkshopEvent(database);
    const { orderId } = await registerTest(database, eventId, { cakes: "3", "cake.1": "choc", "cake.2": "choc" });
    const parsed = parseWorkshopEvent({ ...editorForm({ eventOn: "2027-02-13", startsAt: "15:00", endsAt: "17:00", capacity: "2" }), id: eventId, version: "1" });
    if (!parsed.ok) throw new Error(parsed.fields.join());
    expect(await saveWorkshopEvent(db, parsed.data, { adminId, now })).toEqual({ ok: false, code: "CAPACITY_BELOW_HELD", held: 3 });

    const fine = parseWorkshopEvent({ ...editorForm({ eventOn: "2027-02-13", startsAt: "15:00", endsAt: "17:00", capacity: "3" }), id: eventId, version: "1" });
    if (!fine.ok) throw new Error(fine.fields.join());
    expect(await saveWorkshopEvent(db, fine.data, { adminId, now })).toMatchObject({ ok: true, version: 2 });
    expect(await query("select fulfil_on::text as on, time_window->>'start' as start, version from orders where id = $1", [orderId])).toEqual([{ on: "2027-02-13", start: "15:00", version: 2 }]);
  });

  describe("tidy: a change of date, time or address tells the active registrants", () => {
    const save = async (overrides: Record<string, string>, eventId: string, v: number) => {
      const parsed = parseWorkshopEvent({ ...editorForm({ eventOn: WORKSHOP_DATE, startsAt: "14:00", endsAt: "16:30", ...overrides }), id: eventId, version: String(v) });
      if (!parsed.ok) throw new Error(parsed.fields.join());
      return saveWorkshopEvent(db, parsed.data, { adminId, now });
    };
    const changedMails = () => query("select to_email, payload, dedupe_key from email_outbox where template = 'workshop_changed' order by created_at, to_email");

    /** Pending (aisha), awaiting payment (ravi), confirmed (mia) and refused (zoe). */
    async function registrants(eventId: string) {
      const pending = await registerTest(database, eventId);
      const awaiting = await registerTest(database, eventId, { "contact.email": "ravi@example.com" });
      await approveOrder(db, { orderId: awaiting.orderId, version: 1, adminId, now });
      const confirmed = await registerTest(database, eventId, { "contact.email": "mia@example.com" });
      await approveOrder(db, { orderId: confirmed.orderId, version: 1, adminId, now });
      await markPaid(db, { orderId: confirmed.orderId, version: 2, adminId, now });
      const refused = await registerTest(database, eventId, { "contact.email": "zoe@example.com" });
      await declineOrder(db, { orderId: refused.orderId, version: 1, adminId, now, reason: null });
      return { pending, awaiting, confirmed, refused };
    }

    test("a new date and time email pending, awaiting-payment and confirmed registrants once, naming the previous values; refused ones are not told", async () => {
      const eventId = await insertWorkshopEvent(database);
      const { refused } = await registrants(eventId);

      const saved = await save({ eventOn: "2027-02-21", startsAt: "15:00", endsAt: "17:30" }, eventId, 1);

      expect(saved).toMatchObject({ ok: true, version: 2, told: 3 });
      const mails = await changedMails();
      expect(mails.map((m) => m.to_email).sort()).toEqual(["aisha@example.com", "mia@example.com", "ravi@example.com"]);
      for (const mail of mails) {
        expect(mail.payload).toEqual({ orderId: expect.any(String), previousDate: WORKSHOP_DATE, previousStart: "14:00", previousEnd: "16:30" });
        expect(mail.dedupe_key).toMatch(/^order:.+:workshop_changed:2$/);
      }
      const logged = await query("select order_id, type, details from order_event where type = 'workshop_changed'");
      expect(logged).toHaveLength(3);
      expect(logged.some((row) => row.order_id === refused.orderId)).toBe(false);
      expect(logged[0]!.details).toEqual({ previousDate: WORKSHOP_DATE, previousStart: "14:00", previousEnd: "16:30" });
    });

    test("a title-only edit tells no one; an address change alone names the previous address", async () => {
      const eventId = await insertWorkshopEvent(database);
      await registerTest(database, eventId);

      expect(await save({ titleEn: "Valentine's cakes, new name" }, eventId, 1)).toMatchObject({ ok: true, told: 0 });
      expect(await changedMails()).toEqual([]);

      expect(await save({ address: "3 Royal Road, Rose Hill" }, eventId, 2)).toMatchObject({ ok: true, told: 1 });
      const [mail] = await changedMails();
      expect(mail!.payload).toEqual({ orderId: expect.any(String), previousAddress: "12 Rue Example, Beau Bassin" });
    });

    test("each change is its own email: changing back later tells the registrant again", async () => {
      const eventId = await insertWorkshopEvent(database);
      await registerTest(database, eventId);

      await save({ startsAt: "15:00" }, eventId, 1);
      await save({ startsAt: "14:00" }, eventId, 2);

      expect((await changedMails()).map((m) => m.payload)).toEqual([
        { orderId: expect.any(String), previousStart: "14:00" },
        { orderId: expect.any(String), previousStart: "15:00" },
      ]);
    });
  });

  test("cancelling the event cancels and tells every registrant; a paid one owes a refund", async () => {
    const eventId = await insertWorkshopEvent(database);
    const unpaid = await registerTest(database, eventId);
    const paid = await registerTest(database, eventId, { "contact.email": "ravi@example.com" });
    await approveOrder(db, { orderId: paid.orderId, version: 1, adminId, now });
    await markPaid(db, { orderId: paid.orderId, version: 2, adminId, now });

    const result = await cancelEvent(db, { eventId, version: 1, adminId, now, reason: "The oven broke" });
    expect(result).toEqual({ ok: true, version: 2, status: "cancelled" });
    const orders = await query("select contact_email, status, cancel_reason, refund_due_rs from orders order by contact_email");
    expect(orders).toEqual([
      { contact_email: "aisha@example.com", status: "cancelled", cancel_reason: "event_cancelled", refund_due_rs: null },
      { contact_email: "ravi@example.com", status: "cancelled", cancel_reason: "event_cancelled", refund_due_rs: 1500 },
    ]);
    const mails = await query("select to_email, payload->>'reason' as reason from email_outbox where template = 'workshop_cancelled' order by to_email");
    expect(mails).toEqual([
      { to_email: "aisha@example.com", reason: "The oven broke" },
      { to_email: "ravi@example.com", reason: "The oven broke" },
    ]);
    expect(unpaid.orderId).toBeTruthy();
    expect(await registerWorkshop(registrationForm(eventId), registerContext(database))).toEqual({ ok: false, code: "WORKSHOP_CLOSED" });
  });

  test("marking completed (on or after its date) completes the paid registrations; unanswered ones close", async () => {
    const eventId = await insertWorkshopEvent(database);
    const paid = await registerTest(database, eventId);
    await registerTest(database, eventId, { "contact.email": "ravi@example.com" });
    await approveOrder(db, { orderId: paid.orderId, version: 1, adminId, now });
    await markPaid(db, { orderId: paid.orderId, version: 2, adminId, now });

    expect(await completeEvent(db, { eventId, version: 1, adminId, now, today: "2027-02-13" })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await completeEvent(db, { eventId, version: 1, adminId, now, today: WORKSHOP_DATE })).toEqual({ ok: true, version: 2, status: "completed" });
    expect(await query("select contact_email, status from orders order by contact_email")).toEqual([
      { contact_email: "aisha@example.com", status: "completed" },
      { contact_email: "ravi@example.com", status: "cancelled" },
    ]);
  });
});
