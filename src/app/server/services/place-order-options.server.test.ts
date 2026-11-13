// S-092 (order price snapshot) and the S-081 server authority with options: the place_order
// procedure (migration 0010) and domain/pricing price the same basket the same way, the
// order keeps its options and prices, and a forged selection is never charged or stored.
import { randomUUID } from "node:crypto";
import { type MockInstance, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BasketLine } from "~/domain/basket";
import { optionChoice, optionGroup, settings } from "~/db/schema";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { eq } from "drizzle-orm";
import { type PlaceOrderResult, placeOrder } from "./place-order.server";

let database: TestDatabase;
let cakeId: string;
let ids: Record<"size" | "six" | "eight" | "addons" | "candles" | "topper" | "extra" | "cupcake" | "name", string>;
let drift: MockInstance<typeof console.error>;

/** 2026-11-10 12:00 in Mauritius. */
const NOW = new Date("2026-11-10T08:00:00Z");

async function group(productId: string, values: Partial<typeof optionGroup.$inferInsert> & { nameEn: string; kind: "single" | "multiple" | "text" | "quantity" }, sortOrder: number) {
  const [row] = await database.db.insert(optionGroup).values({ productId, sortOrder, ...values }).returning({ id: optionGroup.id });
  return row!.id;
}

async function choice(groupId: string, nameEn: string, priceDeltaRs: number, sortOrder: number) {
  const [row] = await database.db.insert(optionChoice).values({ groupId, nameEn, nameFr: `${nameEn} (fr)`, priceDeltaRs, sortOrder }).returning({ id: optionChoice.id });
  return row!.id;
}

beforeEach(async () => {
  database = await createTestDatabase();
  drift = vi.spyOn(console, "error").mockImplementation(() => {});
  // Base Rs 1000: Size (required: 6 inch 0, 8 inch +600), Add-ons (candles +100, topper +300),
  // Extra cupcakes (quantity 0..12, +50 each), Name (text, max 10).
  cakeId = await insertProduct(database.db, { basePriceRs: 1000 });
  const size = await group(cakeId, { nameEn: "Size", nameFr: "Taille", kind: "single", required: true }, 0);
  const addons = await group(cakeId, { nameEn: "Add-ons", kind: "multiple" }, 1);
  const extra = await group(cakeId, { nameEn: "Extra cupcakes", kind: "quantity", quantityMin: 0, quantityMax: 12 }, 2);
  const name = await group(cakeId, { nameEn: "Name", kind: "text", textMaxLength: 10 }, 3);
  ids = {
    size,
    six: await choice(size, "6 inch", 0, 0),
    eight: await choice(size, "8 inch", 600, 1),
    addons,
    candles: await choice(addons, "Candles", 100, 0),
    topper: await choice(addons, "Topper", 300, 1),
    extra,
    cupcake: await choice(extra, "Cupcake", 50, 0),
    name,
  };
}, 60_000);

afterEach(async () => {
  // domain/pricing and the procedure must agree in every test here.
  expect(drift.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("place_order_rule_drift"))).toEqual([]);
  drift.mockRestore();
  await database.close();
});

const eightInch = (extra: Partial<BasketLine> = {}): BasketLine => ({ lineId: "a", productId: cakeId, options: [{ groupId: ids.size, choiceIds: [ids.eight] }], quantity: 1, ...extra });

/** 8 inch + candles + topper + 3 cupcakes + name: 1000 + 600 + 400 + 150 = 2150 a cake. */
const fullCake = (quantity = 2): BasketLine => ({
  lineId: "full",
  productId: cakeId,
  options: [
    { groupId: ids.size, choiceIds: [ids.eight] },
    { groupId: ids.addons, choiceIds: [ids.candles, ids.topper] },
    { groupId: ids.extra, choiceIds: [], quantity: 3 },
    { groupId: ids.name, choiceIds: [], text: "  Zoé  " },
  ],
  cakeMessage: " Happy birthday 🎂 ",
  quantity,
});

function pickupForm(displayedTotalRs: number, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    intent: "placeOrder",
    idempotencyKey: randomUUID(),
    displayedTotalRs: String(displayedTotalRs),
    fulfilment: "pickup",
    date: "2026-11-13",
    "windowId.pickup": "afternoon",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
    ...overrides,
  };
}

const place = (form: Record<string, string>, basket: BasketLine[]) => placeOrder(form, { db: database.db, now: NOW, locale: "en", basket });

function placed(result: PlaceOrderResult) {
  if (!result.ok) throw new Error(`expected an order, got ${result.code}`);
  return result;
}

