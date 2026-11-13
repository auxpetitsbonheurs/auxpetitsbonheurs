import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BasketLine } from "~/domain/basket";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { type PlaceOrderResult, callPlaceOrder, placeOrder } from "./place-order.server";

let database: TestDatabase;
let cakeId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  cakeId = await insertProduct(database.db);
}, 60_000);

afterEach(async () => {
  await database.close();
});

/** Tue 2026-11-10 12:00 in Mauritius: with the default notice of 3 days, Fri 13 is the earliest date. */
const NOW = new Date("2026-11-10T08:00:00Z");
const line = (lineId: string, productId: string, quantity = 1): BasketLine => ({ lineId, productId, options: [], quantity });

function deliveryForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    intent: "placeOrder",
    idempotencyKey: randomUUID(),
    displayedTotalRs: "1050",
    fulfilment: "delivery",
    address: "12 Royal Road, Rose Hill",
    landmark: "Opposite the church",
    date: "2026-11-13",
    "windowId.delivery": "morning",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "Aisha@Example.com",
    "contact.note": "No nuts please",
    acceptPolicies: "on",
    ...overrides,
  };
}

function pickupForm(overrides: Record<string, string> = {}) {
  const { address: _a, landmark: _l, "windowId.delivery": _w, ...rest } = deliveryForm();
  return { ...rest, fulfilment: "pickup", "windowId.pickup": "afternoon", displayedTotalRs: "850", ...overrides };
}

function place(form: Record<string, string>, options: { basket?: BasketLine[]; locale?: "en" | "fr"; now?: Date } = {}) {
  return placeOrder(form, {
    db: database.db,
    now: options.now ?? NOW,
    locale: options.locale ?? "en",
    basket: options.basket ?? [line("a", cakeId)],
  });
}

async function count(table: string) {
  return (await database.client.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]!.n;
}

async function counterValue() {
  return (await database.client.query<{ value: number }>(`select value from counter where name = 'order_number'`)).rows[0]!.value;
}

function expectRefused<C extends string>(result: PlaceOrderResult, code: C) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  expect(result.code).toBe(code);
  return result as Extract<PlaceOrderResult, { code: C }>;
}

async function expectNoOrder() {
  expect(await count("orders")).toBe(0);
  expect(await count("order_event")).toBe(0);
  expect(await count("email_outbox")).toBe(0);
  expect(await counterValue()).toBe(0);
}

describe("phone (S-013 AC1)", () => {
  test("stores the E.164 form", async () => {
    const result = await place(deliveryForm({ "contact.phone": "+230 5712 3456" }));

    expect(result.ok).toBe(true);
    const { rows } = await database.client.query<{ contact_phone: string }>("select contact_phone from orders");
    expect(rows[0]!.contact_phone).toBe("+23057123456");
  });

  test("12345 is VALIDATION_FAILED on contact.phone and creates no order", async () => {
    const refused = expectRefused(await place(deliveryForm({ "contact.phone": "12345" })), "VALIDATION_FAILED");

    expect(refused.fields).toEqual(["contact.phone"]);
    await expectNoOrder();
  });
});

describe("validation (S-013 AC2)", () => {
  test("names every invalid field and creates no order", async () => {
    const form = deliveryForm({
      "contact.name": " ",
      "contact.email": "not-an-email",
      address: "abc",
      date: "",
      "windowId.delivery": "night",
    });
    delete (form as Record<string, string | undefined>).acceptPolicies;

    const refused = expectRefused(await place(form), "VALIDATION_FAILED");
    expect([...refused.fields].sort()).toEqual(["acceptPolicies", "address", "contact.email", "contact.name", "date", "windowId"]);
    await expectNoOrder();
  });

  test("S-089 AC4, S-086 AC4: a name over 80, a note over 1000 and a 4-character address are refused per field, with no order", async () => {
    const form = deliveryForm({ "contact.name": "A".repeat(81), "contact.note": "n".repeat(1001), address: "Road" });

    expect([...expectRefused(await place(form), "VALIDATION_FAILED").fields].sort()).toEqual(["address", "contact.name", "contact.note"]);
    await expectNoOrder();
  });

  test("S-089 AC4: 80 characters of name and 1000 of note are accepted", async () => {
    const result = await place(deliveryForm({ "contact.name": "A".repeat(80), "contact.note": "n".repeat(1000) }));

    expect(result.ok).toBe(true);
  });

  test("no delivery or pickup choice is VALIDATION_FAILED on fulfilment", async () => {
    const form = deliveryForm();
    delete (form as Record<string, string | undefined>).fulfilment;

    expect(expectRefused(await place(form), "VALIDATION_FAILED").fields).toContain("fulfilment");
  });
});

