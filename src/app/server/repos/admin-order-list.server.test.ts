// Orders list tabs, order, keyset paging, search and filters (S-111 AC1, AC2, AC4; S-112 AC1-AC3,
// AC7) against PGlite with real migrations.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { NO_FILTERS, type OrderListFilters } from "~/server/contracts/orders-list";
import { type ListPage, countTabs, cursorAfter, listTabOrders } from "./admin-order-list.server";

let database: TestDatabase;
let customerId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  customerId = (await database.client.query<{ id: string }>("insert into customer (name, phone) values ('List', '+23050000000') returning id")).rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

interface Seed {
  number: number;
  status?: string;
  name?: string;
  phone?: string;
  on?: string;
  start?: string;
  fulfilment?: "pickup" | "delivery";
  paid?: boolean;
}

async function seed(...orders: Seed[]) {
  for (const o of orders) {
    const window = { id: "w", start: o.start ?? "09:00", end: "12:00", label: { en: "Slot" } };
    await database.client.query(
      `insert into orders (number, source, status, customer_id, contact_name, contact_phone, fulfilment, address, fulfil_on, time_window,
         items_total_rs, total_rs, locale, tracking_token, paid)
       values ($1, 'website', $2::order_status, $3, $4, $5, $6::fulfilment, case when $6::text = 'delivery' then 'Somewhere' end, $7, $8, 850, 850, 'en', $9, $10)`,
      [o.number, o.status ?? "pending_approval", customerId, o.name ?? `Name ${o.number}`, o.phone ?? `+2305000${String(o.number).padStart(4, "0")}`,
        o.fulfilment ?? "pickup", o.on ?? "2026-11-20", JSON.stringify(window), randomUUID(), o.paid ?? false],
    );
  }
}

const page = (tab: ListPage["tab"], filters: Partial<OrderListFilters> = {}, extra: Partial<ListPage> = {}) =>
  listTabOrders(database.db, { tab, filters: { ...NO_FILTERS, ...filters }, after: null, limit: 30, ...extra });
const numbers = async (...args: Parameters<typeof page>) => (await page(...args)).rows.map((r) => r.number);

describe("tabs (S-111 AC1, AC2)", () => {
  test("each status is listed in its tab, and the counts match", async () => {
    await seed(
      { number: 1, status: "pending_approval" },
      { number: 2, status: "quote_needed" },
      { number: 3, status: "awaiting_payment" },
      { number: 4, status: "quote_sent" },
      { number: 5, status: "in_preparation" },
      { number: 6, status: "completed" },
      { number: 7, status: "cancelled" },
      { number: 8, status: "declined" },
      { number: 9, status: "closed" },
    );

    expect(await numbers("review")).toEqual([1, 2]);
    expect(await numbers("upcoming")).toEqual([4, 5]);
    expect(await numbers("completed")).toEqual([6]);
    expect(await numbers("closed")).toEqual([9, 8, 7]);
    expect(await countTabs(database.db)).toEqual({ review: 2, payment: 1, upcoming: 2, completed: 1, closed: 3 });
  });

  test("upcoming is by date, then window start, then number", async () => {
    await seed(
      { number: 1, status: "approved", on: "2026-11-21", start: "09:00" },
      { number: 2, status: "approved", on: "2026-11-20", start: "14:00" },
      { number: 3, status: "approved", on: "2026-11-20", start: "09:00" },
      { number: 4, status: "approved", on: "2026-11-20", start: "09:00" },
    );

    expect(await numbers("upcoming")).toEqual([3, 4, 2, 1]);
  });

  test("completed is newest date first", async () => {
    await seed({ number: 1, status: "completed", on: "2026-11-10" }, { number: 2, status: "completed", on: "2026-11-12" }, { number: 3, status: "completed", on: "2026-11-11" });

    expect(await numbers("completed")).toEqual([2, 3, 1]);
  });
});

describe("keyset paging (S-111 AC4)", () => {
  test.each(["review", "upcoming", "completed", "closed"] as const)("%s: 31 orders give 30, then the last one by cursor, never twice", async (tab) => {
    const status = { review: "pending_approval", upcoming: "approved", completed: "completed", closed: "cancelled" }[tab];
    await seed(...Array.from({ length: 31 }, (_, i) => ({ number: i + 1, status, on: `2026-11-${String(10 + (i % 5)).padStart(2, "0")}`, start: i % 2 ? "14:00" : "09:00" })));

    const first = await page(tab);
    expect(first.rows).toHaveLength(30);
    expect(first.more).toBe(true);
    const second = await page(tab, {}, { after: cursorAfter(tab, first.rows.at(-1)!) });
    expect(second.rows).toHaveLength(1);
    expect(second.more).toBe(false);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.number)).size).toBe(31);
  });
});

describe("search and filters (S-112)", () => {
  beforeEach(async () => {
    await seed(
      { number: 42, name: "Hélène Dupont", phone: "+23057123456", status: "approved", fulfilment: "delivery", paid: false, on: "2026-11-20" },
      { number: 43, name: "Marie Curie", phone: "+23059998887", status: "approved", fulfilment: "pickup", paid: true, on: "2026-11-21" },
      { number: 44, name: "50%_off O'Brien", phone: "+23052223334", status: "approved", fulfilment: "delivery", paid: true, on: "2026-11-22" },
    );
  });

  test.each(["5712 3456", "+230 5712 3456", "57123456"])("phone %s finds the order (AC1)", async (q) => {
    expect(await numbers("upcoming", { q })).toEqual([42]);
  });

  test.each(["42", "APB-0042", "apb-42"])("number %s finds order 42 (AC2)", async (q) => {
    expect(await numbers("upcoming", { q })).toContain(42);
  });

  test.each(["helene", "HÉLÈNE", "dupont"])("name %s is case- and accent-insensitive (AC2)", async (q) => {
    expect(await numbers("upcoming", { q })).toEqual([42]);
  });

  test("delivery + unpaid + a date: only orders matching all three (AC3)", async () => {
    expect(await numbers("upcoming", { fulfilment: "delivery", paid: false, from: "2026-11-20", to: "2026-11-20" })).toEqual([42]);
    expect(await numbers("upcoming", { fulfilment: "delivery", paid: true })).toEqual([44]);
    expect(await numbers("upcoming", { from: "2026-11-21" })).toEqual([43, 44]);
  });

  test.each(["%", "_", "'", "50%_", "o'brien"])("%s is literal text, never a wildcard or an error (AC7)", async (q) => {
    const expected = q === "%" || q === "_" || q === "50%_" ? [44] : q === "'" || q === "o'brien" ? [44] : [];
    expect(await numbers("upcoming", { q })).toEqual(expected);
  });

  test("search stays within the tab (recorded decision)", async () => {
    expect(await numbers("review", { q: "Hélène" })).toEqual([]);
  });
});
