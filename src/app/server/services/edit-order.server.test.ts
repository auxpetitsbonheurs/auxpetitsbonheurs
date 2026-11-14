// Edit an order (S-122 AC2-AC10, S-123 AC1-AC5, AC7) against PGlite with real migrations.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Menu } from "~/domain/menu";
import type { OrderEditInput } from "~/server/contracts/order-edit";
import { loadMenu } from "~/server/menu.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { editOrder } from "./edit-order.server";

let database: TestDatabase;
let adminId: string;
let orderId: string;
let itemId: string;

const NOW = new Date("2026-11-05T08:00:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  const { token } = await placeTestOrder(database, { overrides: { ...DELIVERY_ORDER, displayedTotalRs: "1050" } });
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  await database.client.query("update orders set status = 'approved' where id = $1", [orderId]);
  itemId = (await database.client.query<{ id: string }>("select id from order_item where order_id = $1", [orderId])).rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function menu(): Promise<Menu> {
  return (await loadMenu({ db: database.db, supabaseUrl: "https://storage.test", now: NOW, fixedClock: true })).data;
}

/** The order as placed: delivery, morning, 12 Nov, one cake at Rs 850, fee Rs 200. */
function input(changes: Partial<OrderEditInput> = {}): OrderEditInput {
  return {
    version: 1,
    lines: [{ itemId, quantity: 1 }],
    date: "2026-11-12",
    windowId: "morning",
    fulfilment: "delivery",
    address: "12 Royal Road, Rose Hill",
    landmark: "Opposite the church",
    deliveryFeeRs: 200,
    contact: { name: "Aisha", phone: "5712 3456", email: "aisha@example.com" },
    overrideTotalRs: null,
    ...changes,
  } as OrderEditInput;
}

async function edit(changes: Partial<OrderEditInput> = {}) {
  const settings = await getSiteSettings(database.db);
  return editOrder(database.db, { orderId, adminId, now: NOW, input: input(changes), menu: await menu(), windows: settings.checkout.windows, availability: settings.availability });
}

const row = async () =>
  (await database.client.query<Record<string, unknown>>("select status, version, items_total_rs, delivery_fee_rs, total_rs, total_overridden, address, fulfilment, fulfil_on::text as fulfil_on from orders where id = $1", [orderId])).rows[0]!;
const query = async (sql: string) => (await database.client.query<Record<string, unknown>>(sql, [orderId])).rows;
const updatedEmails = () => query("select payload, locale from email_outbox where order_id = $1 and template = 'order_updated'");

describe("saving an edit (S-122)", () => {
  test("quantity 1 → 2: totals recalculated on the server, an edited event with before/after (AC2, AC10)", async () => {
    expect(await edit({ lines: [{ itemId, quantity: 2 }] })).toMatchObject({ ok: true, order: { status: "approved", version: 2 } });
    expect(await row()).toMatchObject({ items_total_rs: 1700, delivery_fee_rs: 200, total_rs: 1900, total_overridden: false, version: 2 });
    const [event] = await query("select type, actor_admin_id, details from order_event where order_id = $1 and type = 'edited'");
    expect(event).toMatchObject({ type: "edited", actor_admin_id: adminId, details: { oldTotalRs: 1050, newTotalRs: 1900, diff: { items: { from: ["1 × Chocolate cake"], to: ["2 × Chocolate cake"] } } } });
  });

  test("a total set by hand is kept, flagged, and later item edits keep it until cleared (AC3)", async () => {
    await edit({ overrideTotalRs: 5000 });
    expect(await row()).toMatchObject({ total_rs: 5000, total_overridden: true });
    await edit({ version: 2, overrideTotalRs: 5000, lines: [{ itemId, quantity: 2 }] });
    expect(await row()).toMatchObject({ total_rs: 5000, total_overridden: true, items_total_rs: 1700 });
    await edit({ version: 3, overrideTotalRs: null, lines: [{ itemId, quantity: 2 }] });
    expect(await row()).toMatchObject({ total_rs: 1900, total_overridden: false });
  });

  test("delivery → pickup: no fee, address cleared (AC4)", async () => {
    expect(await edit({ fulfilment: "pickup", windowId: "morning" })).toMatchObject({ ok: true });
    expect(await row()).toMatchObject({ fulfilment: "pickup", delivery_fee_rs: 0, address: null, total_rs: 850 });
  });

  test("a free-text line and a new catalogue line are priced; the kept line keeps its price (AC5, AC10)", async () => {
    const tart = await insertProduct(database.db, { slug: "lemon-tart", basePriceRs: 400 });
    await database.client.query("update product set base_price_rs = 999 where id = (select product_id from order_item where id = $1)", [itemId]);

    const result = await edit({ lines: [{ itemId, quantity: 1 }, { freeText: { name: "Gift box", priceRs: 150, quantity: 2 } }, { lineId: "n1", productId: tart, options: [], quantity: 1 }] });

    expect(result).toMatchObject({ ok: true });
    const items = await query("select name_en, product_id, quantity, line_total_rs from order_item where order_id = $1 order by sort_order");
    expect(items.map((i) => [i.name_en, i.line_total_rs])).toEqual([
      ["Chocolate cake", 850],
      ["Gift box", 300],
      [expect.any(String), 400],
    ]);
    expect(items[1]!.product_id).toBeNull();
    expect(await row()).toMatchObject({ items_total_rs: 1550, total_rs: 1750 });
  });

  test("a hidden product is PRODUCT_UNAVAILABLE; a sold-out one is accepted (AC7)", async () => {
    const hidden = await insertProduct(database.db, { slug: "secret", status: "hidden" });
    const soldOut = await insertProduct(database.db, { slug: "gone", status: "sold_out", basePriceRs: 300 });

    expect(await edit({ lines: [{ itemId, quantity: 1 }, { lineId: "h", productId: hidden, options: [], quantity: 1 }] })).toMatchObject({ ok: false, code: "PRODUCT_UNAVAILABLE" });
    expect(await row()).toMatchObject({ version: 1 });
    expect(await edit({ lines: [{ itemId, quantity: 1 }, { lineId: "s", productId: soldOut, options: [], quantity: 1 }] })).toMatchObject({ ok: true });
  });

  test("Completed is INVALID_TRANSITION; a stale version is ORDER_CHANGED; nothing is written (AC6, AC9)", async () => {
    await database.client.query("update orders set status = 'completed' where id = $1", [orderId]);
    expect(await edit()).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    await database.client.query("update orders set status = 'cancelled', version = 2 where id = $1", [orderId]);
    expect(await edit({ lines: [{ itemId, quantity: 3 }] })).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await query("select id from order_event where order_id = $1 and type = 'edited'")).toEqual([]);
  });

  test("an item of another order is VALIDATION_FAILED", async () => {
    expect(await edit({ lines: [{ itemId: "7d1f0c9e-1111-4222-8333-944455566677", quantity: 1 }] })).toMatchObject({ ok: false, code: "VALIDATION_FAILED", fields: { lines: "invalid" } });
  });
});