describe("date and time windows (S-013 AC3)", () => {
  test("yesterday in Mauritius is DATE_UNAVAILABLE; today is accepted with notice 0", async () => {
    // 2026-11-10 22:30 UTC is already 2026-11-11 02:30 in Mauritius.
    const lateNight = new Date("2026-11-10T22:30:00Z");
    await database.client.query("update settings set default_notice_days = 0");

    const refused = expectRefused(await place(deliveryForm({ date: "2026-11-10" }), { now: lateNight }), "DATE_UNAVAILABLE");
    expect(refused.reason).toBe("too_soon");
    await expectNoOrder();

    expect((await place(deliveryForm({ date: "2026-11-11" }), { now: lateNight })).ok).toBe(true);
  });

  test("the window must be one of the Settings windows for the chosen fulfilment", async () => {
    await database.client.query(
      `update settings set pickup_windows = '[{"id":"morning","start":"09:00","end":"12:00","label":{"en":"Morning"}}]'::jsonb`,
    );

    const refused = expectRefused(await place(pickupForm({ "windowId.pickup": "afternoon" })), "VALIDATION_FAILED");
    expect(refused.fields).toEqual(["windowId"]);
    expect((await place(pickupForm({ "windowId.pickup": "morning" }))).ok).toBe(true);
  });

  test("the window of the other fulfilment is ignored", async () => {
    const refused = expectRefused(await place(pickupForm({ "windowId.pickup": "", "windowId.delivery": "morning" })), "VALIDATION_FAILED");

    expect(refused.fields).toEqual(["windowId"]);
  });
});

describe("the payment snapshot of a new order (S-278 AC2)", () => {
  test("carries the stored total and the Juice Settings, also when the page posts one total per fulfilment", async () => {
    await database.client.query("update settings set juice_name = 'A. Baker', juice_number = '5000 0071', payment_whatsapp = '5000 0072'");
    const { displayedTotalRs: _single, ...form } = pickupForm();

    const result = await place({ ...form, "displayedTotalRs.pickup": "850", "displayedTotalRs.delivery": "1050" });

    expect(result).toMatchObject({ ok: true, payment: { totalRs: 850, juiceName: "A. Baker", juiceNumber: "5000 0071", paymentWhatsapp: "5000 0072" } });
  });

  test("a replay carries none (the confirmation then reads the database)", async () => {
    const form = pickupForm();
    await place(form);

    const replay = await place(form);
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(replay).not.toHaveProperty("payment");
  });
});

