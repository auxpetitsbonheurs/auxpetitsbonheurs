// `admin/orders` loader, tab review (S-017 AC1) and who may use the admin order screens (AC7).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action as orderAction } from "./order";
import { loader } from "./orders";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function idOf(token: string) {
  return (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
}

async function caught(run: () => unknown): Promise<Response> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a thrown response");
}

/** An order still on the approval path (placed before Juice payment, 2026-11-13). */
async function placePending(options: Parameters<typeof placeTestOrder>[1] = {}) {
  const placed = await placeTestOrder(database, options);
  await database.client.query("update orders set status = 'pending_approval' where tracking_token = $1", [placed.token]);
  return placed;
}

describe("orders to review (S-017 AC1)", () => {
  test("lists pending orders oldest first (the longest wait first) with number, name, date, window, total and source", async () => {
    const session = await signedInAdmin(database);
    await placePending({ overrides: { "contact.name": "First" } });
    await placePending({ overrides: { ...DELIVERY_ORDER, displayedTotalRs: "1050", "contact.name": "Second" } });
    const approvedToken = (await placePending({ overrides: { "contact.name": "Approved already" } })).token;
    await database.client.query("update orders set status = 'approved' where tracking_token = $1", [approvedToken]);

    const page = await loader(routeArgs(database, { path: "/admin/orders?tab=review", auth: session.auth, cookie: session.cookie }) as never);

    expect(page.data.map((o) => o.contactName)).toEqual(["First", "Second"]);
    expect(page.data[1]).toMatchObject({
      number: "APB-0002",
      status: "pending_approval",
      source: "website",
      fulfilment: "delivery",
      fulfilOn: "2026-11-12",
      dateLabel: "Thu 12 Nov",
      window: { id: "morning", start: "09:00", end: "12:00" },
      totalRs: 1050,
      paid: false,
      version: 1,
      itemsPreview: ["1 × Chocolate cake"],
    });
    expect(page.nextCursor).toBeNull();
  });

  test("30 per page, then the cursor gives the rest without overlap", async () => {
    const session = await signedInAdmin(database);
    for (let i = 0; i < 31; i += 1) await placePending();
    const args = (path: string) => routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never;

    const first = await loader(args("/admin/orders?tab=review"));
    expect(first.data).toHaveLength(30);
    expect(first.data[0]!.number).toBe("APB-0001");
    expect(first.data.at(-1)!.number).toBe("APB-0030");
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await loader(args(`/admin/orders?tab=review&cursor=${encodeURIComponent(first.nextCursor!)}`));
    expect(second.data.map((o) => o.number)).toEqual(["APB-0031"]);
    expect(second.nextCursor).toBeNull();
  }, 120_000);

  test("limit is capped at 100 and a broken cursor starts from the top", async () => {
    const session = await signedInAdmin(database);
    await placePending();
    const args = (path: string) => routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never;

    expect((await loader(args("/admin/orders?tab=review&cursor=%3Cscript%3E"))).data).toHaveLength(1);
    expect((await loader(args("/admin/orders?tab=review&limit=1000"))).limit).toBe(100);
    expect((await loader(args("/admin/orders?tab=review&limit=-3"))).limit).toBe(30);
  });

  test("no pending orders gives an empty list (the page says \"No orders to review.\")", async () => {
    const session = await signedInAdmin(database);

    const page = await loader(routeArgs(database, { path: "/admin/orders?tab=review", auth: session.auth, cookie: session.cookie }) as never);

    expect(page).toMatchObject({ data: [], nextCursor: null });
  });

  test("an unknown or missing tab goes to the review tab", async () => {
    const session = await signedInAdmin(database);

    for (const path of ["/admin/orders", "/admin/orders?tab=upcoming"]) {
      const response = await caught(() => loader(routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never));
      expect(response.headers.get("Location")).toBe("/admin/orders?tab=review");
    }
  });
});