describe("warnings and the updated email (S-123)", () => {
  test("a new date: one order_updated in the order's locale, and date warnings that never block (AC1, AC2)", async () => {
    // Sun 15 Nov is a closed day; 3 days' notice from Thu 5 Nov is fine.
    const result = await edit({ date: "2026-11-15" });
    expect(result).toMatchObject({ ok: true, warnings: ["closed"], emailed: true });
    expect(await updatedEmails()).toEqual([{ payload: { orderId, dateChanged: true, totalChanged: false }, locale: "en" }]);
  });

  test("too soon gives too_soon (AC1)", async () => {
    expect(await edit({ date: "2026-11-06" })).toMatchObject({ ok: true, warnings: ["too_soon"] });
  });

  test("date and total together: one email with both (AC3)", async () => {
    await edit({ date: "2026-11-13", lines: [{ itemId, quantity: 2 }] });
    expect(await updatedEmails()).toEqual([{ payload: { orderId, dateChanged: true, totalChanged: true }, locale: "en" }]);
  });

  test("window or note only: updated with an event, no email (AC4, S-122 AC8)", async () => {
    expect(await edit({ windowId: "afternoon", contact: { name: "Aisha", phone: "5712 3456", email: "aisha@example.com", note: "Ring twice" } })).toMatchObject({ ok: true, emailed: false });
    expect(await updatedEmails()).toEqual([]);
    expect(await query("select id from order_event where order_id = $1 and type = 'edited'")).toHaveLength(1);
  });

  test("no email address: the total changes, nothing is queued (AC5)", async () => {
    expect(await edit({ contact: { name: "Aisha", phone: "5712 3456" }, lines: [{ itemId, quantity: 2 }] })).toMatchObject({ ok: true, emailed: false });
    expect(await updatedEmails()).toEqual([]);
  });

  test("the email, event and order rewrite share one transaction (AC7)", async () => {
    await database.client.exec(`
      create function fail_outbox() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
      create trigger fail_outbox before insert on email_outbox for each row execute function fail_outbox();`);

    await expect(edit({ date: "2026-11-13" })).rejects.toThrow();
    expect(await row()).toMatchObject({ version: 1, fulfil_on: "2026-11-12" });
    expect(await query("select id from order_event where order_id = $1 and type = 'edited'")).toEqual([]);
  });
});