describe("the stored order (S-013 AC4)", () => {
  test("S-278 AC1: a delivery order is awaiting payment with copied prices and the Settings fee", async () => {
    const result = await place(deliveryForm({ displayedTotalRs: "1900" }), { basket: [line("a", cakeId, 2)], locale: "fr" });
    expect(result.ok).toBe(true);
    expectRefusedNever(result);

    const { rows } = await database.client.query(`select * from orders`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "awaiting_payment",
      source: "website",
      locale: "fr",
      fulfilment: "delivery",
      address: "12 Royal Road, Rose Hill",
      landmark: "Opposite the church",
      contact_name: "Aisha",
      contact_email: "aisha@example.com",
      customer_note: "No nuts please",
      items_total_rs: 1700,
      delivery_fee_rs: 200,
      total_rs: 1900,
      time_window: { id: "morning", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } },
    });
    expect((rows[0] as { policies_accepted_at: Date }).policies_accepted_at.toISOString()).toBe(NOW.toISOString());
    const items = await database.client.query(`select * from order_item`);
    expect(items.rows).toEqual([
      expect.objectContaining({
        product_id: cakeId,
        name_en: "Chocolate cake",
        name_fr: "Gâteau au chocolat",
        original_base_price_rs: 850,
        unit_base_price_rs: 850,
        quantity: 2,
        line_total_rs: 1700,
      }),
    ]);
  });

  test("the fee is the Settings value at placement, and 0 for pickup with no address kept", async () => {
    await database.client.query(`update settings set delivery_fee_rs = 250`);
    expect((await place(deliveryForm({ displayedTotalRs: "1100" }))).ok).toBe(true);
    expect((await place(pickupForm({ address: "typed then switched" }))).ok).toBe(true);

    const { rows } = await database.client.query<{ fulfilment: string; delivery_fee_rs: number; total_rs: number; address: string | null }>(
      `select fulfilment, delivery_fee_rs, total_rs, address from orders order by number`,
    );
    expect(rows).toEqual([
      { fulfilment: "delivery", delivery_fee_rs: 250, total_rs: 1100, address: "12 Royal Road, Rose Hill" },
      { fulfilment: "pickup", delivery_fee_rs: 0, total_rs: 850, address: null },
    ]);
  });
});

function expectRefusedNever(result: PlaceOrderResult): asserts result is Extract<PlaceOrderResult, { ok: true }> {
  if (!result.ok) throw new Error(`refused: ${result.code}`);
}

describe("number and tracking token (S-013 AC5)", () => {
  test("the first order is APB-0001 from the counter, then APB-0002, with independent random tokens", async () => {
    const first = await place(deliveryForm());
    const second = await place(deliveryForm());
    expectRefusedNever(first);
    expectRefusedNever(second);

    expect([first.orderNumber, second.orderNumber]).toEqual(["APB-0001", "APB-0002"]);
    expect(await counterValue()).toBe(2);
    for (const result of [first, second]) expect(result.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.trackingToken).not.toBe(second.trackingToken);
    const { rows } = await database.client.query<{ number: number; tracking_token: string }>(
      "select number, tracking_token from orders order by number",
    );
    expect(rows.map((r) => r.tracking_token)).toEqual([first.trackingToken, second.trackingToken]);
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
  });
});

describe("event and email outbox (S-013 AC6)", () => {
  test("writes a created event (actor customer) and a pending order_received email in the order locale", async () => {
    const result = await place(deliveryForm(), { locale: "fr" });
    expectRefusedNever(result);

    const events = await database.client.query(`select order_id, actor_type, actor_admin_id, type, to_status from order_event`);
    expect(events.rows).toEqual([
      { order_id: result.orderId, actor_type: "customer", actor_admin_id: null, type: "created", to_status: "awaiting_payment" },
    ]);
    const outbox = await database.client.query(`select template, to_email, locale, status, dedupe_key, order_id, attempts from email_outbox`);
    expect(outbox.rows).toEqual([
      {
        template: "order_received",
        to_email: "aisha@example.com",
        locale: "fr",
        status: "pending",
        dedupe_key: `order:${result.orderId}:received`,
        order_id: result.orderId,
        attempts: 0,
      },
    ]);
  });
});

describe("all or nothing (S-013 AC7)", () => {
  test("a failing item insert leaves no order, event, outbox row, customer or consumed number", async () => {
    await database.client.exec(`
      create function fail_item() returns trigger language plpgsql as $$ begin raise exception 'item insert failed'; end $$;
      create trigger fail_item before insert on order_item for each row execute function fail_item();`);

    await expect(place(deliveryForm())).rejects.toThrow();
    await expectNoOrder();
    expect(await count("customer")).toBe(0);

    await database.client.exec(`drop trigger fail_item on order_item`);
    const next = await place(deliveryForm());
    expectRefusedNever(next);
    expect(next.orderNumber).toBe("APB-0001");
  });
});