function refused<C extends string>(result: PlaceOrderResult, code: C) {
  if (result.ok || result.code !== code) throw new Error(`expected ${code}, got ${result.ok ? "an order" : result.code}`);
  return result as Extract<PlaceOrderResult, { code: C }>;
}

interface ItemRow {
  product_id: string | null;
  name_en: string;
  original_base_price_rs: number;
  unit_base_price_rs: number;
  promotion_id: string | null;
  options: { groupId: string; kind: string; choiceId?: string; choice?: { en: string; fr?: string }; group: { en: string }; priceDeltaRs: number; quantity?: number; text?: string }[];
  cake_message: string | null;
  quantity: number;
  line_total_rs: number;
}

async function items() {
  return (await database.client.query<ItemRow>("select product_id, name_en, original_base_price_rs, unit_base_price_rs, promotion_id, options, cake_message, quantity, line_total_rs from order_item order by sort_order")).rows;
}

async function orderTotals() {
  return (await database.client.query<{ items_total_rs: number; delivery_fee_rs: number; total_rs: number }>("select items_total_rs, delivery_fee_rs, total_rs from orders")).rows;
}

describe("the order keeps its prices and options (S-092 AC1)", () => {
  test("each item holds name, chosen options, unit and original price, quantity and line total; the order its totals", async () => {
    placed(await place(pickupForm(4300), [fullCake(2)]));

    const [item] = await items();
    expect(item).toMatchObject({ product_id: cakeId, name_en: "Chocolate cake", original_base_price_rs: 1000, unit_base_price_rs: 1000, quantity: 2, line_total_rs: 4300, cake_message: "Happy birthday 🎂" });
    expect(item!.options).toEqual([
      { groupId: ids.size, group: { en: "Size", fr: "Taille" }, kind: "single", choiceId: ids.eight, choice: { en: "8 inch", fr: "8 inch (fr)" }, priceDeltaRs: 600 },
      { groupId: ids.addons, group: { en: "Add-ons" }, kind: "multiple", choiceId: ids.candles, choice: { en: "Candles", fr: "Candles (fr)" }, priceDeltaRs: 100 },
      { groupId: ids.addons, group: { en: "Add-ons" }, kind: "multiple", choiceId: ids.topper, choice: { en: "Topper", fr: "Topper (fr)" }, priceDeltaRs: 300 },
      { groupId: ids.extra, group: { en: "Extra cupcakes" }, kind: "quantity", choiceId: ids.cupcake, choice: { en: "Cupcake", fr: "Cupcake (fr)" }, priceDeltaRs: 50, quantity: 3 },
      { groupId: ids.name, group: { en: "Name" }, kind: "text", priceDeltaRs: 0, text: "Zoé" },
    ]);
    // Unit price = unit base + the options (quantity options: delta x quantity) = 2150.
    const unit = item!.unit_base_price_rs + item!.options.reduce((sum, o) => sum + o.priceDeltaRs * (o.quantity ?? 1), 0);
    expect(unit * item!.quantity).toBe(item!.line_total_rs);
    expect(await orderTotals()).toEqual([{ items_total_rs: 4300, delivery_fee_rs: 0, total_rs: 4300 }]);
  });

  test("delivery adds the fee to the stored total", async () => {
    placed(await place(pickupForm(1800, { fulfilment: "delivery", "windowId.delivery": "morning", address: "12 Royal Road, Rose Hill" }), [eightInch()]));

    expect(await orderTotals()).toEqual([{ items_total_rs: 1600, delivery_fee_rs: 200, total_rs: 1800 }]);
  });
});

describe("later menu edits never change an order (S-092 AC2, AC4)", () => {
  test("a new base price or option price leaves the stored items and total as they were", async () => {
    placed(await place(pickupForm(1600), [eightInch()]));
    const before = { items: await items(), totals: await orderTotals() };

    await database.client.query("update product set base_price_rs = 5000 where id = $1", [cakeId]);
    await database.client.query("update option_choice set price_delta_rs = 900, name_en = '8 inch XL' where id = $1", [ids.eight]);

    expect(await items()).toEqual(before.items);
    expect(await orderTotals()).toEqual(before.totals);
  });

  test("a deleted product leaves the item and its snapshot (product id set to null)", async () => {
    placed(await place(pickupForm(1600), [eightInch()]));

    await database.client.query("delete from product where id = $1", [cakeId]);

    const [item] = await items();
    expect(item).toMatchObject({ product_id: null, name_en: "Chocolate cake", line_total_rs: 1600 });
    expect(item!.options[0]?.choice?.en).toBe("8 inch");
  });
});

