// E-15 S-303: the workshop event page (`/workshops/:slug`) through its route module on PGlite:
// open, full, cancelled, past and draft events; the form's data; register (redirect to the
// confirmation, places ran out, allergies required, Turnstile) in EN and FR.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { routeArgs } from "~/server/testing/route-context";
import { WORKSHOP_NOW, insertWorkshopEvent, registerTest, registrationForm } from "~/server/testing/workshops";
import type { TurnstileCheck } from "~/server/turnstile.server";
import { action, loader } from "./workshop";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Page = { state: string; event: { title: string; placesLeft: number; dateLabel: string; timeLabel: string }; form: { maxCakes: number; options: { id: string; name: string }[]; prefill: unknown } | null };
type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };

const load = (slug: string, path = `/workshops/${slug}`, now = WORKSHOP_NOW) => loader(routeArgs(database, { path, params: { slug }, now }) as never) as Promise<Page>;
const post = (slug: string, form: Record<string, string>, path = `/workshops/${slug}`, extra: Partial<Parameters<typeof routeArgs>[1]> = {}) =>
  action(routeArgs(database, { path, params: { slug }, form, now: WORKSHOP_NOW, ...extra }) as never) as Promise<unknown>;

const formOf = (eventId: string, overrides: Record<string, string | undefined> = {}) => registrationForm(eventId, overrides) as Record<string, string>;

describe("loader", () => {
  test("an open event: its facts in the page language and the form with up to the places left (at most 10)", async () => {
    await insertWorkshopEvent(database, { slug: "valentines", capacity: 12 });
    const fr = await load("valentines", "/fr/workshops/valentines");
    expect(fr).toMatchObject({ state: "open", event: { title: "Atelier gâteau de la Saint-Valentin", placesLeft: 12, dateLabel: "dimanche 14 février 2027", timeLabel: "14 h 00 – 16 h 30" } });
    expect(fr.form).toMatchObject({ maxCakes: 10, options: [{ id: "choc", name: "Chocolat" }, { id: "rv", name: "Red velvet" }], prefill: null });
  });

  test("full, cancelled and past events have no form; a draft or unknown event is 404", async () => {
    const full = await insertWorkshopEvent(database, { slug: "full", capacity: 1 });
    await registerTest(database, full);
    await insertWorkshopEvent(database, { slug: "cancelled", status: "cancelled" });
    await insertWorkshopEvent(database, { slug: "past", eventOn: "2026-11-01" });
    await insertWorkshopEvent(database, { slug: "draft", status: "draft" });
    expect(await load("full")).toMatchObject({ state: "full", form: null });
    expect(await load("cancelled")).toMatchObject({ state: "cancelled", form: null });
    expect(await load("past")).toMatchObject({ state: "past", form: null });
    await expect(load("draft")).rejects.toMatchObject({ init: { status: 404 } });
    await expect(load("nothing")).rejects.toMatchObject({ init: { status: 404 } });
  });
});

describe("register", () => {
  test("a valid registration redirects to its confirmation in the page language", async () => {
    const id = await insertWorkshopEvent(database, { slug: "valentines" });
    const answer = (await post("valentines", formOf(id), "/fr/workshops/valentines")) as Response;
    expect(answer.status).toBe(302);
    expect(answer.headers.get("Location")).toMatch(/^\/fr\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
  });

  test("the allergies question must be answered; the form keeps what was typed", async () => {
    const id = await insertWorkshopEvent(database, { slug: "valentines" });
    const refused = (await post("valentines", formOf(id, { allergiesChoice: undefined, peopleNames: "Aisha and Ravi" }))) as Refusal & { data: { values: Record<string, string> } };
    expect(refused.init.status).toBe(400);
    expect(refused.data.error.fields).toEqual({ allergiesChoice: "Choose None, or Yes and describe them." });
    expect(refused.data.values).toMatchObject({ peopleNames: "Aisha and Ravi", "cake.0": "choc", "contact.name": "Aisha Test" });
  });

  test("when the places ran out meanwhile, the answer says how many are left (409) and keeps the form", async () => {
    const id = await insertWorkshopEvent(database, { slug: "valentines", capacity: 2 });
    await registerTest(database, id);
    const refused = (await post("valentines", formOf(id, { cakes: "2", "cake.1": "rv" }))) as Refusal;
    expect(refused.init.status).toBe(409);
    expect(refused.data.error).toMatchObject({ code: "WORKSHOP_FULL", fields: { cakes: "Only 1 place is left now. Please choose fewer cakes." } });
  });

  test("a failed bot check is refused before anything is written", async () => {
    const id = await insertWorkshopEvent(database, { slug: "valentines" });
    const turnstile = { siteKey: "x", verify: async () => "failed" } as unknown as TurnstileCheck;
    const refused = (await post("valentines", formOf(id), "/workshops/valentines", { turnstile })) as Refusal;
    expect(refused.data.error.code).toBe("BOT_CHECK_FAILED");
    expect((await database.client.query("select count(*)::int as n from orders")).rows).toEqual([{ n: 0 }]);
  });
});