describe("server prices (S-013 AC8)", () => {
  test("a displayed total that differs is PRICE_CHANGED with the repriced lines and totals", async () => {
    const refused = expectRefused(await place(deliveryForm({ displayedTotalRs: "900" })), "PRICE_CHANGED");

    expect(refused).toMatchObject({ itemsTotalRs: 850, deliveryFeeRs: 200, totalRs: 1050 });
    expect(refused.lines).toEqual([expect.objectContaining({ lineId: "a", unitPriceRs: 850, lineTotalRs: 850 })]);
    await expectNoOrder();
  });

  test("forged price fields are ignored: the stored total is the server's", async () => {
    const result = await place(deliveryForm({ unitPriceRs: "1", priceRs: "1", totalRs: "1", deliveryFeeRs: "0" }));
    expectRefusedNever(result);

    const { rows } = await database.client.query<{ total_rs: number; delivery_fee_rs: number }>("select total_rs, delivery_fee_rs from orders");
    expect(rows).toEqual([{ total_rs: 1050, delivery_fee_rs: 200 }]);
  });
});

describe("availability (S-013 AC9)", () => {
  test.each(["sold_out", "hidden"])("a %s line is left out of the order and its total (ADR-0004)", async (status) => {
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Tart", nameFr: "Tarte", status: status as "sold_out" | "hidden" });

    const result = await place(deliveryForm(), { basket: [line("a", cakeId), line("b", tart)] });
    expectRefusedNever(result);
    const { rows } = await database.client.query<{ total_rs: number }>("select total_rs from orders");
    expect(rows).toEqual([{ total_rs: 1050 }]);
    const items = await database.client.query<{ product_id: string }>("select product_id from order_item");
    expect(items.rows.map((r) => r.product_id)).toEqual([cakeId]);
    // UX audit H1: the caller names what was left out on the confirmation page.
    expect(result.leftOut).toEqual([tart]);
    // AC48: and their names, so the confirmation can render without reading them back.
    expect(result.leftOutNames).toEqual([{ en: "Tart", fr: "Tarte" }]);
  });

  test("a deleted product left out has no name to give; duplicates are named once (AC48)", async () => {
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Tart", nameFr: "Tarte", status: "sold_out" });
    const gone = "00000000-0000-4000-8000-000000000000";

    const result = await place(deliveryForm(), { basket: [line("a", cakeId), line("b", tart), line("c", gone), line("d", tart)] });
    expectRefusedNever(result);
    expect(result.leftOut).toEqual([tart, gone]);
    expect(result.leftOutNames).toEqual([{ en: "Tart", fr: "Tarte" }]);
  });

  test("an order with nothing left out says so, and a replay names nothing (UX audit H1)", async () => {
    const form = deliveryForm();
    const first = await place(form, { basket: [line("a", cakeId)] });
    expectRefusedNever(first);
    expect(first.leftOut).toEqual([]);

    const replay = await place(form, { basket: [] });
    expectRefusedNever(replay);
    expect(replay.leftOut).toEqual([]);
  });

  test("a line that became unavailable after the page showed it changes the total: PRICE_CHANGED marks it", async () => {
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Tart", basePriceRs: 400 });
    await database.client.query("update product set status = 'sold_out' where id = $1", [tart]);

    const refused = expectRefused(await place(deliveryForm({ displayedTotalRs: "1450" }), { basket: [line("a", cakeId), line("b", tart)] }), "PRICE_CHANGED");
    expect(refused).toMatchObject({ itemsTotalRs: 850, totalRs: 1050 });
    expect(refused.lines.map((l) => [l.lineId, l.problem])).toEqual([["a", null], ["b", "sold_out"]]);
    await expectNoOrder();
  });

  test("a basket with nothing orderable left is VALIDATION_FAILED on the basket", async () => {
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Tart", status: "sold_out" });

    const refused = expectRefused(await place(deliveryForm(), { basket: [line("b", tart)] }), "VALIDATION_FAILED");
    expect(refused.fields).toEqual(["basket"]);
    await expectNoOrder();
  });

  test("an empty basket is VALIDATION_FAILED", async () => {
    const refused = expectRefused(await place(deliveryForm(), { basket: [] }), "VALIDATION_FAILED");

    expect(refused.fields).toEqual(["basket"]);
    await expectNoOrder();
  });
});


