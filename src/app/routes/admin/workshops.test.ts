// E-15 admin Workshops through the route modules on PGlite: the list (S-301 AC1), save, publish,
// cancel with every registrant told (S-301 AC2..AC5, S-306), the registrations and the printable
// list with allergies for admins only and a Share text without customer data (S-305), and Accept
// on the order screen (S-304 AC1).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { action as orderAction, loader as orderLoader } from "~/routes/admin/order";
import { action as eventAction, loader as eventLoader } from "~/routes/admin/workshop";
import { loader as listPageLoader } from "~/routes/admin/workshop-list";
import { loader as listLoader } from "~/routes/admin/workshops";
import { signedInAdmin } from "~/server/testing/admin-session";
import { routeArgs } from "~/server/testing/route-context";
import { WORKSHOP_NOW, insertWorkshopEvent, registerTest } from "~/server/testing/workshops";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const NOW = WORKSHOP_NOW;
type Answer = { ok: boolean; id?: string; status?: string; data?: { ok: false; error: { code: string; fields?: Record<string, string> } } };

async function as(role: "admin" | "owner" = "admin") {
  return signedInAdmin(database, { role, email: `${role}-${crypto.randomUUID().slice(0, 6)}@example.com` });
}

const editor = {
  intent: "save",
  id: "",
  version: "",
  titleEn: "Valentine's cake workshop",
  titleFr: "",
  descriptionEn: "Decorate together.",
  eventOn: "2027-02-14",
  startsAt: "14:00",
  endsAt: "16:30",
  address: "12 Rue Example, Beau Bassin",
  mapUrl: "",
  priceRs: "1500",
  capacity: "10",
  "option.0.id": "",
  "option.0.en": "Chocolate",
  "option.0.fr": "Chocolat",
  "option.1.id": "",
  "option.1.en": "Red velvet",
  "option.1.fr": "",
};