describe("who may see and approve (S-017 AC7)", () => {
  test("an anonymous visitor and a customer get no order data; approve redirects them or is FORBIDDEN (S-021 AC3)", async () => {
    const { token } = await placePending();
    const id = await idOf(token);
    const session = await signedInAdmin(database);
    const customer = await insertCustomerAccount(database, session.auth);
    const customerCookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    for (const cookie of [undefined, customerCookie]) {
      const list = await caught(() => loader(routeArgs(database, { path: "/admin/orders?tab=review", auth: session.auth, cookie }) as never));
      expect(list.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Forders%3Ftab%3Dreview");
      expect(await list.text()).toBe("");
      let post: unknown;
      try {
        await orderAction(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie, form: { intent: "approve", version: "1" } }) as never);
      } catch (error) {
        post = error;
      }
      if (cookie) {
        expect((post as { init: { status: number } }).init.status).toBe(403);
      } else {
        expect((post as Response).headers.get("Location")).toBe(`/admin/login?next=${encodeURIComponent(`/admin/orders/${id}`)}`);
      }
    }
    expect((await database.client.query("select status from orders where id = $1", [id])).rows).toEqual([{ status: "pending_approval" }]);
  });

  test.each(["owner", "admin"] as const)("an %s may approve", async (role) => {
    const { token } = await placePending();
    const id = await idOf(token);
    const session = await signedInAdmin(database, { role });

    const result = await orderAction(
      routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form: { intent: "approve", version: "1" } }) as never,
    );

    expect(result).toMatchObject({ ok: true, order: { status: "approved", version: 2 } });
  });

  test("an unknown order id is NOT_FOUND (404)", async () => {
    const session = await signedInAdmin(database);
    const id = "7d1f0c9e-1111-4222-8333-944455566677";

    const result = (await orderAction(
      routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form: { intent: "approve", version: "1" } }) as never,
    )) as { data: { error: { code: string } }; init: { status: number } };

    expect(result.init.status).toBe(404);
    expect(result.data.error.code).toBe("NOT_FOUND");
  });
});

describe("orders awaiting payment (S-279 AC1, S-280 AC5, S-281 AC2)", () => {
  // Placed at TEST_ORDER_PLACED_AT (5 Nov 08:00Z); the page is read 12 h later.
  const READ_AT = "2026-11-05T20:00:00Z";
  const paymentTab = (session: Awaited<ReturnType<typeof signedInAdmin>>, now = READ_AT) =>
    loader(routeArgs(database, { path: "/admin/orders?tab=payment", auth: session.auth, cookie: session.cookie, now }) as never);

  test("lists them oldest first with a time-left badge; paid and pending orders are not in it", async () => {
    const session = await signedInAdmin(database);
    await placeTestOrder(database, { overrides: { "contact.name": "First" } });
    await placeTestOrder(database, { overrides: { "contact.name": "Second" } });
    await placePending({ overrides: { "contact.name": "Old flow" } });
    const paid = await placeTestOrder(database, { overrides: { "contact.name": "Paid" } });
    await database.client.query("update orders set status = 'approved', paid = true where tracking_token = $1", [paid.token]);

    const page = await paymentTab(session);

    expect(page.tab).toBe("payment");
    expect(page.payment!.awaiting.map((o) => [o.contactName, o.timeLeft])).toEqual([
      ["First", "12 h left"],
      ["Second", "12 h left"],
    ]);
    expect(page.payment!.awaiting[0]).toMatchObject({ number: "APB-0001", totalRs: 850, overdue: false });
  });

  test("minutes in the last hour, then Cancelling soon once overdue", async () => {
    const session = await signedInAdmin(database);
    await placeTestOrder(database);

    expect((await paymentTab(session, "2026-11-06T07:15:00Z")).payment!.awaiting[0]!.timeLeft).toBe("45 min left");
    expect((await paymentTab(session, "2026-11-06T08:30:00Z")).payment!.awaiting[0]).toMatchObject({ timeLeft: "Cancelling soon", overdue: true });
  });

  test("refunds to send and recent unpaid cancellations have their own lists", async () => {
    const session = await signedInAdmin(database);
    const refused = await placeTestOrder(database, { overrides: { "contact.name": "Refused" } });
    const unpaid = await placeTestOrder(database, { overrides: { "contact.name": "Unpaid" } });
    await database.client.query("update orders set status = 'declined', paid = true, refund_due_rs = 850 where tracking_token = $1", [refused.token]);
    await database.client.query("update orders set status = 'cancelled', cancel_reason = 'unpaid', updated_at = '2026-11-05T19:00:00Z' where tracking_token = $1", [unpaid.token]);

    const page = await paymentTab(session);

    expect(page.payment!.refunds.map((o) => [o.contactName, o.refundDueRs])).toEqual([["Refused", 850]]);
    expect(page.payment!.cancelled.map((o) => o.contactName)).toEqual(["Unpaid"]);
    expect(page.payment!.awaiting).toEqual([]);
  });

  test("warns when the payment details are missing; the Owner gets the Settings link, an Admin is told to ask (S-277 AC5)", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });
    expect(await paymentTab(owner)).toMatchObject({ paymentMissing: true, canEditSettings: true });

    await database.client.query("update settings set juice_name = 'A. Baker', juice_number = '5000 0001', payment_whatsapp = '5000 0002'");
    expect(await paymentTab(owner)).toMatchObject({ paymentMissing: false });
  });

  test("an Admin sees the warning without the Settings link", async () => {
    const admin = await signedInAdmin(database, { role: "admin" });

    expect(await paymentTab(admin)).toMatchObject({ paymentMissing: true, canEditSettings: false });
  });
});

