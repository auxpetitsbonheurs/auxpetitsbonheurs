// S-201 (whatsappLink) and S-203 (the WhatsApp menu and the email_failed log line) on `admin/order`.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./order";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

async function placed(overrides: Record<string, string> = {}) {
  const { token } = await placeTestOrder(database, { overrides: { "contact.name": "Zoé & Co #1", ...overrides } });
  return (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
}

type Page = { whatsapp: { templates: { key: string; label: string; url: string }[] | null }; events: { type: string; text: string; notes: string[] }[] };
const load = async (id: string) => (await loader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie }) as never)) as unknown as Page;
const post = (id: string, form: Record<string, string>, cookie = session.cookie) =>
  action(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie, form }) as never) as Promise<unknown>;

type Refusal = { data: { ok: false; intent?: string; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };
const text = (url: string) => new URL(url).searchParams.get("text") ?? "";

describe("whatsappLink (S-201)", () => {
  test("AC3: +23057123456 gives https://wa.me/23057123456?text=<encoded message>; no state change, no event", async () => {
    const id = await placed();
    const before = await database.client.query("select version, status from orders where id = $1", [id]);
    const events = (await database.client.query("select 1 from order_event where order_id = $1", [id])).rows.length;

    const result = (await post(id, { intent: "whatsappLink", template: "blank" })) as { ok: true; intent: string; url: string };

    expect(result.url.startsWith("https://wa.me/23057123456?text=")).toBe(true);
    expect(text(result.url)).toMatch(/^Hello Zoé, about your order APB-\d{4}:$/);
    expect((await database.client.query("select version, status from orders where id = $1", [id])).rows).toEqual(before.rows);
    expect((await database.client.query("select 1 from order_event where order_id = $1", [id])).rows).toHaveLength(events);
  });

  test("AC6: an order with no usable phone is VALIDATION_FAILED with a field message", async () => {
    const id = await placed();
    await database.client.query("update orders set contact_phone = 'none' where id = $1", [id]);

    const result = (await post(id, { intent: "whatsappLink", template: "approved" })) as Refusal;

    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(result.data.error.fields?.phone).toBeTruthy();
  });

  test("AC7: an unknown order is NOT_FOUND; a customer is refused and gets nothing", async () => {
    const missing = (await post("00000000-0000-4000-8000-000000000000", { intent: "whatsappLink", template: "blank" })) as Refusal;
    expect(missing.data.error.code).toBe("NOT_FOUND");

    const id = await placed();
    const customer = await insertCustomerAccount(database, session.auth);
    const refused = (await post(id, { intent: "whatsappLink", template: "blank" }, session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"))).catch((error: unknown) => error)) as Refusal;
    expect(refused.init.status).toBe(403);
    expect(JSON.stringify(refused)).not.toContain("wa.me");
  });

  test("an unknown template key is VALIDATION_FAILED", async () => {
    const id = await placed();
    expect(((await post(id, { intent: "whatsappLink", template: "foo" })) as Refusal).data.error.code).toBe("VALIDATION_FAILED");
  });

  test("AC9: a counter line with the template key and locale only, no PII", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const id = await placed();

    await post(id, { intent: "whatsappLink", template: "payment_reminder" });

    const lines = log.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("whatsapp_link_opened"));
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([{ level: "info", event: "whatsapp_link_opened", template: "payment_reminder", locale: "en" }]);
    expect(lines.join("")).not.toMatch(/Zo|5712|aisha/);
  });
});

describe("the WhatsApp menu (S-203)", () => {
  test("AC1: every template is a ready wa.me link with the message prefilled, labelled in the admin's language", async () => {
    const id = await placed({ ...DELIVERY_ORDER, displayedTotalRs: "1050" });

    const { templates } = (await load(id)).whatsapp;

    expect(templates?.map((item) => item.key)).toEqual(["approved", "ready", "on_the_way", "payment_instructions", "payment_reminder", "blank"]);
    expect(templates?.map((item) => item.label)).toEqual(["Order confirmed", "Order ready", "On the way", "Payment details", "Payment reminder", "Blank message"]);
    for (const item of templates ?? []) {
      expect(new URL(item.url).host).toBe("wa.me");
      expect(text(item.url)).not.toMatch(/[{}]/);
    }
    expect(text(templates![0]!.url)).toContain("http://localhost/t/");
  });

  test("approve, then pay: once approved, the payment details message has the Juice account, amount, reference and the pay-by time 24 h after approval (EN, FR)", async () => {
    const id = await placed({ ...DELIVERY_ORDER, displayedTotalRs: "1050" });
    await database.client.query("update settings set juice_name = 'A. Baker', juice_number = '5000 0001'");
    await database.client.query("update orders set status = 'awaiting_payment', awaiting_payment_since = '2026-11-20T06:00:00Z' where id = $1", [id]);
    const message = async () => text((await load(id)).whatsapp.templates!.find((item) => item.key === "payment_instructions")!.url);

    expect(await message()).toBe(
      "Hello Zoé, your order APB-0001 for Thursday, 12 November 2026 is approved! To confirm it, please send Rs 1,050 by Juice to A. Baker (5000 0001) with the reference APB-0001, by Sat 21 Nov, 10:00. Then reply here with your payment screenshot. Thank you!",
    );
    await database.client.query("update orders set locale = 'fr' where id = $1", [id]);
    expect(await message()).toMatch(/^Bonjour Zoé, votre commande APB-0001 .* est validée ! .*Rs 1[  ,.]?050 par Juice à A\. Baker \(5000 0001\) avec la référence APB-0001, avant le sam\. 21 nov\., 10:00\./);
  });

  test("AC2: no usable phone: no menu (the view disables the button with the reason)", async () => {
    const id = await placed();
    await database.client.query("update orders set contact_phone = '' where id = $1", [id]);

    expect((await load(id)).whatsapp.templates).toBeNull();
  });

  test("AC5: an FR order gets the FR text and the /fr tracking link; Owner templates are used", async () => {
    const id = await placed();
    await database.client.query("update orders set locale = 'fr' where id = $1", [id]);
    await database.client.query(`update settings set whatsapp_templates = '{"blank": {"en": "Hi {name}", "fr": "Coucou {name} {tracking_link}"}}'`);

    const { templates } = (await load(id)).whatsapp;

    expect(text(templates!.find((item) => item.key === "blank")!.url)).toMatch(/^Coucou Zoé http:\/\/localhost\/fr\/t\//);
    expect(text(templates!.find((item) => item.key === "approved")!.url)).toMatch(/^Bonjour Zoé, votre commande/);
  });

  test("AC3, AC4: a dead email shows email_failed with the reason and the WhatsApp hint; a sent one shows nothing", async () => {
    const id = await placed();
    expect((await load(id)).events.filter((event) => event.type === "email_failed")).toEqual([]);

    await database.client.query("insert into order_event (order_id, actor_type, type, details) values ($1, 'system', 'email_failed', $2)", [id, JSON.stringify({ template: "order_confirmed", reason: "provider_permanent" })]);

    const failed = (await load(id)).events.find((event) => event.type === "email_failed")!;
    expect(failed.text).toMatch(/^An email to the customer could not be delivered/);
    expect(failed.notes).toEqual(["The address refused it.", "Send the tracking link by WhatsApp instead."]);
  });

  test("SEC-07: an email held back by the per-recipient cap says so, with the cap, in EN and FR", async () => {
    const id = await placed();
    await database.client.query("insert into order_event (order_id, actor_type, type, details) values ($1, 'system', 'email_failed', $2)", [id, JSON.stringify({ template: "order_received", reason: "recipient_cap" })]);
    const french = await signedInAdmin(database, { name: "Lea", locale: "fr" });

    const english = (await load(id)).events.find((event) => event.type === "email_failed")!;
    const page = (await loader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: french.auth, cookie: french.cookie }) as never)) as unknown as Page;

    expect(english.notes[0]).toBe("Not sent: this address already got 3 order or request emails in 24 hours (anti-spam limit).");
    expect(page.events.find((event) => event.type === "email_failed")?.notes[0]).toBe("Non envoyé : cette adresse a déjà reçu 3 e-mails de commande ou de demande en 24 heures (limite anti-spam).");
  });

  test("AC9: the failure text and the labels exist in French", async () => {
    const french = await signedInAdmin(database, { name: "Lea", locale: "fr" });
    const id = await placed();
    await database.client.query("insert into order_event (order_id, actor_type, type, details) values ($1, 'system', 'email_failed', $2)", [id, JSON.stringify({ reason: "provider" })]);

    const page = (await loader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: french.auth, cookie: french.cookie }) as never)) as unknown as Page;

    expect(page.whatsapp.templates?.[0]?.label).toBe("Commande confirmée");
    expect(page.events.find((event) => event.type === "email_failed")?.notes).toEqual(["Le service d'e-mail a échoué 6 fois.", "Envoyez plutôt le lien de suivi par WhatsApp."]);
  });
});
