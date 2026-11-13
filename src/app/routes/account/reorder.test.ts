// S-214 Reorder through the routes: own orders only, today's prices, the skipped note once.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { loader as basketLoader } from "~/routes/site/basket";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { cookieFrom, routeArgs } from "~/server/testing/route-context";
import { action } from "./orders";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  await database.client.exec("delete from usage_counter");
});

afterAll(async () => {
  await database.close();
});

type Envelope = { data: { ok: false; error: { code: string } }; init: { status: number } };
const session = (id: string) => auth.sessionCookie(id, new Date("2026-11-10T07:00:00Z"));

async function reorderAs(cookie: string | undefined, orderId: string) {
  try {
    return await action(routeArgs(database, { path: "/account/orders", auth, cookie, form: { intent: "reorder", orderId } }) as never);
  } catch (thrown) {
    return thrown;
  }
}

async function orderIdOf(token: string) {
  const { rows } = await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token]);
  return rows[0]!.id;
}

describe("reorder (S-214)", () => {
  test("puts the items back at today's price, goes to the basket, and names what was skipped (AC1, AC8)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const order = await placeTestOrder(database, { quantity: 2, overrides: { "contact.email": customer.email } });
    const id = await orderIdOf(order.token);
    // Today's price differs from the price paid; a second line's product is now sold out.
    await database.client.query("update product set base_price_rs = 900 where id = (select product_id from order_item where order_id = $1)", [id]);
    await database.client.query(
      "insert into order_item (order_id, product_id, name_en, name_fr, original_base_price_rs, unit_base_price_rs, options, quantity, line_total_rs, sort_order) values ($1, null, 'Custom tier cake', null, 0, 0, '[]', 1, 0, 1)",
      [id],
    );

    const response = (await reorderAs(session(customer.id), id)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/basket");
    const cookies = response.headers.getSetCookie();
    const basket = cookies.find((c) => c.startsWith("apb_basket="))!;
    const flash = cookies.find((c) => c.startsWith("apb_reorder="))!;
    const page = (await basketLoader(routeArgs(database, { path: "/basket", auth, cookie: `${cookieFrom(basket)}; ${cookieFrom(flash)}` }) as never)) as {
      priced: { quantity: number; unitPriceRs: number }[];
      reorderNote: { added: number; skipped: { reason: string; name: { en: string } }[] };
    };
    expect(page.priced.map((l) => [l.quantity, l.unitPriceRs])).toEqual([[2, 900]]);
    expect(page.reorderNote).toEqual({ added: 1, skipped: [{ reason: "free_text", name: { en: "Custom tier cake", fr: "Custom tier cake" } }] });
    const { rows } = await database.client.query("select event, props from usage_counter");
    expect(rows).toEqual([{ event: "reorder_started", props: "skippedCount=1" }]);
  });

  test("another customer's order or an unknown id: NOT_FOUND; signed out: refused (AC7)", async () => {
    const owner = await insertCustomerAccount(database, auth);
    const other = await insertCustomerAccount(database, auth);
    const order = await placeTestOrder(database, { overrides: { "contact.email": owner.email } });
    const id = await orderIdOf(order.token);
    expect(((await reorderAs(session(other.id), id)) as Envelope).data.error.code).toBe("NOT_FOUND");
    expect(((await reorderAs(session(owner.id), crypto.randomUUID())) as Envelope).data.error.code).toBe("NOT_FOUND");
    expect(((await reorderAs(undefined, id)) as Envelope).init.status).toBe(401);
  });

  test("nothing orderable: the basket cookie is not touched and the note says so (AC4)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const order = await placeTestOrder(database, { overrides: { "contact.email": customer.email } });
    const id = await orderIdOf(order.token);
    await database.client.query("update product set status = 'hidden' where id = (select product_id from order_item where order_id = $1)", [id]);
    const response = (await reorderAs(session(customer.id), id)) as Response;
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("apb_basket="))).toBe(false);
    expect(decodeURIComponent(cookieFrom(cookies.find((c) => c.startsWith("apb_reorder="))!))).toContain('"added":0');
  });
});