describe("Payment received, Refuse and Refunded from the order screen (S-279 AC2, S-281)", () => {
  const post = async (id: string, form: Record<string, string>) => {
    const session = await signedInAdmin(database);
    return orderAction(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form }) as never);
  };

  test("markPaid then undoPaid answer the new status and version", async () => {
    const id = await idOf((await placeTestOrder(database)).token);

    expect(await post(id, { intent: "markPaid", version: "1" })).toMatchObject({ ok: true, intent: "markPaid", order: { status: "approved", version: 2 } });
    expect(await post(id, { intent: "undoPaid", version: "2" })).toMatchObject({ ok: true, intent: "undoPaid", order: { status: "awaiting_payment", version: 3 } });
  });

  test("decline takes an optional reason of 500 characters at most", async () => {
    const id = await idOf((await placeTestOrder(database)).token);

    const tooLong = (await post(id, { intent: "decline", version: "1", reason: "x".repeat(501) })) as { data: { error: { code: string } } };
    expect(tooLong.data.error.code).toBe("VALIDATION_FAILED");
    expect(await post(id, { intent: "decline", version: "1", reason: "  Full that day.  " })).toMatchObject({ ok: true, intent: "decline" });
    expect((await database.client.query("select decline_reason from orders where id = $1", [id])).rows).toEqual([{ decline_reason: "Full that day." }]);
  });

  test("markRefunded on an order without a refund due is INVALID_TRANSITION (409)", async () => {
    const id = await idOf((await placeTestOrder(database)).token);

    const result = (await post(id, { intent: "markRefunded", version: "1" })) as { data: { error: { code: string } }; init: { status: number } };
    expect(result.init.status).toBe(409);
    expect(result.data.error.code).toBe("INVALID_TRANSITION");
  });

  test("an unknown intent is VALIDATION_FAILED", async () => {
    const id = await idOf((await placeTestOrder(database)).token);

    const result = (await post(id, { intent: "explode", version: "1" })) as { data: { error: { code: string } } };
    expect(result.data.error.code).toBe("VALIDATION_FAILED");
  });
});