describe("promotion on the item (S-092 AC3)", () => {
  test("no promotion applies: promotion_id is null", async () => {
    placed(await place(pickupForm(1600), [eightInch()]));

    expect((await items())[0]?.promotion_id).toBeNull();
  });

  /** A promotion on the cake: 09:00 to 18:00 Mauritius on 10 Nov (NOW is 12:00). */
  async function promote(discount: { percentOff?: number; salePriceRs?: number }, window = { starts: "2026-11-10T05:00:00Z", ends: "2026-11-10T14:00:00Z" }, title = "Spring offer") {
    const { rows } = await database.client.query<{ id: string }>(
      "insert into promotion (title_en, starts_at, ends_at, placement) values ($1, $2, $3, 'card') returning id",
      [title, window.starts, window.ends],
    );
    const id = rows[0]!.id;
    const kind = discount.percentOff === undefined ? "sale_price" : "percent";
    await database.client.query("insert into promotion_product (promotion_id, product_id, discount_kind, percent_off, sale_price_rs) values ($1, $2, $3, $4, $5)", [
      id, cakeId, kind, discount.percentOff ?? null, discount.salePriceRs ?? null,
    ]);
    return id;
  }

  test("a live promotion: the item references it, keeps its title, the sale base and the original price; options stay full price", async () => {
    const promotionId = await promote({ percentOff: 20 });
    // 20% of 1000 = 800; + 8 inch 600 = 1400 a cake
    placed(await place(pickupForm(1400), [eightInch()]));

    const { rows } = await database.client.query<{ promotion_id: string; promotion_title_en: string; unit_base_price_rs: number; original_base_price_rs: number; line_total_rs: number }>(
      "select promotion_id, promotion_title_en, unit_base_price_rs, original_base_price_rs, line_total_rs from order_item",
    );
    expect(rows).toEqual([{ promotion_id: promotionId, promotion_title_en: "Spring offer", unit_base_price_rs: 800, original_base_price_rs: 1000, line_total_rs: 1400 }]);
  });

  test("S-082 AC6: two live offers never add up: the lowest price wins and is recorded", async () => {
    await promote({ percentOff: 20 });
    const cheaper = await promote({ salePriceRs: 700 }, undefined, "Flash sale");
    placed(await place(pickupForm(1300), [eightInch()]));

    expect((await items())[0]).toMatchObject({ promotion_id: cheaper, unit_base_price_rs: 700, line_total_rs: 1300 });
  });

  test("a total shown with an ended promotion's price is refused calmly with the full price", async () => {
    await promote({ percentOff: 20 }, { starts: "2026-11-09T05:00:00Z", ends: "2026-11-10T08:00:00Z" });
    const result = refused(await place(pickupForm(1400), [eightInch()]), "PRICE_CHANGED");

    expect(result.lines[0]).toMatchObject({ unitPriceRs: 1600, originalUnitPriceRs: 1600, promotionId: null });
    expect(result.totalRs).toBe(1600);
    expect(await items()).toEqual([]);
  });

  test("a forged lower total is refused: the server price with the promotion is the only one charged", async () => {
    await promote({ percentOff: 20 });
    const result = refused(await place(pickupForm(1000), [eightInch()]), "PRICE_CHANGED");

    expect(result).toMatchObject({ totalRs: 1400 });
    expect(result.lines[0]).toMatchObject({ unitPriceRs: 1400, originalUnitPriceRs: 1600 });
  });
});

describe("the database refuses a negative line total (S-092 AC5)", () => {
  test("CHECK line_total_rs >= 0", async () => {
    placed(await place(pickupForm(1600), [eightInch()]));
    const { rows } = await database.client.query<{ order_id: string }>("select order_id from order_item");

    await expect(
      database.client.query("insert into order_item (order_id, name_en, original_base_price_rs, unit_base_price_rs, quantity, line_total_rs) values ($1, 'x', 0, 0, 1, -1)", [rows[0]!.order_id]),
    ).rejects.toThrow(/order_item_money_ck/);
  });
});

describe("all or nothing (S-092 AC6)", () => {
  test("a failure while writing items leaves no order, item, event or number", async () => {
    await database.client.exec(`
      create function fail_item() returns trigger language plpgsql as $$ begin raise exception 'item insert failed'; end $$;
      create trigger fail_item before insert on order_item for each row execute function fail_item();`);

    await expect(place(pickupForm(4300), [fullCake(2)])).rejects.toThrow();

    for (const table of ["orders", "order_item", "order_event", "email_outbox", "customer"]) {
      expect((await database.client.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]!.n).toBe(0);
    }
    expect((await database.client.query<{ value: number }>("select value from counter where name = 'order_number'")).rows[0]!.value).toBe(0);
  });
});

