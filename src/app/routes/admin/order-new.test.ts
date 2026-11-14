// `admin/order-new` create and `admin/customer-lookup` findCustomer (E-07 S-131..S-135).
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { optionGroup } from "~/db/schema";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertPromotion } from "~/db/testing/promotions";
import type { JobContext } from "~/jobs/types";
import { paymentDeadlines } from "~/jobs/payment-deadlines";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { routeArgs } from "~/server/testing/route-context";
import { loader as calendarLoader } from "./calendar";
import { action as lookupAction } from "./customer-lookup";
import { action, loader } from "./order-new";
import { loader as orderLoader } from "./order";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;
let cake: string;

/** Sat 14 Nov 2026, 10:00 in Mauritius; default notice 3 days, Sundays closed. */
const NOW = "2026-11-14T06:00:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
  cake = await insertProduct(database.db, { slug: "chocolate-cake" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Body = Record<string, unknown>;
type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> }; names?: string[] }; init: { status: number } };

function body(changes: Body = {}): Body {
  return {
    idempotencyKey: randomUUID(),
    lines: [{ lineId: "a", productId: cake, options: [], quantity: 1 }],
    date: "2026-11-20",
    windowId: "morning",
    fulfilment: "pickup",
    deliveryFeeRs: 200,
    contact: { name: "Anna Rault", phone: "5712 3456", email: "" },
    locale: "en",
    paid: false,
    ...changes,
  };
}

async function settle(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (thrown) {
    return thrown;
  }
}

const create = (changes: Body = {}, cookie = session.cookie) =>
  settle(() => action(routeArgs(database, { path: "/admin/orders/new", auth: session.auth, cookie, form: { intent: "create", payload: JSON.stringify(body(changes)) }, now: NOW }) as never));
const createRaw = (payload: Body) => settle(() => action(routeArgs(database, { path: "/admin/orders/new", auth: session.auth, cookie: session.cookie, form: { intent: "create", payload: JSON.stringify(payload) }, now: NOW }) as never));
const lookup = async (form: Record<string, string>, cookie = session.cookie) => {
  const answer = await settle(() => lookupAction(routeArgs(database, { path: "/admin/customer-lookup", auth: session.auth, cookie, form, now: NOW }) as never));
  return answer instanceof Response ? { status: answer.status, json: answer.headers.get("content-type")?.includes("json") ? await answer.json() : null } : answer;
};

function created(answer: unknown): { id: string; query: URLSearchParams } {
  if (!(answer instanceof Response)) throw new Error(`not saved: ${JSON.stringify((answer as Refusal).data ?? answer)}`);
  const [path, query] = answer.headers.get("Location")!.split("?");
  return { id: path!.split("/").pop()!, query: new URLSearchParams(query) };
}

const order = async (id: string) => (await database.client.query<Record<string, unknown>>("select * from orders where id = $1", [id])).rows[0]!;
const rows = async (q: string, params: unknown[] = []) => (await database.client.query<Record<string, unknown>>(q, params)).rows;