describe("idempotent submit (S-014)", () => {
  test("AC1: two submits with the same key at the same time make one order, one outbox row and the same redirect", async () => {
    const form = deliveryForm();

    const [a, b] = await Promise.all([place(form), place(form)]);
    expectRefusedNever(a);
    expectRefusedNever(b);

    expect(a.trackingToken).toBe(b.trackingToken);
    expect(a.orderId).toBe(b.orderId);
    expect(a.locale).toBe(b.locale);
    expect(await count("orders")).toBe(1);
    expect(await count("email_outbox where template = 'order_received'")).toBe(1);
    expect(await count("order_event")).toBe(1);
  });

  test("AC2: a later replay with a different payload or an emptied basket returns the original order and writes nothing", async () => {
    const form = deliveryForm();
    const first = await place(form, { locale: "fr" });
    expectRefusedNever(first);

    const replays = [
      await place({ ...form, "contact.name": "Someone else", displayedTotalRs: "1" }),
      // After success the basket cookie is cleared: a Back-button resubmit has no lines.
      await place(form, { basket: [] }),
      await place(pickupForm({ idempotencyKey: form.idempotencyKey })),
    ];
    for (const replay of replays) {
      expectRefusedNever(replay);
      expect(replay).toMatchObject({ orderId: first.orderId, trackingToken: first.trackingToken, orderNumber: "APB-0001", replayed: true, locale: "fr" });
    }
    expect(first.replayed).toBe(false);
    expect(await count("orders")).toBe(1);
    expect(await count("customer")).toBe(1);
    expect(await count("order_event")).toBe(1);
    expect(await count("email_outbox")).toBe(1);
    expect(await counterValue()).toBe(1);
  });

  // The race itself (both calls pass the lookup, the unique key rolls the loser back with its
  // customer row and number) needs two real connections: tests/e2e/support/place-order-race.spec.ts.
  test("AC3: when the procedure lost the race it answers with the winner, returned as a replay", async () => {
    const form = deliveryForm();
    const winner = { orderId: randomUUID(), number: 7, trackingToken: "t".repeat(43), locale: "en", contactEmail: "aisha@example.com", orderNumberPrefix: "APB-" };

    const result = await placeOrder(form, { db: answering({ kind: "existing", existing: winner }), now: NOW, locale: "en", basket: [line("a", cakeId)] });

    expectRefusedNever(result);
    expect(result).toMatchObject({ orderId: winner.orderId, orderNumber: "APB-0007", replayed: true, leftOut: [] });
  });

  test("AC5: two orders in sequence are consecutive; a rolled-back attempt consumes no number", async () => {
    await database.client.query("update counter set value = 6 where name = 'order_number'");
    const seventh = await place(deliveryForm());
    await database.client.exec(`
      create function fail_once() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
      create trigger fail_once before insert on order_item for each row execute function fail_once();`);
    await expect(place(deliveryForm())).rejects.toThrow();
    await database.client.exec(`drop trigger fail_once on order_item`);
    const eighth = await place(deliveryForm());
    expectRefusedNever(seventh);
    expectRefusedNever(eighth);

    expect([seventh.orderNumber, eighth.orderNumber]).toEqual(["APB-0007", "APB-0008"]);
  });

  test("AC6: 20 concurrent placements get 20 unique numbers with no gaps", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => place(deliveryForm())));

    const numbers = results.map((r) => {
      expectRefusedNever(r);
      return r.number;
    });
    expect([...numbers].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await counterValue()).toBe(20);
  });

  test.each([
    ["missing", undefined],
    ["not a UUID", "123"],
    ["an empty string", ""],
  ])("AC8: an idempotency key that is %s is VALIDATION_FAILED and makes no order", async (_label, key) => {
    const form: Record<string, string> = deliveryForm();
    if (key === undefined) delete form.idempotencyKey;
    else form.idempotencyKey = key;

    const refused = expectRefused(await place(form), "VALIDATION_FAILED");
    expect(refused.fields).toContain("idempotencyKey");
    await expectNoOrder();
  });
});