describe("server authority with options (S-081, security)", () => {
  test("a total shown without the size's extra price is PRICE_CHANGED with the server's line", async () => {
    const result = refused(await place(pickupForm(1000), [eightInch()]), "PRICE_CHANGED");

    expect(result.totalRs).toBe(1600);
    expect(result.lines[0]).toMatchObject({ unitPriceRs: 1600, originalUnitPriceRs: 1600, options: [expect.objectContaining({ choiceId: ids.eight, priceDeltaRs: 600 })] });
    expect(await orderTotals()).toEqual([]);
  });

  test("a forged cheaper configuration cannot be ordered: a choice of another group, a missing size, two sizes", async () => {
    const forged: BasketLine[] = [
      { lineId: "f1", productId: cakeId, options: [{ groupId: ids.size, choiceIds: [ids.candles] }], quantity: 1 },
      { lineId: "f2", productId: cakeId, options: [], quantity: 1 },
      { lineId: "f3", productId: cakeId, options: [{ groupId: ids.size, choiceIds: [ids.six, ids.eight] }], quantity: 1 },
      { lineId: "f4", productId: cakeId, options: [{ groupId: ids.size, choiceIds: [ids.six] }, { groupId: ids.extra, choiceIds: [], quantity: 13 }], quantity: 1 },
    ];

    const result = refused(await place(pickupForm(1000), forged), "VALIDATION_FAILED");

    expect(result.fields).toEqual(["basket"]);
    expect(await orderTotals()).toEqual([]);
  });

  test("a line whose options are no longer valid is left out; the rest is ordered at the server's price", async () => {
    const stale: BasketLine = { lineId: "s", productId: cakeId, options: [{ groupId: ids.size, choiceIds: [randomUUID()] }], quantity: 1 };

    const result = placed(await place(pickupForm(1600), [stale, eightInch()]));

    expect(result.leftOut).toEqual([cakeId]);
    expect((await items()).map((i) => i.line_total_rs)).toEqual([1600]);
  });

  test("a cake message over the Settings limit is never stored or truncated: the line is left out", async () => {
    const long = eightInch({ lineId: "long", cakeMessage: "a".repeat(41) });

    refused(await place(pickupForm(1600), [long]), "VALIDATION_FAILED");
    expect(await items()).toEqual([]);
  });

  test("40 emoji are 40 characters (grapheme clusters), so the message is accepted; a higher Settings limit is read fresh", async () => {
    placed(await place(pickupForm(1600), [eightInch({ cakeMessage: "👨‍👩‍👧‍👦".repeat(40) })]));
    await database.db.update(settings).set({ cakeMessageMax: 60 }).where(eq(settings.id, 1));
    placed(await place(pickupForm(1600), [eightInch({ lineId: "b", cakeMessage: "b".repeat(60) })]));

    expect((await items()).length).toBe(2);
  });

  test("a text option over its own limit is left out", async () => {
    const named = eightInch({ options: [{ groupId: ids.size, choiceIds: [ids.eight] }, { groupId: ids.name, choiceIds: [], text: "Anniversaire" }] });

    refused(await place(pickupForm(1600), [named]), "VALIDATION_FAILED");
  });

  test("a product minimum quantity is enforced (S-066 AC10)", async () => {
    await database.client.query("update product set min_quantity = 6 where id = $1", [cakeId]);

    refused(await place(pickupForm(8000), [eightInch({ quantity: 5 })]), "VALIDATION_FAILED");
    placed(await place(pickupForm(9600), [eightInch({ quantity: 6 })]));
  });
});

describe("a seasonal line whose season ended (S-084 AC7)", () => {
  test("is left out of the order like an unavailable line, here and in the procedure; the rest is ordered", async () => {
    // Today is 10 Nov 2026 (Mauritius); this product's season ended on 9 Nov.
    const ended = await insertProduct(database.db, { slug: "pumpkin-pie", nameEn: "Pumpkin pie", basePriceRs: 500, seasonalStartsOn: "2026-10-01", seasonalEndsOn: "2026-11-09" });

    const result = placed(await place(pickupForm(1600), [{ lineId: "p", productId: ended, options: [], quantity: 1 }, eightInch()]));

    expect(result.leftOut).toEqual([ended]);
    expect((await items()).map((i) => i.name_en)).toEqual(["Chocolate cake"]);
  });

  test("alone, the basket has nothing orderable", async () => {
    const ended = await insertProduct(database.db, { slug: "pumpkin-pie", nameEn: "Pumpkin pie", basePriceRs: 500, seasonalStartsOn: "2026-10-01", seasonalEndsOn: "2026-11-09" });

    expect(refused(await place(pickupForm(500), [{ lineId: "p", productId: ended, options: [], quantity: 1 }]), "VALIDATION_FAILED").fields).toEqual(["basket"]);
  });
});
