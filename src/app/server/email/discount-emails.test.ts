// S-320 AC6, AC7: an order discount in the customer emails, from a real order on PGlite: the
// items block shows Subtotal and "Discount (reason)" before the total to pay, and the
// payment_instructions email re-sent after a change opens with the updated amount (EN and FR).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { placeTestOrder } from "~/server/testing/orders";
import { loadOrderEmailData } from "./order-data.server";
import { type OrderEmailKey, renderOrderEmail } from "./templates/order-emails";

let database: TestDatabase;
let orderId: string;
const SITE = "https://bakery.example";

beforeAll(async () => {
  database = await createTestDatabase();
  await database.client.query("update settings set juice_name = 'Bakery Test', juice_number = '5000 0000' where id = 1");
  const { token } = await placeTestOrder(database);
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  // Rs 850 of items, Rs 100 off for a loyal customer: Rs 750 to pay.
  await database.client.query("update orders set status = 'awaiting_payment', discount_rs = 100, discount_reason = 'Loyal customer', total_rs = 750 where id = $1", [orderId]);
}, 60_000);

afterAll(async () => {
  await database.close();
});

async function render(key: OrderEmailKey, locale: "en" | "fr", payload: Record<string, unknown> = {}) {
  await database.client.query("update orders set locale = $2 where id = $1", [orderId, locale]);
  const loaded = (await loadOrderEmailData(database.db as unknown as Database, [orderId])).get(orderId)!;
  return renderOrderEmail(key, { ...loaded, siteUrl: SITE, locale, payload });
}

describe("order discount in emails (S-320)", () => {
  test("AC7: the items block reads Subtotal, Discount (reason) and the total to pay", async () => {
    const mail = await render("order_confirmed", "en");
    expect(mail.text).toContain("Subtotal: Rs 850\nDiscount (Loyal customer): −Rs 100\nTotal: Rs 750");
    expect(mail.html).toContain("Discount (Loyal customer): −Rs 100");
  });

  test("AC6: the re-sent payment email says the amount was updated, in the order's language", async () => {
    const en = await render("payment_instructions", "en", { amountChanged: true });
    expect(en.text).toContain("was updated: Rs 750");
    const fr = await render("payment_instructions", "fr", { amountChanged: true });
    expect(fr.text).toContain("a changé");
    expect(fr.text).toContain("Remise (Loyal customer)");
  });

  test("the first payment email keeps its usual opening", async () => {
    const mail = await render("payment_instructions", "en");
    expect(mail.text).not.toContain("was updated");
    expect(mail.text).toContain("Rs 750");
  });
});
