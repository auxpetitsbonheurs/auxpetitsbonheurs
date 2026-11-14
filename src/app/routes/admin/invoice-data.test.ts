// S-127: GET /admin/orders/:id/invoice.json (admin-only, numbers once) and the printable page.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loader } from "./invoice-data";
import { loader as printLoader } from "./order-invoice";

let database: TestDatabase;
let orderId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  const placed = await placeTestOrder(database);
  const { rows } = await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [placed.token]);
  orderId = rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function get(id: string, session?: { auth: never; cookie: string }) {
  try {
    return (await loader(routeArgs(database, { path: `/admin/orders/${id}/invoice.json`, params: { id }, ...(session ?? {}) }) as never)) as Response;
  } catch (thrown) {
    return thrown as Response;
  }
}

describe("invoice.json (S-127)", () => {
  test.each(["owner", "admin"] as const)("an %s gets the document; the number is taken once and kept", async (role) => {
    const session = (await signedInAdmin(database, { role })) as unknown as { auth: never; cookie: string };

    const first = await get(orderId, session);
    const second = await get(orderId, session);

    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    const body = (await first.json()) as { ok: true; invoice: { number: number; fileName: string; date: string } };
    expect(body.invoice).toMatchObject({ number: 1108, fileName: "Invoice-1108.pdf", date: "2026-11-10" });
    expect(((await second.json()) as typeof body).invoice.number).toBe(1108);
  });

  test("signed out: the sign-in redirect, no data and no number taken", async () => {
    const response = await get(orderId);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/admin/login");
    const { rows } = await database.client.query<{ n: number }>("select next_invoice_number as n from settings");
    expect(rows[0]!.n).toBe(1108);
  });

  test.each([
    ["an unknown order", "7d1f0c9e-1111-4222-8333-944455566677"],
    ["a malformed id", "not-an-id"],
  ])("%s is 404 NOT_FOUND", async (_, id) => {
    const session = (await signedInAdmin(database, { role: "owner" })) as unknown as { auth: never; cookie: string };
    const response = await get(id, session);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("printable invoice (S-127)", () => {
  test("shows the same document and number", async () => {
    const session = await signedInAdmin(database, { role: "admin" });
    const page = await printLoader(routeArgs(database, { path: `/admin/orders/${orderId}/invoice`, params: { id: orderId }, auth: session.auth, cookie: session.cookie }) as never);

    expect(page.invoice.number).toBe(1108);
    expect(page.title).toBe("Invoice 1108");
    expect(page.orderUrl).toBe(`/admin/orders/${orderId}`);
  });
});
