// S-127: invoice numbering (taken once from the counter, never duplicated, kept on regeneration)
// and the document's data, on the migrated PGlite database. PGlite serialises connections, so the
// race is modelled by running the requests concurrently; e2e repeats it on a real Postgres.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { assignInvoiceNumber } from "~/server/repos/invoice.server";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { invoiceDocument } from "./invoice.server";

let database: TestDatabase;
const db = () => database.db as unknown as Database;
const NOW = new Date("2026-11-05T21:30:00Z"); // 01:30 on 6 November in Mauritius

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function orderId(token: string): Promise<string> {
  const { rows } = await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token]);
  return rows[0]!.id;
}

async function newOrder(overrides?: Record<string, string>): Promise<string> {
  return orderId((await placeTestOrder(database, overrides ? { overrides } : {})).token);
}

async function versions(id: string) {
  const { rows } = await database.client.query<{ order: number; settings: number; next: number }>(
    "select o.version as order, s.version as settings, s.next_invoice_number as next from orders o, settings s where o.id = $1 and s.id = 1",
    [id],
  );
  return rows[0];
}

describe("numbering (S-127)", () => {
  test("the first invoice takes 1108, stores the Mauritius date and never bumps the order or Settings version", async () => {
    const id = await newOrder();
    const before = await versions(id);

    expect(await assignInvoiceNumber(db(), id, "2026-11-06")).toEqual({ number: 1108, date: "2026-11-06" });

    expect(await versions(id)).toEqual({ order: before!.order, settings: before!.settings, next: 1109 });
  });

  test("regenerating keeps the number and the date, and takes nothing from the counter", async () => {
    const id = await newOrder();
    await assignInvoiceNumber(db(), id, "2026-11-06");

    expect(await assignInvoiceNumber(db(), id, "2026-12-01")).toEqual({ number: 1108, date: "2026-11-06" });
    expect((await versions(id))!.next).toBe(1109);
  });

  test("concurrent first invoices of different orders get distinct consecutive numbers", async () => {
    const ids = [await newOrder(), await newOrder(), await newOrder(), await newOrder()];

    const stamps = await Promise.all(ids.map((id) => assignInvoiceNumber(db(), id, "2026-11-06")));

    expect(stamps.map((s) => s!.number).sort()).toEqual([1108, 1109, 1110, 1111]);
  });

  test("concurrent requests for one order give it one number and take one from the counter", async () => {
    const id = await newOrder();

    const stamps = await Promise.all([1, 2, 3].map(() => assignInvoiceNumber(db(), id, "2026-11-06")));

    expect(new Set(stamps.map((s) => s!.number))).toEqual(new Set([1108]));
    expect((await versions(id))!.next).toBe(1109);
  });

  test("a counter set below a used number skips past it instead of issuing it twice", async () => {
    const first = await newOrder();
    await assignInvoiceNumber(db(), first, "2026-11-06");
    await database.client.query("update settings set next_invoice_number = 1000");

    const second = await newOrder();
    expect((await assignInvoiceNumber(db(), second, "2026-11-06"))!.number).toBe(1109);
  });

  test("an unknown order gets no number and leaves the counter alone", async () => {
    expect(await assignInvoiceNumber(db(), "7d1f0c9e-1111-4222-8333-944455566677", "2026-11-06")).toBeNull();
    const { rows } = await database.client.query<{ next: number }>("select next_invoice_number as next from settings");
    expect(rows[0]!.next).toBe(1108);
  });
});

describe("invoiceDocument (S-127)", () => {
  test("a delivery order: rows, delivery fee, totals, Mauritius invoice date and placeholders from Settings", async () => {
    await database.client.query(
      `update settings set invoice_legal_name = 'Example Bakery Ltd', invoice_brn = 'C00000000', invoice_address = E'1 Example Street\\nExample Town',
        invoice_phone = '+230 5000 0000', bank_name = 'Example Bank', bank_account_name = 'Example Holder', bank_account_number = '000000000000', juice_number = '+230 5000 0000'`,
    );
    const id = await newOrder({ ...DELIVERY_ORDER, displayedTotalRs: "1050" });

    const doc = await invoiceDocument(db(), id, NOW);

    expect(doc).toMatchObject({
      number: 1108,
      date: "2026-11-06",
      fileName: "Invoice-1108.pdf",
      locale: "en",
      business: { legalName: "Example Bakery Ltd", brn: "C00000000", address: ["1 Example Street", "Example Town"], phone: "+230 5000 0000" },
      payment: { bankName: "Example Bank", accountName: "Example Holder", accountNumber: "000000000000", juiceNumber: "+230 5000 0000" },
      terms: ["Full payment by Juice before delivery/pickup"],
      thankYou: "Thank you for choosing Aux petits bonheurs!",
      instructions: ["Delivery", "12 Royal Road, Rose Hill"],
      discountLabel: null,
    });
    expect(doc!.labels.invoiceNo).toBe("INVOICE NO.");
    const delivery = doc!.lines.at(-1)!;
    expect(delivery).toMatchObject({ quantity: null, description: "Delivery" });
    expect(doc!.totals.subtotalRs).toBe(doc!.lines.reduce((sum, line) => sum + line.totalRs, 0));
    expect(doc!.totals).toMatchObject({ paidRs: 0, dueRs: doc!.totals.totalRs, adjustmentRs: 0 });
  });

  test("a paid French order: French labels, the downpayment is the total and nothing is due", async () => {
    const id = await newOrder();
    await database.client.query("update orders set locale = 'fr', paid = true where id = $1", [id]);

    const doc = await invoiceDocument(db(), id, NOW);

    expect(doc!.labels).toMatchObject({ invoiceNo: "FACTURE N°", billTo: "FACTURER À", totalDue: "RESTE À PAYER" });
    expect(doc!.instructions).toEqual(["Retrait"]);
    expect(doc!.terms).toEqual(["Paiement intégral par Juice avant la livraison/le retrait"]);
    expect(doc!.totals.paidRs).toBe(doc!.totals.totalRs);
    expect(doc!.totals.dueRs).toBe(0);
  });

  test("a promotion shows as one line and the rows are at the price before it", async () => {
    const id = await newOrder();
    await database.client.query("update order_item set original_base_price_rs = unit_base_price_rs + 100, promotion_title_en = 'Spring sale' where order_id = $1", [id]);

    const doc = await invoiceDocument(db(), id, NOW);

    expect(doc!.discountLabel).toBe("Promotion: Spring sale");
    expect(doc!.totals.discountRs).toBe(100);
    expect(doc!.totals.subtotalRs - doc!.totals.discountRs).toBe(doc!.totals.totalRs);
  });

  test("an order with no lines (a custom cake quote) is one line at the quote less delivery", async () => {
    const id = await newOrder();
    await database.client.query("delete from order_item where order_id = $1", [id]);
    await database.client.query("update orders set source = 'custom_request', total_rs = 3000, delivery_fee_rs = 0 where id = $1", [id]);

    const doc = await invoiceDocument(db(), id, NOW);

    expect(doc!.lines).toEqual([{ quantity: 1, description: "Custom cake", details: [], unitRs: 3000, totalRs: 3000 }]);
    expect(doc!.totals.totalRs).toBe(3000);
  });

  test("an unknown order is null", async () => {
    expect(await invoiceDocument(db(), "7d1f0c9e-1111-4222-8333-944455566677", NOW)).toBeNull();
  });
});
