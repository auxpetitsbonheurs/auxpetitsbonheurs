// Sales figures against real order rows (S-171, S-172, S-173 on PGlite).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { insertWorkshopEvent } from "~/server/testing/workshops";
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
    expect(first[0]).toEqual({ number: 1, numberPrefix: "APB-", fulfilOn: "2026-11-12", source: "website", fulfilment: "pickup", itemsTotalRs: 100, deliveryFeeRs: 0, totalRs: 100, paid: true, costRs: null, discountRs: null });
    const second = await completedOrdersPage(database.db, NOV, 3, 3);
    expect(second.map((row) => row.number)).toEqual([4, 5]);
  });
});

describe("amount earned, spent and profit (S-318)", () => {
  test("AC5: earned = completed orders, spent = their costs plus workshop costs in the period, profit the difference", async () => {
    await order({ totalRs: 3000, costRs: 1200 });
    await order({ totalRs: 2000, costRs: 500, paid: true });
    await insertWorkshopEvent(database, { eventOn: "2026-11-20", status: "completed", costRs: 900 });
    await insertWorkshopEvent(database, { eventOn: "2026-12-05", status: "completed", costRs: 5000 });
    const { profit, revenueRs } = await salesReport(database.db, NOV, "en");
    expect(profit).toMatchObject({ earnedRs: 5000, ordersCostRs: 1700, workshopsCostRs: 900, spentRs: 2600, profitRs: 2400, ordersMissingCost: 0, workshopsMissingCost: 0 });
    expect(profit.earnedRs).toBe(revenueRs);
  });

  test("AC5: refunded, cancelled, declined and unfinished orders are left out of earned and spent", async () => {
    await order({ status: "cancelled", totalRs: 4000, costRs: 1000, paid: true, refundDueRs: 4000 });
    await order({ status: "declined", totalRs: 1500, costRs: 300, paid: true, refundDueRs: 1500 });
    await order({ status: "approved", totalRs: 900 });
    await order({ totalRs: 1000, costRs: 400 });
    expect((await salesReport(database.db, NOV, "en")).profit).toMatchObject({ earnedRs: 1000, spentRs: 400, profitRs: 600, ordersMissingCost: 0 });
  });

  test("AC6: orders with no cost count as Rs 0 and are listed (workshop registrations are not)", async () => {
    await order({ totalRs: 1000, costRs: 0 });
    const a = await order({ totalRs: 1500, fulfilOn: "2026-11-03", contactName: "Bea" });
    await order({ totalRs: 800, source: "workshop" });
    const { profit } = await salesReport(database.db, NOV, "en");
    expect(profit).toMatchObject({ earnedRs: 3300, spentRs: 0, profitRs: 3300, ordersMissingCost: 1 });
    expect(profit.missingOrders).toEqual([{ id: a.id, number: `APB-${String(a.number).padStart(4, "0")}`, contactName: "Bea", fulfilOn: "2026-11-03", totalRs: 1500 }]);
  });

  test("AC7: a published or completed workshop with no cost is reported missing; draft and cancelled ones only count with a cost", async () => {
    await insertWorkshopEvent(database, { eventOn: "2026-11-07", status: "published", costRs: null });
    await insertWorkshopEvent(database, { eventOn: "2026-11-08", status: "draft", costRs: null });
    await insertWorkshopEvent(database, { eventOn: "2026-11-09", status: "cancelled", costRs: 650, titleFr: null });
    const { profit } = await salesReport(database.db, NOV, "fr");
    expect(profit).toMatchObject({ workshopsCostRs: 650, workshopsMissingCost: 1, profitRs: -650 });
    expect(profit.workshops.map((w) => [w.eventOn, w.status, w.costRs])).toEqual([
      ["2026-11-07", "published", null],
      ["2026-11-09", "cancelled", 650],
    ]);
    expect(profit.workshops[1]!.title).toBe("Valentine's cake workshop");
  });

  test("the CSV order rows carry the cost", async () => {
    await order({ totalRs: 1000, costRs: 250 });
    await order({ totalRs: 1000 });
    expect((await completedOrdersPage(database.db, NOV, null, 10)).map((row) => row.costRs)).toEqual([250, null]);
  });
});

describe("order discounts in Sales (S-320 AC10)", () => {
  test("revenue, average and earned use the discounted total; Discounts given adds them up", async () => {
    await order({ totalRs: 1000, discountRs: 200 });
    await order({ totalRs: 1500 });
    await order({ status: "cancelled", totalRs: 400, discountRs: 100 });
    const report = await salesReport(database.db, NOV, "en");
    expect(report).toMatchObject({ revenueRs: 2500, orderCount: 2, averageRs: 1250, discountsRs: 200 });
    expect(report.profit.earnedRs).toBe(2500);
  });

  test("top products share each order's discount across its lines in proportion to their totals", async () => {
    const cake = await insertProduct(database.db, { slug: "cake-d" });
    const tart = await insertProduct(database.db, { slug: "tart-d" });
    // Lines Rs 800 + Rs 400 = Rs 1,200; Rs 300 off → cake Rs 600, tart Rs 300.
    await order({ totalRs: 900, discountRs: 300, items: [{ productId: cake, quantity: 2, lineTotalRs: 800 }, { productId: tart, quantity: 1, lineTotalRs: 400 }] });
    const report = await salesReport(database.db, NOV, "en");
    expect(report.top5.map((row) => row.revenueRs)).toEqual([600, 300]);
  });

  test("the CSV Orders page carries the discount", async () => {
    await order({ totalRs: 1000, discountRs: 200 });
    const [row] = await completedOrdersPage(database.db, NOV, null, 10);
    expect(row).toMatchObject({ totalRs: 1000, discountRs: 200 });
  });
});