describe("Add order loader (S-131 AC4, AC11)", () => {
  test("an empty form's data: menu, windows, Settings fee, today, a fresh key, the admin's language", async () => {
    const page = await loader(routeArgs(database, { path: "/admin/orders/new", auth: session.auth, cookie: session.cookie, now: NOW }) as never);
    expect(page).toMatchObject({ today: "2026-11-14", deliveryFeeRs: 200, locale: "en", idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(page.menu.products.map((p) => p.id)).toContain(cake);
  });

  test("a customer session is refused and nothing is created", async () => {
    const customer = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    expect(await create({}, cookie)).toMatchObject({ init: { status: 403 } });
    expect(await rows("select id from orders")).toEqual([]);
  });
});

describe("create (S-131)", () => {
  test("saves Approved, source manual, the next number, total = items + fee; one created event by me; counts in the calendar (AC1, AC5, AC10)", async () => {
    const { id, query } = created(await create());
    expect(query.get("created")).toBe("1");
    expect(await order(id)).toMatchObject({ status: "approved", source: "manual", number: 1, items_total_rs: 850, delivery_fee_rs: 0, total_rs: 850, paid: false, policies_accepted_at: null });
    expect(await rows("select type, actor_type, actor_admin_id, to_status, details from order_event where order_id = $1", [id])).toEqual([
      { type: "created", actor_type: "admin", actor_admin_id: session.admin.id, to_status: "approved", details: { source: "manual" } },
    ]);
    const month = await calendarLoader(routeArgs(database, { path: "/admin/calendar?month=2026-11", auth: session.auth, cookie: session.cookie, now: NOW }) as never);
    expect(month.days.find((d) => d.date === "2026-11-20")).toMatchObject({ pickup: 1 });
  });

  test("a missing required option refuses the line; nothing is created (AC2)", async () => {
    await database.db.insert(optionGroup).values({ productId: cake, nameEn: "Size", kind: "single", required: true });
    const refused = (await create()) as Refusal;
    expect(refused.data.error).toMatchObject({ code: "VALIDATION_FAILED", fields: { lines: expect.any(String) } });
    expect(await rows("select id from orders")).toEqual([]);
  });

  test("prices come from the server with the live promotion; a posted total is ignored (AC3)", async () => {
    await insertPromotion(database, { starts: "2026-11-01T00:00:00Z", ends: "2026-12-01T00:00:00Z", discounts: [{ productId: cake, salePriceRs: 700 }] });
    const { id } = created(await create({ totalRs: 1, lines: [{ lineId: "a", productId: cake, options: [], quantity: 2, unitPriceRs: 1 }] }));
    expect(await order(id)).toMatchObject({ items_total_rs: 1400, total_rs: 1400 });
  });

  test("a double tap with one key makes one order and both answers point to it (AC6)", async () => {
    const payload = body();
    const [a, b] = await Promise.all([createRaw(payload), createRaw(payload)]);
    expect(created(a).id).toBe(created(b).id);
    expect(await rows("select id from orders")).toHaveLength(1);
  });

  test("21 lines are refused (AC7)", async () => {
    const lines = Array.from({ length: 21 }, (_, i) => ({ freeText: { name: `Item ${i}`, priceRs: 10, quantity: 1 } }));
    const refused = (await create({ lines })) as Refusal;
    expect(refused.data.error.fields).toHaveProperty("lines");
  });

  test("a product hidden since the form loaded is PRODUCT_UNAVAILABLE and nothing is saved (AC8)", async () => {
    await database.client.query("update product set status = 'hidden' where id = $1", [cake]);
    const refused = (await create()) as Refusal;
    expect(refused.data.error.code).toBe("PRODUCT_UNAVAILABLE");
    expect(refused.data.names).toEqual(["Chocolate cake"]);
    expect(await rows("select id from orders")).toEqual([]);
  });

  test("delivery needs an address of 5+; a name over 80 is refused (AC9)", async () => {
    expect(((await create({ fulfilment: "delivery", windowId: "morning", address: "abc" })) as Refusal).data.error.fields).toHaveProperty("address");
    expect(((await create({ contact: { name: "x".repeat(81), phone: "5712 3456" } })) as Refusal).data.error.fields).toHaveProperty(["contact.name"]);
  });
});

describe("free text, fee and paid (S-132)", () => {
  test("a free-text item is stored once for both languages without a product (AC1); Rs 0 is allowed (AC3)", async () => {
    const { id } = created(await create({ lines: [{ freeText: { name: "Gift box", priceRs: 400, quantity: 2 } }] }));
    expect(await rows("select product_id, name_en, name_fr, options, line_total_rs from order_item where order_id = $1", [id])).toEqual([{ product_id: null, name_en: "Gift box", name_fr: "Gift box", options: [], line_total_rs: 800 }]);
    const gift = created(await create({ lines: [{ freeText: { name: "Gift", priceRs: 0, quantity: 1 } }] }));
    expect(await order(gift.id)).toMatchObject({ total_rs: 0 });
  });

  test("a free-text item outside its limits is refused (AC2)", async () => {
    expect(((await create({ lines: [{ freeText: { name: "", priceRs: 10, quantity: 1 } }] })) as Refusal).data.error.code).toBe("VALIDATION_FAILED");
    expect(((await create({ lines: [{ freeText: { name: "Box", priceRs: 10, quantity: 51 } }] })) as Refusal).data.error.code).toBe("VALIDATION_FAILED");
  });

  test("an edited delivery fee is kept (0 too); pickup forces Rs 0 (AC4, AC6, AC7)", async () => {
    const delivery = { fulfilment: "delivery", address: "12 Royal Road, Rose Hill" };
    expect(await order(created(await create({ ...delivery, deliveryFeeRs: 150 })).id)).toMatchObject({ delivery_fee_rs: 150, total_rs: 1000 });
    expect(await order(created(await create({ ...delivery, deliveryFeeRs: 0 })).id)).toMatchObject({ delivery_fee_rs: 0, total_rs: 850 });
    expect(await order(created(await create({ fulfilment: "pickup", deliveryFeeRs: 150 })).id)).toMatchObject({ delivery_fee_rs: 0, total_rs: 850 });
    expect(((await create({ ...delivery, deliveryFeeRs: 1_000_001 })) as Refusal).data.error.fields).toHaveProperty("deliveryFeeRs");
  });

  test("Paid sets paid, paid_at, paid_by and logs Marked paid with created (AC8)", async () => {
    const { id } = created(await create({ paid: true }));
    expect(await order(id)).toMatchObject({ paid: true, paid_at: new Date(NOW), paid_by: session.admin.id });
    expect((await rows("select type from order_event where order_id = $1 order by id", [id])).map((r) => r.type)).toEqual(["created", "marked_paid"]);
  });

  test("payment: a manual order is never awaiting payment, so the 24 h unpaid cancel leaves it alone, paid or not", async () => {
    const unpaid = created(await create()).id;
    const paid = created(await create({ paid: true })).id;
    await paymentDeadlines({ db: database.db, now: new Date("2026-11-17T06:00:00Z") } as unknown as JobContext);
    expect(await order(unpaid)).toMatchObject({ status: "approved", paid: false });
    expect(await order(paid)).toMatchObject({ status: "approved", paid: true });
  });
});

describe("customer matching (S-133)", () => {
  async function stored(name: string, phone: string, email: string | null = null, locale = "en") {
    return (await database.client.query<{ id: string }>("insert into customer (name, phone, email, locale) values ($1, $2, $3, $4) returning id", [name, phone, email, locale])).rows[0]!.id;
  }

  test("a phone in another format finds the stored customer with their order count; saving reuses them (AC1)", async () => {
    const anna = await stored("Anna Rault", "57123456");
    expect(await lookup({ phone: "+230 5712 3456" })).toMatchObject({ status: 200, json: { ok: true, customer: { id: anna, name: "Anna Rault", phone: "57123456", email: null, locale: "en", orderCount: 0 }, conflict: false } });
    const { id } = created(await create({ contact: { name: "Anna", phone: "230-5712-3456" } }));
    expect(await order(id)).toMatchObject({ customer_id: anna, contact_name: "Anna" });
    expect(await rows("select name from customer")).toEqual([{ name: "Anna Rault" }]);
  });

  test("an email in another case is the same customer (AC2); email beats phone with a conflict (AC5)", async () => {
    const anna = await stored("Anna Rault", "57000000", "anna@example.com");
    await stored("Marc", "57123456");
    expect(await lookup({ email: "Anna@Example.COM", phone: "5712 3456" })).toMatchObject({ json: { customer: { id: anna }, conflict: true } });
    const { id } = created(await create({ contact: { name: "Anna", phone: "5712 3456", email: "ANNA@example.com" } }));
    expect(await order(id)).toMatchObject({ customer_id: anna });
  });

  test("no match: one new customer with the details and no account (AC3)", async () => {
    const { id } = created(await create({ contact: { name: "New Person", phone: "5888 1111", email: "new@example.com" } }));
    expect(await rows("select c.name, c.phone, c.email, c.auth_user_id from customer c join orders o on o.customer_id = c.id where o.id = $1", [id])).toEqual([
      { name: "New Person", phone: "+23058881111", email: "new@example.com", auth_user_id: null },
    ]);
  });

  test("a matched customer without email keeps none; the order has the typed email (AC6)", async () => {
    const anna = await stored("Anna Rault", "57123456");
    const { id } = created(await create({ contact: { name: "Anna", phone: "5712 3456", email: "someone@example.com" } }));
    expect(await order(id)).toMatchObject({ customer_id: anna, contact_email: "someone@example.com" });
    expect(await rows("select email, auth_user_id from customer where id = $1", [anna])).toEqual([{ email: null, auth_user_id: null }]);
  });

  test("findCustomer needs a phone or an email; no match is null (AC7)", async () => {
    expect(await lookup({})).toMatchObject({ status: 400 });
    expect(await lookup({ phone: "5999 9999" })).toMatchObject({ json: { ok: true, customer: null, conflict: false } });
  });

  test("a customer session cannot look anyone up (AC9)", async () => {
    await stored("Anna Rault", "57123456");
    const customer = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    const answer = (await lookup({ phone: "57123456" }, cookie)) as { status: number; json: unknown };
    expect(answer.status).toBe(403);
    expect(JSON.stringify(answer.json)).not.toContain("Anna");
  });
});

describe("warnings and relaxed rules (S-134)", () => {
  test("a blocked day, a closed Sunday and too-soon dates save with warnings (AC1-AC3, AC7)", async () => {
    await database.client.query("insert into blocked_date (starts_on, ends_on, reason) values ('2026-11-16', '2026-11-16', 'Away')");
    expect(created(await create({ date: "2026-11-16" })).query.get("warnings")).toBe("blocked,too_soon");
    expect(created(await create({ date: "2026-11-22" })).query.get("warnings")).toBe("closed");
    expect(created(await create({ date: "2026-11-25" })).query.get("warnings")).toBeNull();
  });

  test("yesterday saves with past_date only, sends no email and counts in sales (AC4, S-135 AC3)", async () => {
    const { id, query } = created(await create({ date: "2026-11-13", contact: { name: "Anna", phone: "5712 3456", email: "anna@example.com" } }));
    expect(query.get("warnings")).toBe("past_date");
    expect(query.get("emailed")).toBe("0");
    expect(await rows("select id from email_outbox where order_id = $1", [id])).toEqual([]);
    expect(await rows("select to_char(fulfil_on, 'YYYY-MM-DD') as day, status from orders where id = $1", [id])).toEqual([{ day: "2026-11-13", status: "approved" }]);
  });

  test("a sold-out product saves with sold_out (AC5)", async () => {
    await database.client.query("update product set status = 'sold_out' where id = $1", [cake]);
    expect(created(await create({ date: "2026-11-25" })).query.get("warnings")).toBe("sold_out");
  });

  test("beyond 365 days or an impossible date is refused on date (AC6)", async () => {
    expect(((await create({ date: "2027-11-15" })) as Refusal).data.error.fields).toHaveProperty("date");
    expect(((await create({ date: "2026-02-30" })) as Refusal).data.error.fields).toHaveProperty("date");
    expect(created(await create({ date: "2027-11-14" })).id).toBeTruthy();
  });
});

describe("confirmation email (S-135)", () => {
  test("an email and a future date queue one Order confirmed in the chosen language (AC1, AC4, AC6)", async () => {
    const { id, query } = created(await create({ locale: "fr", contact: { name: "Anna", phone: "5712 3456", email: "anna@example.com" } }));
    expect(query.get("emailed")).toBe("1");
    expect(await rows("select template, to_email, locale, payload from email_outbox where order_id = $1", [id])).toEqual([{ template: "order_confirmed", to_email: "anna@example.com", locale: "fr", payload: { orderId: id } }]);
    expect(await order(id)).toMatchObject({ locale: "fr" });
  });

  test("no email, no outbox row; the order screen shows the saved flash and the tracking link to share (AC2)", async () => {
    const { id, query } = created(await create({ date: "2026-11-16" }));
    expect(await rows("select id from email_outbox where order_id = $1", [id])).toEqual([]);
    const page = await orderLoader(routeArgs(database, { path: `/admin/orders/${id}?${query.toString()}`, params: { id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never);
    expect(page.edited).toEqual({ created: true, emailed: false, warnings: ["too_soon"] });
    expect(page.trackingUrl).toMatch(/^http:\/\/localhost\/t\/[A-Za-z0-9_-]{20,}$/);
  });
});
