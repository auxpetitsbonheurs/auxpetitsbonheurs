// Customers list, search and detail against real rows (S-174..S-177 on PGlite).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { DELETED_CUSTOMER_NAME } from "~/domain/customer-totals";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { findAdminCustomer, listCustomers, saveCustomerNote } from "./admin-customers.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const db = () => database.db;
const day = (iso: string) => new Date(`${iso}T06:00:00Z`);
const page = (options: Partial<Parameters<typeof listCustomers>[1]> = {}) => listCustomers(db(), { search: { text: "", digits: null }, sort: "last_order", cursor: null, limit: 30, ...options });

describe("totals (S-174 AC1, AC2)", () => {
  test("order count leaves cancelled out; total spent counts Completed only; last order date", async () => {
    const anna = await insertTestCustomer(db(), { name: "Anna" });
    await insertTestOrder(db(), { customerId: anna, status: "completed", totalRs: 1000, createdAt: day("2026-11-01") });
    await insertTestOrder(db(), { customerId: anna, status: "completed", totalRs: 500, createdAt: day("2026-11-03") });
    await insertTestOrder(db(), { customerId: anna, status: "cancelled", totalRs: 900, createdAt: day("2026-11-09") });
    const { rows } = await page();
    expect(rows).toEqual([expect.objectContaining({ id: anna, name: "Anna", phone: "+23057123456", orderCount: 2, totalSpentRs: 1500, lastOrderOn: "2026-11-09" })]);
  });
});

describe("sort and cursor (S-174 AC3, AC4)", () => {
  async function seed() {
    const ids: Record<string, string> = {};
    for (const [name, spent, placed] of [["Cleo", 300, "2026-11-05"], ["anna", 900, "2026-11-01"], ["Bea", 600, "2026-11-08"]] as const) {
      ids[name] = await insertTestCustomer(db(), { name });
      await insertTestOrder(db(), { customerId: ids[name]!, totalRs: spent, createdAt: day(placed) });
    }
    ids.None = await insertTestCustomer(db(), { name: "No orders" });
    return ids;
  }

  test("last order (newest first, none last), name (case-insensitive) and total spent", async () => {
    await seed();
    expect((await page()).rows.map((r) => r.name)).toEqual(["Bea", "Cleo", "anna", "No orders"]);
    expect((await page({ sort: "name" })).rows.map((r) => r.name)).toEqual(["anna", "Bea", "Cleo", "No orders"]);
    expect((await page({ sort: "spent" })).rows.map((r) => r.name)).toEqual(["anna", "Bea", "Cleo", "No orders"]);
  });

  test("45 customers: 30 then 15 through the cursor, no duplicates or gaps, for every sort", async () => {
    for (let i = 0; i < 45; i += 1) {
      const id = await insertTestCustomer(db(), { name: `Customer ${String(i).padStart(2, "0")}` });
      if (i % 3) await insertTestOrder(db(), { customerId: id, totalRs: (i % 5) * 100, createdAt: day(`2026-10-${String(1 + (i % 4)).padStart(2, "0")}`) });
    }
    for (const sort of ["last_order", "name", "spent"] as const) {
      const first = await page({ sort });
      expect(first.rows).toHaveLength(30);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await page({ sort, cursor: first.nextCursor });
      expect(second.rows).toHaveLength(15);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(45);
    }
  });

  test("a cursor made for another sort or tampered is ignored (first page)", async () => {
    await seed();
    expect((await page({ cursor: "not-a-cursor" })).rows).toHaveLength(4);
  });
});

describe("search (S-175)", () => {
  test("AC1, AC2: phone digits, partial name, partial email; the total of matches", async () => {
    const anna = await insertTestCustomer(db(), { name: "Anna Rault", phone: "+23057123456", email: "anna.r@example.com" });
    await insertTestCustomer(db(), { name: "Marc", phone: "+23059990000", email: "marc@example.com" });
    expect((await page({ search: { text: "5712 3456", digits: "57123456" } })).rows.map((r) => r.id)).toEqual([anna]);
    expect((await page({ search: { text: "rau", digits: null } })).rows.map((r) => r.id)).toEqual([anna]);
    expect((await page({ search: { text: "ANNA.R@", digits: null } })).rows.map((r) => r.id)).toEqual([anna]);
    expect((await page({ search: { text: "zzz", digits: null } })).total).toBe(0);
  });

  test("AC4: wildcards and quotes match literally", async () => {
    const odd = await insertTestCustomer(db(), { name: "100% O'Brien_x" });
    await insertTestCustomer(db(), { name: "100 Obrienax" });
    expect((await page({ search: { text: "100%", digits: null } })).rows.map((r) => r.id)).toEqual([odd]);
    expect((await page({ search: { text: "O'Brien_", digits: null } })).rows.map((r) => r.id)).toEqual([odd]);
  });

  test("AC6: anonymised customers are never found, but stay in the plain list", async () => {
    await insertTestCustomer(db(), { name: DELETED_CUSTOMER_NAME, phone: "+23057123456", email: null });
    expect((await page({ search: { text: "Deleted", digits: null } })).rows).toEqual([]);
    expect((await page({ search: { text: "57123456", digits: "57123456" } })).rows).toEqual([]);
    expect((await page()).rows).toHaveLength(1);
  });
});

describe("detail and note (S-176, S-177)", () => {
  test("all orders newest first with their snapshot names; totals leave cancelled and declined out", async () => {
    const anna = await insertTestCustomer(db(), { name: "Anna Rault", locale: "fr" });
    await insertTestOrder(db(), { customerId: anna, status: "completed", totalRs: 1000, contactName: "Anna", createdAt: day("2026-11-01") });
    await insertTestOrder(db(), { customerId: anna, status: "declined", totalRs: 400, contactName: "A. Rault", createdAt: day("2026-11-05") });
    await insertTestOrder(db(), { customerId: anna, status: "cancelled", totalRs: 300, contactName: "Anna R", createdAt: day("2026-11-07") });
    const found = await findAdminCustomer(db(), anna);
    expect(found).toMatchObject({ customer: { id: anna, name: "Anna Rault", locale: "fr", hasAccount: false, adminNote: null }, orderCount: 1, totalSpentRs: 1000 });
    expect(found!.orders.map((o) => [o.contactName, o.status])).toEqual([["Anna R", "cancelled"], ["A. Rault", "declined"], ["Anna", "completed"]]);
    expect(found!.orders[0]).toMatchObject({ number: "APB-0003", totalRs: 300 });
  });

  test("unknown customer: undefined; the note saves, clears and reports unknown ids", async () => {
    expect(await findAdminCustomer(db(), "00000000-0000-4000-8000-000000000000")).toBeUndefined();
    const anna = await insertTestCustomer(db());
    expect(await saveCustomerNote(db(), anna, "Allergic to nuts")).toBe(true);
    expect((await findAdminCustomer(db(), anna))!.customer.adminNote).toBe("Allergic to nuts");
    expect(await saveCustomerNote(db(), anna, null)).toBe(true);
    expect((await findAdminCustomer(db(), anna))!.customer.adminNote).toBeNull();
    expect(await saveCustomerNote(db(), "00000000-0000-4000-8000-000000000000", "x")).toBe(false);
  });
});