describe("idempotency replay is bound to the submitter (threat-model G-21, tech-debt M1)", () => {
  test("a replay whose email matches after trimming and lower-casing returns the original order", async () => {
    const form = deliveryForm();
    const first = await place(form);
    expectRefusedNever(first);

    const replay = await place({ ...form, "contact.email": "  AISHA@example.COM " }, { basket: [] });
    expectRefusedNever(replay);
    expect(replay).toMatchObject({ orderId: first.orderId, trackingToken: first.trackingToken, replayed: true });
  });

  test.each([
    ["another email", { "contact.email": "someone@example.com" }],
    ["no email", { "contact.email": "" }],
  ])("a replay with %s gets a neutral refusal: no order, no link, nothing written", async (_label, overrides) => {
    const form = deliveryForm();
    const first = await place(form);
    expectRefusedNever(first);

    for (const basket of [[line("a", cakeId)], []]) {
      const refused = expectRefused(await place({ ...form, ...overrides }, { basket }), "VALIDATION_FAILED");
      expect(refused).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true });
      expect(JSON.stringify(refused)).not.toContain(first.trackingToken);
    }
    expect(await count("orders")).toBe(1);
    expect(await count("customer")).toBe(1);
    expect(await count("order_event")).toBe(1);
    expect(await count("email_outbox")).toBe(1);
    expect(await counterValue()).toBe(1);
  });

  test("the loser of a race with another email is refused, not given the winner's link", async () => {
    const winner = { orderId: randomUUID(), number: 3, trackingToken: "w".repeat(43), locale: "en", contactEmail: "first@example.com", orderNumberPrefix: "APB-" };

    const result = await placeOrder(deliveryForm({ "contact.email": "second@example.com" }), {
      db: answering({ kind: "existing", existing: winner }),
      now: NOW,
      locale: "en",
      basket: [line("a", cakeId)],
    });

    expect(result).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true });
    expect(JSON.stringify(result)).not.toContain(winner.trackingToken);
  });
});

describe("one database round trip (ADR-0003 amendment 3)", () => {
  test("a placed order, a replay and every refusal each cost exactly one statement", async () => {
    const statements: string[] = [];
    const db = new Proxy(database.db, {
      get(target, key, receiver) {
        if (key !== "execute") return Reflect.get(target, key, receiver);
        return (query: Parameters<typeof target.execute>[0]) => {
          statements.push("execute");
          return target.execute(query);
        };
      },
    });
    const run = (form: Record<string, string>, basket = [line("a", cakeId)]) => placeOrder(form, { db, now: NOW, locale: "en", basket });
    const form = deliveryForm();
    let queries = 0;
    const counting = database.client.query.bind(database.client);
    database.client.query = (async (...args: Parameters<typeof counting>) => (queries++, counting(...args))) as typeof database.client.query;

    expectRefusedNever(await run(form));
    expectRefusedNever(await run(form));
    expectRefused(await run(deliveryForm({ displayedTotalRs: "1" })), "PRICE_CHANGED");
    expectRefused(await run(deliveryForm({ date: "2026-11-01" })), "DATE_UNAVAILABLE");
    expectRefused(await run(deliveryForm({ "windowId.delivery": "nope" })), "VALIDATION_FAILED");
    expectRefused(await run(deliveryForm(), []), "VALIDATION_FAILED");

    expect(statements).toHaveLength(6);
    expect(queries).toBe(6);
  });

  test("a rule difference between the procedure and domain/pricing is logged and shown calmly as PRICE_CHANGED", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const settings = { deliveryFeeRs: 200, deliveryWindows: [{ id: "morning", start: "09:00", end: "12:00", label: { en: "Morning" } }], pickupWindows: [], orderNumberPrefix: "APB-", ...OPEN_RULES };
    const products = [{ id: cakeId, status: "available", nameEn: "Cake", nameFr: null, basePriceRs: 850, noticeDays: null, seasonStartsOn: null, seasonEndsOn: null }];

    const result = await placeOrder(deliveryForm(), { db: answering({ kind: "checked", settings, products }), now: NOW, locale: "en", basket: [line("a", cakeId)] });

    expect(expectRefused(result, "PRICE_CHANGED")).toMatchObject({ totalRs: 1050 });
    expect(error.mock.calls.map((c) => String(c[0]))).toContain(JSON.stringify({ level: "error", event: "place_order_rule_drift", kind: "accepted_here_refused_there" }));
    // S-089 AC7: the log carries the kind only, never the contact details of the form.
    const logged = JSON.stringify(error.mock.calls);
    const form = deliveryForm();
    for (const pii of [form["contact.name"], form["contact.phone"], form["contact.email"], "57123456"]) expect(logged).not.toContain(pii);
    error.mockRestore();
  });
});

