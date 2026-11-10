import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { BasketLine } from "~/domain/basket";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { type PlaceOrderResult, placeOrder } from "./place-order.server";

let database: TestDatabase;
let cakeId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  cakeId = await insertProduct(database.db);
}, 60_000);

afterEach(async () => {
  await database.close();
});

/** 2026-11-10 12:00 in Mauritius. */
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
    date: "2026-11-12",
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

  test("no delivery or pickup choice is VALIDATION_FAILED on fulfilment", async () => {
    const form = deliveryForm();
    delete (form as Record<string, string | undefined>).fulfilment;

    expect(expectRefused(await place(form), "VALIDATION_FAILED").fields).toContain("fulfilment");
  });
});

describe("date and time windows (S-013 AC3)", () => {
  test("yesterday in Mauritius is DATE_UNAVAILABLE; today is accepted", async () => {
    // 2026-11-10 22:30 UTC is already 2026-11-11 02:30 in Mauritius.
    const lateNight = new Date("2026-11-10T22:30:00Z");

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

describe("the stored order (S-013 AC4)", () => {
  test("a delivery order is pending approval with copied prices and the Settings fee", async () => {
    const result = await place(deliveryForm({ displayedTotalRs: "1900" }), { basket: [line("a", cakeId, 2)], locale: "fr" });
    expect(result.ok).toBe(true);
    expectRefusedNever(result);

    const { rows } = await database.client.query(`select * from orders`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending_approval",
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
      { order_id: result.orderId, actor_type: "customer", actor_admin_id: null, type: "created", to_status: "pending_approval" },
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
  test.each(["sold_out", "hidden"])("a %s line is PRODUCT_UNAVAILABLE with its lineId", async (status) => {
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Tart", status: status as "sold_out" | "hidden" });

    const refused = expectRefused(await place(deliveryForm(), { basket: [line("a", cakeId), line("b", tart)] }), "PRODUCT_UNAVAILABLE");
    expect(refused.lineIds).toEqual(["b"]);
    await expectNoOrder();
  });

  test("an empty basket is VALIDATION_FAILED", async () => {
    const refused = expectRefused(await place(deliveryForm(), { basket: [] }), "VALIDATION_FAILED");

    expect(refused.fields).toEqual(["basket"]);
    await expectNoOrder();
  });
});

/** Runs `run` with a database whose transactions start only once `parties` callers have asked for one. */
function withTransactionBarrier(parties: number) {
  let waiting = 0;
  let release!: () => void;
  const allArrived = new Promise<void>((resolve) => (release = resolve));
  const db = new Proxy(database.db, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      return async (...args: Parameters<typeof target.transaction>) => {
        waiting += 1;
        if (waiting === parties) release();
        await allArrived;
        return target.transaction(...args);
      };
    },
  });
  return db;
}

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

  test("AC3: when both requests pass the first lookup, the unique key rolls one back and it returns the winner (no consumed number)", async () => {
    const form = deliveryForm();
    const db = withTransactionBarrier(2);
    // Same submitter (same email, G-21); the names differ so the payloads are not identical.
    const raced = (contactName: string) =>
      placeOrder({ ...form, "contact.name": contactName }, { db, now: NOW, locale: "en", basket: [line("a", cakeId)] });

    const results = await Promise.all([raced("first"), raced("second")]);
    for (const result of results) expectRefusedNever(result);
    const [a, b] = results as Extract<PlaceOrderResult, { ok: true }>[];

    expect(a!.trackingToken).toBe(b!.trackingToken);
    expect([a!.replayed, b!.replayed].sort()).toEqual([false, true]);
    expect(await count("orders")).toBe(1);
    // The loser's customer row and number were rolled back with its transaction.
    expect(await count("customer")).toBe(1);
    expect(await counterValue()).toBe(1);
    const next = await place(deliveryForm());
    expectRefusedNever(next);
    expect(next.orderNumber).toBe("APB-0002");
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
    const form = deliveryForm();
    const db = withTransactionBarrier(2);
    const raced = (email: string) =>
      placeOrder({ ...form, "contact.email": email }, { db, now: NOW, locale: "en", basket: [line("a", cakeId)] });

    const results = await Promise.all([raced("first@example.com"), raced("second@example.com")]);

    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toEqual([{ ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true }]);
    expect(await count("orders")).toBe(1);
    expect(await counterValue()).toBe(1);
  });
});