describe("S-301: create, publish, list", () => {
  test("an Admin creates a draft, publishes it and sees it in the list with its places", async () => {
    const session = await as("admin");
    const saved = (await eventAction(routeArgs(database, { path: "/admin/workshops/new", auth: session.auth, cookie: session.cookie, form: editor, now: NOW }) as never)) as Answer;
    expect(saved).toMatchObject({ ok: true, intent: "save", created: true });
    const id = saved.id!;
    const published = (await eventAction(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form: { intent: "publish", version: "1" }, now: NOW }) as never)) as Answer;
    expect(published).toMatchObject({ ok: true, status: "published" });

    const list = (await listLoader(routeArgs(database, { path: "/admin/workshops", auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as { events: { title: string; status: string; held: number; capacity: number; past: boolean }[] };
    expect(list.events).toEqual([expect.objectContaining({ title: "Valentine's cake workshop", status: "published", held: 0, capacity: 10, past: false })]);
  });

  test("every problem of the editor at once, with the field named", async () => {
    const session = await as();
    const refused = (await eventAction(routeArgs(database, { path: "/admin/workshops/new", auth: session.auth, cookie: session.cookie, form: { ...editor, titleEn: "", endsAt: "13:00", "option.0.en": "", "option.0.fr": "", "option.1.en": "" }, now: NOW }) as never)) as Answer;
    expect(refused.data?.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(refused.data?.error.fields ?? {}).sort()).toEqual(["endsAt", "options", "titleEn"]);
    expect(refused.data?.error.fields?.titleEn).toBe("Title in English: please check this.");
  });

  test("an anonymous visitor is sent to sign in, never shown data", async () => {
    await expect(listLoader(routeArgs(database, { path: "/admin/workshops", now: NOW }) as never)).rejects.toMatchObject({ status: 302 });
  });
});

describe("S-305, S-306: registrations, printable list, cancel", () => {
  test("the event shows each registration with choices, allergies and totals per cake", async () => {
    const id = await insertWorkshopEvent(database);
    await registerTest(database, id, { cakes: "2", "cake.1": "rv", allergiesChoice: "yes", allergies: "Peanuts" });
    await registerTest(database, id, { "contact.email": "ravi@example.com", "contact.name": "Ravi Test" });
    const session = await as();
    const page = (await eventLoader(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as {
      event: { held: number; left: number };
      registrations: { contactName: string; choices: string[]; allergies: string | null; totalRs: number }[];
      totals: { name: string; cakes: number }[];
    };
    expect(page.event).toMatchObject({ held: 3, left: 7 });
    expect(page.registrations).toEqual([
      expect.objectContaining({ contactName: "Aisha Test", choices: ["Chocolate × 1", "Red velvet × 1"], allergies: "Peanuts", totalRs: 3000 }),
      expect.objectContaining({ contactName: "Ravi Test", choices: ["Chocolate × 1"], allergies: null, totalRs: 1500 }),
    ]);
    expect(page.totals).toEqual([
      { name: "Chocolate", cakes: 2 },
      { name: "Red velvet", cakes: 1 },
    ]);
  });

  test("the printable list holds the allergies; its Share text holds no names, phones or allergies", async () => {
    const id = await insertWorkshopEvent(database);
    await registerTest(database, id, { allergiesChoice: "yes", allergies: "Peanuts" });
    const session = await as();
    const list = (await listPageLoader(routeArgs(database, { path: `/admin/workshops/${id}/list`, params: { id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as { rows: { allergies: string | null; phone: string }[]; shareText: string };
    expect(list.rows).toEqual([expect.objectContaining({ allergies: "Peanuts", phone: "+23057123456" })]);
    expect(list.shareText).toContain("1 of 10 cakes");
    expect(list.shareText).toContain("Chocolate: 1 cake");
    expect(list.shareText).toContain("1 registration with allergies");
    expect(list.shareText).not.toMatch(/Peanuts|Aisha|5712/);
  });

  test("Cancel workshop cancels and tells every registrant, and offers WhatsApp links", async () => {
    const id = await insertWorkshopEvent(database);
    await registerTest(database, id);
    const session = await as("owner");
    const answer = (await eventAction(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form: { intent: "cancelEvent", version: "1", reason: "Oven repair" }, now: NOW }) as never)) as Answer;
    expect(answer).toMatchObject({ ok: true, status: "cancelled" });
    expect((await database.client.query("select template from email_outbox where template = 'workshop_cancelled'")).rows).toHaveLength(1);
    const page = (await eventLoader(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as { registrations: { status: string; whatsappUrl: string | null }[] };
    expect(page.registrations[0]).toMatchObject({ status: "cancelled", whatsappUrl: expect.stringContaining("https://wa.me/23057123456?text=") });
  });

  test("tidy: a new time says how many registrants were emailed and offers a WhatsApp link with the new details", async () => {
    const session = await as("owner");
    const id = await insertWorkshopEvent(database);
    await registerTest(database, id);
    const before = (await eventLoader(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as { registrations: { changed: boolean }[] };
    expect(before.registrations[0]).toMatchObject({ changed: false });

    const saved = (await eventAction(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form: { ...editor, id, version: "1", startsAt: "15:00", endsAt: "17:30" }, now: NOW }) as never)) as Answer & { told?: number };

    expect(saved).toMatchObject({ ok: true, intent: "save", told: 1 });
    const page = (await eventLoader(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as { registrations: { changed: boolean; whatsappUrl: string }[] };
    expect(page.registrations[0]!.changed).toBe(true);
    const text = decodeURIComponent(new URL(page.registrations[0]!.whatsappUrl).searchParams.get("text") ?? "");
    expect(text).toBe("Hello, a change to the workshop Valentine's cake workshop: it is now on Sunday, 14 February 2027, 15:00–17:30, at 12 Rue Example, Beau Bassin. We also sent you an email.");
  });

  test("a stale page gets EVENT_CHANGED", async () => {
    const id = await insertWorkshopEvent(database);
    const session = await as();
    const answer = (await eventAction(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form: { intent: "unpublish", version: "7" }, now: NOW }) as never)) as Answer;
    expect(answer.data?.error.code).toBe("EVENT_CHANGED");
  });
});

describe("S-304 AC1: Accept (approve) on the order screen", () => {
  test("a pending registration offers Accept and no preparation steps; Accept (the approve intent) moves it to Awaiting payment", async () => {
    const id = await insertWorkshopEvent(database);
    const { orderId } = await registerTest(database, id, { allergiesChoice: "yes", allergies: "Gluten" });
    const session = await as();
    const args = () => routeArgs(database, { path: `/admin/orders/${orderId}`, params: { id: orderId }, auth: session.auth, cookie: session.cookie, now: NOW });
    const page = (await orderLoader(args() as never)) as { allowed: { approve: boolean; advance: string | null; edit: boolean }; workshop: { allergies: string | null; cakes: number } };
    expect(page.allowed).toMatchObject({ approve: true, advance: null, edit: false });
    expect(page.workshop).toMatchObject({ allergies: "Gluten", cakes: 1 });

    const accepted = (await orderAction(routeArgs(database, { path: `/admin/orders/${orderId}`, params: { id: orderId }, auth: session.auth, cookie: session.cookie, form: { intent: "approve", version: "1" }, now: NOW }) as never)) as { ok: boolean; order: { status: string } };
    expect(accepted).toMatchObject({ ok: true, order: { status: "awaiting_payment" } });
  });
});
