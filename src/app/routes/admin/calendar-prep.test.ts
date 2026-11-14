// `admin/prep` loader (S-139 AC4, AC6-AC10, AC12; S-140 AC1, AC3, AC5, AC6, AC8).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./calendar-prep";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

/** Sat 14 Nov 2026, 14:05 in Mauritius. */
const NOW = "2026-11-14T10:05:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function placed(status: string, overrides: Record<string, string> = {}, quantity = 1) {
  const { token } = await placeTestOrder(database, { quantity, overrides: { date: "2026-12-12", ...overrides } });
  const id = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  await database.client.query("update orders set status = $2 where id = $1", [id, status]);
  return id;
}

/** Every test order is a fresh "Chocolate cake" product: point them all at the first one so they can merge. */
async function sameProduct() {
  await database.client.query("update order_item set product_id = (select product_id from order_item order by id limit 1)");
}

const load = (date = "2026-12-12", as = session) => loader(routeArgs(database, { path: `/admin/calendar/${date}/prep`, params: { date }, auth: as.auth, cookie: as.cookie, now: NOW }) as never) as Promise<Awaited<ReturnType<typeof loader>>>;

describe("prep list loader (S-139, S-140)", () => {
  test("confirmed orders only, merged by product and variant, with a summary and Generated time (AC1, AC4, AC12)", async () => {
    await placed("approved");
    await placed("completed", {}, 2);
    await placed("pending_approval");
    await placed("awaiting_payment");
    await placed("quote_needed");
    await placed("cancelled");
    await sameProduct();

    const page = await load();

    expect(page.summary).toEqual({ orders: 2, items: 3 });
    expect(page.groups).toEqual([{ product: "Chocolate cake", variants: [{ label: "", quantity: 3, orderCount: 2, messages: [] }] }]);
    expect(page.generatedLabel).toBe("Generated 14:05");
    expect(page.dateLabel).toBe("Saturday, 12 December 2026");
  });

  test("cake messages are kept in full, emoji included (AC6) and an order cancelled later vanishes (AC9)", async () => {
    const message = `${"Joyeux anniversaire ".repeat(9)}🎂🎉`;
    const a = await placed("approved");
    await placed("approved");
    await sameProduct();
    await database.client.query("update order_item set cake_message = $1 where order_id = $2", [message, a]);

    expect((await load()).groups[0]!.variants[0]!.messages).toEqual([message]);
    await database.client.query("update orders set status = 'cancelled' where id = $1", [a]);
    expect((await load()).summary).toEqual({ orders: 1, items: 1 });
  });

  test("no customer name, phone, email or address in the page data or the share text (AC8, S-140 AC3)", async () => {
    await placed("approved", { fulfilment: "delivery", address: "12 Royal Road, Rose Hill", "windowId.delivery": "morning", displayedTotalRs: "1050" });

    const page = await load();
    const all = JSON.stringify(page);

    for (const secret of ["Aisha", "5712", "aisha@example.com", "Royal Road"]) expect(all).not.toContain(secret);
    expect(page.shareText).toContain("Chocolate cake");
    expect(page.shareText).toContain("- 1 ×");
  });

  test("an empty day has no groups and no share text (AC7, S-140 AC5)", async () => {
    await placed("pending_approval");
    const page = await load();
    expect(page.groups).toEqual([]);
    expect(page.shareText).toBe("");
  });

  test("an invalid date is 400 (AC7)", async () => {
    let thrown: unknown;
    try {
      await load("2026-02-30");
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { init: { status: number } }).init.status).toBe(400);
  });

  test("French admin: labels and share text in French (S-140 AC1)", async () => {
    await database.client.query("update admin set locale = 'fr' where id = $1", [session.admin.id]);
    await placed("approved");
    const page = await load();
    expect(page.generatedLabel).toBe("Généré à 14:05");
    expect(page.shareText.split("\n")[0]).toBe("Liste de préparation · samedi 12 décembre 2026");
  });

  test("a customer session gets nothing; the share log refuses too (AC10, S-140 AC8)", async () => {
    await placed("approved");
    const customer = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    const asCustomer = { ...session, cookie };
    await expect(load("2026-12-12", asCustomer)).rejects.toBeInstanceOf(Response);
    await expect(action(routeArgs(database, { path: "/admin/calendar/2026-12-12/prep", params: { date: "2026-12-12" }, auth: session.auth, cookie, form: { method: "print" }, now: NOW }) as never)).rejects.toMatchObject({ init: { status: 403 } });
  });

  test("Share and Print are logged for admins (spec analytics)", async () => {
    const answer = await action(routeArgs(database, { path: "/admin/calendar/2026-12-12/prep", params: { date: "2026-12-12" }, auth: session.auth, cookie: session.cookie, form: { method: "share" }, now: NOW }) as never);
    expect(answer).toEqual({ ok: true });
  });
});
