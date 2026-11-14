// E-15 S-307: the workshop emails (received, accepted with the Juice steps, confirmed, reminder,
// released, event cancelled) in EN and FR from a real registration on PGlite, and the admin
// alerts (email and push) that never carry the allergies, the people's names or the message.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { orderAlertPayload } from "~/server/notify/push-text.server";
import type { Database } from "~/server/db.server";
import { insertWorkshopEvent, registerTest } from "~/server/testing/workshops";
import { loadOrderEmailData } from "./order-data.server";
import { renderAdminAlertEmail } from "./templates/admin-alert-emails";
import { type OrderEmailKey, renderOrderEmail } from "./templates/order-emails";

let database: TestDatabase;
let orderId: string;
let frOrderId: string;
const SITE = "https://bakery.example";

beforeAll(async () => {
  database = await createTestDatabase();
  await database.client.query("update settings set juice_name = 'Bakery Test', juice_number = '5000 0000' where id = 1");
  const eventId = await insertWorkshopEvent(database);
  orderId = (await registerTest(database, eventId, { cakes: "2", "cake.1": "rv", peopleNames: "Aisha and Ravi", allergiesChoice: "yes", allergies: "Peanuts", message: "Anniversary" })).orderId;
  frOrderId = (await registerTest(database, eventId, { "contact.email": "fr@example.com" }, { locale: "fr" })).orderId;
}, 60_000);

afterAll(async () => {
  await database.close();
});

async function render(key: OrderEmailKey, id: string, status?: string, payload: Record<string, string> = {}) {
  if (status) await database.client.query("update orders set status = $2 where id = $1", [id, status]);
  const loaded = (await loadOrderEmailData(database.db as unknown as Database, [id])).get(id)!;
  const locale = (await database.client.query<{ locale: "en" | "fr" }>("select locale from orders where id = $1", [id])).rows[0]!.locale;
  return renderOrderEmail(key, { ...loaded, siteUrl: SITE, locale, payload });
}

describe("customer emails (S-307 AC1, AC2)", () => {
  test("received: the workshop, cakes, people, the registrant's own allergies, date, time and address", async () => {
    const mail = await render("workshop_received", orderId);
    expect(mail.subject).toBe("Workshop registration APB-0001 received");
    for (const text of ["Valentine's cake workshop", "2 cakes (up to 2 people each)", "Aisha and Ravi", "Peanuts", "Sunday, 14 February 2027", "14:00", "12 Rue Example, Beau Bassin"]) expect(mail.text).toContain(text);
    expect(mail.text).not.toContain("Pickup");
  });

  test("accepted (payment_instructions): workshop wording, the Juice payment steps and the cakes", async () => {
    const mail = await render("payment_instructions", orderId, "awaiting_payment");
    expect(mail.subject).toBe("Workshop registration APB-0001 accepted: please pay");
    expect(mail.text).toContain("Bakery Test");
    expect(mail.text).toContain("5000 0000");
  });

  test("confirmed, reminder and release use workshop wording", async () => {
    expect((await render("order_confirmed", orderId, "approved")).subject).toBe("Your workshop place APB-0001 is confirmed");
    expect((await render("payment_reminder", orderId, "awaiting_payment")).text).toContain("workshop registration APB-0001");
    const released = await render("order_cancelled_unpaid", orderId, "cancelled");
    expect(released.text).toContain("the place was freed");
    expect(released.html).toContain(`${SITE}/workshops`);
  });

  test("event cancelled: the reason, and the refund line when it was paid; French for a French registration", async () => {
    await database.client.query("update orders set paid = true, refund_due_rs = total_rs where id = $1", [orderId]);
    const mail = await render("workshop_cancelled", orderId, "cancelled", { reason: "Oven repair" });
    expect(mail.subject).toBe("Workshop cancelled: Valentine's cake workshop (APB-0001)");
    expect(mail.text).toContain("Oven repair");
    expect(mail.text).toContain("Rs 3,000");
    const fr = await render("workshop_received", frOrderId);
    expect(fr.subject).toBe("Inscription à l'atelier APB-0002 reçue");
    expect(fr.text).toContain("Atelier gâteau de la Saint-Valentin");
    expect(fr.text).toContain("Aucune");
  });
});

describe("admin alerts never carry health data (S-307 AC3)", () => {
  test("the email and the push name the number and first name only", () => {
    const mail = renderAdminAlertEmail("admin_alert_new_workshop", { siteUrl: SITE, locale: "en", orderId, orderNumber: "APB-0001", contactName: "Aisha Test" });
    const push = orderAlertPayload("new_workshop", { id: orderId, orderNumber: "APB-0001", contactName: "Aisha Test" }, "en");
    expect(mail.subject).toBe("New workshop registration APB-0001");
    expect(push).toMatchObject({ title: "New workshop registration APB-0001", body: "From Aisha. Accept or refuse it.", url: `/admin/orders/${orderId}` });
    for (const text of [mail.html, mail.text, JSON.stringify(push)]) expect(text).not.toMatch(/Peanuts|Ravi|Anniversary|Test/);
  });
});