/** Settings date rules of the procedure's snapshot: notice 3, Sunday closed, nothing blocked. */
const OPEN_RULES = { defaultNoticeDays: 3, closedWeekdays: [7], blocked: [] };

describe("the date rules at submit (S-083, S-084 AC5, S-087 AC5, AC7)", () => {
  async function block(startsOn: string, endsOn: string, reason: string | null = "Family wedding") {
    await database.client.query("insert into blocked_date (starts_on, ends_on, reason) values ($1, $2, $3)", [startsOn, endsOn, reason]);
  }

  test("too soon for the default notice of 3 days: DATE_UNAVAILABLE too_soon and no order", async () => {
    const refused = expectRefused(await place(deliveryForm({ date: "2026-11-12" })), "DATE_UNAVAILABLE");

    expect(refused.reason).toBe("too_soon");
    await expectNoOrder();
  });

  test("a closed Sunday is refused with reason closed", async () => {
    expect(expectRefused(await place(deliveryForm({ date: "2026-11-15" })), "DATE_UNAVAILABLE").reason).toBe("closed");
    await expectNoOrder();
  });

  test("a date blocked after the form opened is refused with the category only, and fresh public rules (AC29)", async () => {
    await block("2026-11-13", "2026-11-14");

    const refused = expectRefused(await place(deliveryForm()), "DATE_UNAVAILABLE");

    expect(refused.reason).toBe("blocked");
    expect(refused.availability).toEqual({ defaultNoticeDays: 3, closedWeekdays: [7], blocked: [{ startsOn: "2026-11-13", endsOn: "2026-11-14" }] });
    expect(JSON.stringify(refused)).not.toContain("Family wedding");
    await expectNoOrder();
  });

  test("beyond the 90-day horizon is too_far", async () => {
    expect(expectRefused(await place(deliveryForm({ date: "2027-02-08" })), "DATE_UNAVAILABLE").reason).toBe("too_far");
    expect((await place(deliveryForm({ date: "2027-02-06" }))).ok).toBe(true);
  });

  test("the largest notice of the basket items counts (a 5-day cake)", async () => {
    const slow = await insertProduct(database.db, { slug: "slow-cake", noticeDays: 5 });
    const basket = [line("a", cakeId), line("b", slow)];

    expect(expectRefused(await place(deliveryForm({ date: "2026-11-14", displayedTotalRs: "1900" }), { basket }), "DATE_UNAVAILABLE").reason).toBe("too_soon");
    expect((await place(deliveryForm({ date: "2026-11-16", displayedTotalRs: "1900" }), { basket })).ok).toBe(true);
  });

  test("a sold-out line's notice does not count (it is left out)", async () => {
    const slow = await insertProduct(database.db, { slug: "slow-cake", noticeDays: 10, status: "sold_out" });

    expect((await place(deliveryForm(), { basket: [line("a", cakeId), line("b", slow)] })).ok).toBe(true);
  });

  test("S-084 AC5: a seasonal item until 25 Dec refuses 27 Dec (out_of_season) and accepts 24 Dec", async () => {
    await database.client.query("update product set seasonal_starts_on = '2026-11-01', seasonal_ends_on = '2026-12-25' where id = $1", [cakeId]);
    // 27 Dec 2026 is a Sunday: open every day so the season is the only rule in play.
    await database.client.query("update settings set closed_weekdays = '{}'");

    expect(expectRefused(await place(deliveryForm({ date: "2026-12-27" })), "DATE_UNAVAILABLE").reason).toBe("out_of_season");
    await expectNoOrder();
    expect((await place(deliveryForm({ date: "2026-12-24" }))).ok).toBe(true);
  });

  test("S-087 AC7: a page left open across Mauritius midnight is judged against the new today", async () => {
    const before = new Date("2026-11-10T19:59:00Z");
    const after = new Date("2026-11-10T20:00:00Z");

    expect(expectRefused(await place(deliveryForm(), { now: after }), "DATE_UNAVAILABLE").reason).toBe("too_soon");
    expect((await place(deliveryForm(), { now: before })).ok).toBe(true);
  });

  describe("the procedure's own guard (drizzle/0009 mirrors domain/availability.ts)", () => {
    const order = (fulfilOn: string) => ({
      contactName: "Aisha",
      contactPhone: "+23057123456",
      contactEmail: "aisha@example.com",
      fulfilment: "pickup" as const,
      address: null,
      landmark: null,
      fulfilOn,
      windowId: "morning",
      customerNote: null,
      locale: "en" as const,
      trackingToken: randomUUID().replaceAll("-", ""),
      displayedTotalRs: 850,
      policiesAcceptedAt: NOW.toISOString(),
    });
    const call = (fulfilOn: string) =>
      callPlaceOrder(database.db, { idempotencyKey: randomUUID(), today: "2026-11-10", now: NOW.toISOString(), insert: true, basket: [{ productId: cakeId, quantity: 1, cakeMessage: null, cakeMessageLength: 0, options: [] }], order: order(fulfilOn) });

    test.each([
      ["too soon", "2026-11-12"],
      ["closed Sunday", "2026-11-15"],
      ["too far", "2027-02-08"],
    ])("writes nothing when told to insert on a %s date", async (_label, date) => {
      expect((await call(date)).kind).toBe("checked");
      await expectNoOrder();
    });

    test("writes nothing on a blocked date or outside a season, and writes on a good date", async () => {
      await block("2026-11-13", "2026-11-13");
      await database.client.query("update product set seasonal_starts_on = '2026-11-01', seasonal_ends_on = '2026-11-20' where id = $1", [cakeId]);

      expect((await call("2026-11-13")).kind).toBe("checked");
      expect((await call("2026-11-21")).kind).toBe("checked");
      await expectNoOrder();
      expect((await call("2026-11-14")).kind).toBe("placed");
    });

    test("the snapshot carries the public rules and each product's notice and season, never a block reason", async () => {
      await block("2026-11-20", "2026-11-22");
      await block("2026-01-01", "2026-01-02", "Long gone");

      const result = await call("2026-11-12");

      expect(result.kind).toBe("checked");
      if (result.kind !== "checked") return;
      expect(result.settings).toMatchObject({ defaultNoticeDays: 3, closedWeekdays: [7], blocked: [{ startsOn: "2026-11-20", endsOn: "2026-11-22" }] });
      expect(result.products[0]).toMatchObject({ noticeDays: null, seasonStartsOn: null, seasonEndsOn: null });
      expect(JSON.stringify(result)).not.toMatch(/Family wedding|Long gone/);
    });
  });
});

/** A database whose only statement answers `result` (the procedure's reply), for paths PGlite cannot race. */
function answering(result: unknown) {
  return { execute: async () => ({ rows: [{ result }] }) } as unknown as typeof database.db;
}
