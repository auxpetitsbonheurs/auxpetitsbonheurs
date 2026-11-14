// Sales figures against real order rows (S-171, S-172, S-173 on PGlite).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { completedOrdersPage, countAwaitingPayment, salesReport } from "./sales.server";

let database: TestDatabase;
let customerId: string;
const NOV = { from: "2026-11-01", to: "2026-11-30" };

beforeEach(async () => {
  database = await createTestDatabase();
  customerId = await insertTestCustomer(database.db);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const order = (values: Omit<Parameters<typeof insertTestOrder>[1], "customerId">) => insertTestOrder(database.db, { customerId, ...values });

describe("revenue, orders and average (S-171)", () => {
  test("AC1: 10 completed orders totalling Rs 12,000 in November, delivery fees included, paid flag ignored", async () => {
    for (let i = 0; i < 9; i += 1) await order({ totalRs: 1100, paid: i % 2 === 0 });
    await order({ totalRs: 2100, deliveryFeeRs: 150, fulfilment: "delivery" });
    const report = await salesReport(database.db, NOV, "en");
    expect(report).toMatchObject({ revenueRs: 12_000, orderCount: 10, averageRs: 1200 });
  });

  test("AC2: approved, cancelled, declined, awaiting payment and closed orders never count", async () => {
    for (const status of ["approved", "approved", "approved", "cancelled", "declined", "awaiting_payment", "closed", "out_for_delivery"] as const) {
      await order({ status, totalRs: 900 });
    }
    expect(await salesReport(database.db, NOV, "en")).toMatchObject({ revenueRs: 0, orderCount: 0, averageRs: 0 });
  });

  test("AC7: the order date decides the month (fulfil_on 30 Nov is November), and a moved date moves the order", async () => {
    const { id } = await order({ fulfilOn: "2026-11-30", totalRs: 500 });
    expect((await salesReport(database.db, NOV, "en")).revenueRs).toBe(500);
    expect((await salesReport(database.db, { from: "2026-12-01", to: "2026-12-31" }, "en")).revenueRs).toBe(0);
    await database.client.query("update orders set fulfil_on = '2026-12-01' where id = $1", [id]);
    expect((await salesReport(database.db, NOV, "en")).revenueRs).toBe(0);
    expect((await salesReport(database.db, { from: "2026-12-01", to: "2026-12-31" }, "en")).revenueRs).toBe(500);
  });

  test("AC8: a completed order moved back one step no longer counts", async () => {
    const { id } = await order({ totalRs: 700 });
    await database.client.query("update orders set status = 'ready_for_pickup' where id = $1", [id]);
    expect((await salesReport(database.db, NOV, "en")).revenueRs).toBe(0);
  });

  test("range bounds are inclusive", async () => {
    await order({ fulfilOn: "2026-11-01", totalRs: 100 });
    await order({ fulfilOn: "2026-10-31", totalRs: 1000 });
    await order({ fulfilOn: "2026-12-01", totalRs: 1000 });
    expect((await salesReport(database.db, NOV, "en")).revenueRs).toBe(100);
  });
});

describe("breakdowns (S-172)", () => {
  test("AC1, AC4: delivery vs pickup and all three sources add up to revenue", async () => {
    for (let i = 0; i < 6; i += 1) await order({ fulfilment: "delivery", totalRs: 1000, source: i < 2 ? "manual" : "website" });
    for (let i = 0; i < 4; i += 1) await order({ fulfilment: "pickup", totalRs: 500 });
    const report = await salesReport(database.db, NOV, "en");
    expect(report).toMatchObject({ delivery: 6, pickup: 4, deliveryRevenueRs: 6000, pickupRevenueRs: 2000, revenueRs: 8000 });
    expect(report.bySource).toEqual({ website: 6000, custom_request: 0, manual: 2000, workshop: 0 });
  });

  test("AC2, AC3: top 5 by units from completed orders only, French names, free-text items excluded but in revenue", async () => {
    const cake = await insertProduct(database.db, { slug: "cake-a", nameEn: "Chocolate cake", nameFr: "Gâteau au chocolat" });
    const tart = await insertProduct(database.db, { slug: "tart-b", nameEn: "Lemon tart", nameFr: null });
    await order({ totalRs: 2600, items: [{ productId: cake, quantity: 2, lineTotalRs: 1600 }, { productId: null, name: "Balloons", quantity: 9, lineTotalRs: 1000 }] });
    await order({ totalRs: 900, items: [{ productId: tart, quantity: 3, lineTotalRs: 900 }] });
    await order({ status: "cancelled", totalRs: 900, items: [{ productId: cake, quantity: 5, lineTotalRs: 4000 }] });
    const report = await salesReport(database.db, NOV, "fr");
    expect(report.revenueRs).toBe(3500);
    expect(report.top5).toEqual([
      { name: "Lemon tart", quantity: 3, revenueRs: 900 },
      { name: "Gâteau au chocolat", quantity: 2, revenueRs: 1600 },
    ]);
  });
});

describe("unpaid list (S-173)", () => {
  test("AC1, AC3: confirmed unpaid orders in range with number, name, status, date and total; others never listed", async () => {
    const approved = await order({ status: "approved", totalRs: 3000, contactName: "Hélène", fulfilOn: "2026-11-20" });
    await order({ status: "completed", totalRs: 800, contactName: "Marc", fulfilOn: "2026-11-05" });
    for (const status of ["in_preparation", "ready_for_pickup", "out_for_delivery"] as const) await order({ status, totalRs: 100 });
    for (const status of ["pending_approval", "quote_needed", "quote_sent", "declined", "cancelled", "closed", "awaiting_payment"] as const) await order({ status, totalRs: 999 });
    await order({ status: "approved", totalRs: 5000, paid: true });
    await order({ status: "approved", totalRs: 5000, fulfilOn: "2026-12-02" });
    const report = await salesReport(database.db, NOV, "en");
    expect(report.unpaidTotalRs).toBe(4100);
    expect(report.unpaidCount).toBe(5);
    expect(report.unpaid[0]).toEqual({ id: expect.any(String), number: "APB-0002", contactName: "Marc", status: "completed", fulfilOn: "2026-11-05", totalRs: 800 });
    expect(report.unpaid.find((row) => row.id === approved.id)).toMatchObject({ contactName: "Hélène", status: "approved", totalRs: 3000 });
  });

  test("AC2: marked paid, the order leaves the list; revenue is unchanged", async () => {
    const { id } = await order({ status: "completed", totalRs: 800 });
    expect((await salesReport(database.db, NOV, "en")).unpaidTotalRs).toBe(800);
    await database.client.query("update orders set paid = true, paid_at = now() where id = $1", [id]);
    const report = await salesReport(database.db, NOV, "en");
    expect(report).toMatchObject({ unpaid: [], unpaidTotalRs: 0, unpaidCount: 0, revenueRs: 800 });
  });

  test("AC4: over 200 rows, 200 show and the total covers them all", async () => {
    await database.client.query(
      `insert into orders (number, number_prefix, source, status, customer_id, contact_name, contact_phone, fulfilment, fulfil_on, time_window, items_total_rs, total_rs, locale, tracking_token)
       select n, 'APB-', 'manual', 'approved', $1, 'Bulk', '+23057123456', 'pickup', '2026-11-12', '{"id":"m","start":"09:00","end":"12:00","label":{"en":"M"}}', 10, 10, 'en', 'bulk-' || n
       from generate_series(1, 205) n`,
      [customerId],
    );
    const report = await salesReport(database.db, NOV, "en");
    expect(report.unpaid).toHaveLength(200);
    expect(report.unpaidCount).toBe(205);
    expect(report.unpaidTotalRs).toBe(2050);
  });

  test("orders awaiting their Juice payment are counted for the Payment tab link, not listed", async () => {
    await order({ status: "awaiting_payment" });
    await order({ status: "awaiting_payment", fulfilOn: "2027-01-10" });
    expect(await countAwaitingPayment(database.db)).toBe(2);
  });
});

describe("completed orders for the CSV (S-178 AC3)", () => {
  test("pages through completed orders in range by number, without overlap", async () => {
    for (let i = 0; i < 5; i += 1) await order({ totalRs: 100 + i, deliveryFeeRs: i, fulfilment: i % 2 ? "delivery" : "pickup", paid: i === 0 });
    await order({ status: "approved" });
    const first = await completedOrdersPage(database.db, NOV, null, 3);
    expect(first.map((row) => row.number)).toEqual([1, 2, 3]);
    expect(first[0]).toEqual({ number: 1, numberPrefix: "APB-", fulfilOn: "2026-11-12", source: "website", fulfilment: "pickup", itemsTotalRs: 100, deliveryFeeRs: 0, totalRs: 100, paid: true });
    const second = await completedOrdersPage(database.db, NOV, 3, 3);
    expect(second.map((row) => row.number)).toEqual([4, 5]);
  });
});
