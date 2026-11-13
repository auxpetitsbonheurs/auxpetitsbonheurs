// `admin/today` loader and its advance / Undo actions (S-120 AC1-AC7, S-121 AC1-AC6).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { noStore } from "~/server/response-headers.server";
import { action, loader, middleware } from "./home";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

/** 2026-11-11T20:30Z is Thu 12 Nov 00:30 in Mauritius: today = 12 Nov, tomorrow = 13 Nov. */
const NOW = "2026-11-11T20:30:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function placed(status: string, date = "2026-11-12", overrides: Record<string, string> = {}) {
  const { token } = await placeTestOrder(database, { overrides: { date, ...overrides } });
  const id = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  await database.client.query("update orders set status = $2 where id = $1", [id, status]);
  return id;
}

const load = (as = session) => loader(routeArgs(database, { path: "/admin", auth: as.auth, cookie: as.cookie, now: NOW }) as never);
const post = (form: Record<string, string>) => action(routeArgs(database, { path: "/admin?index", auth: session.auth, cookie: session.cookie, form, now: NOW }) as never) as Promise<unknown>;
const row = async (id: string) => (await database.client.query<Record<string, unknown>>("select status, version from orders where id = $1", [id])).rows[0]!;
const rows = async (q: string, id: string) => (await database.client.query(q, [id])).rows;

type Refusal = { data: { ok: false; error: { code: string } }; init: { status: number } };

describe("Today loader (S-120)", () => {
  test("today and tomorrow are Mauritius dates on the server clock (AC3)", async () => {
    const page = await load();

    expect(page.today.date).toBe("2026-11-12");
    expect(page.tomorrow.date).toBe("2026-11-13");
  });

  test("active orders of today and tomorrow with nextStatus; others and stopped ones are left out (AC2, AC4)", async () => {
    const approved = await placed("approved");
    const pending = await placed("pending_approval");
    await placed("cancelled");
    const tomorrow = await placed("in_preparation", "2026-11-13");
    await placed("approved", "2026-11-14");

    const page = await load();

    expect(page.today.orders.map((o) => [o.id, o.nextStatus])).toEqual(
      expect.arrayContaining([
        [approved, "in_preparation"],
        [pending, null],
      ]),
    );
    expect(page.today.orders).toHaveLength(2);
    expect(page.tomorrow.orders.map((o) => [o.id, o.nextStatus])).toEqual([[tomorrow, "ready_for_pickup"]]);
    expect(page.today.orders[0]).toMatchObject({ number: expect.stringMatching(/^APB-/), itemsPreview: ["1 × Chocolate cake"] });
  });

  test("the tiles count the data (AC1) and the page is never cached (AC6)", async () => {
    await placed("pending_approval");
    await placed("quote_needed");
    await placed("approved");
    await placed("awaiting_payment");

    expect((await load()).counts).toEqual({ toReview: 2, quotesToSend: 1, awaitingPayment: 1, unpaid: 1 });
    expect(middleware).toContain(noStore);
  });

  test("a customer gets no data (AC7)", async () => {
    const customer = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    let thrown: unknown;
    try {
      await loader(routeArgs(database, { path: "/admin", auth: session.auth, cookie, now: NOW }) as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
  });
});

describe("one-tap Next and Undo (S-121)", () => {
  test("Next moves approved to in_preparation with no email; Undo puts it back with status_reverted (AC1, AC2)", async () => {
    const id = await placed("approved");

    expect(await post({ intent: "advance", orderId: id, version: "1" })).toEqual({ ok: true, intent: "advance", orderId: id, order: { status: "in_preparation", version: 2, paid: false } });
    expect(await post({ intent: "revert", orderId: id, version: "2" })).toMatchObject({ ok: true, order: { status: "approved", version: 3 } });
    expect(await rows("select type from order_event where order_id = $1 and type like 'status_%' order by id", id)).toEqual([{ type: "status_advanced" }, { type: "status_reverted" }]);
    expect(await rows("select id from email_outbox where order_id = $1 and template <> 'order_received'", id)).toEqual([]);
  });

  test("Undo after a step that emailed sends no second email; the first stays (AC6)", async () => {
    const id = await placed("in_preparation");

    await post({ intent: "advance", orderId: id, version: "1" });
    await post({ intent: "revert", orderId: id, version: "2" });
    expect((await rows("select template from email_outbox where order_id = $1 and template <> 'order_received'", id)).map((r) => (r as { template: string }).template)).toEqual(["ready_for_pickup"]);
  });

  test("a stale Undo or a double tap is ORDER_CHANGED and never double-advances (AC4, AC5)", async () => {
    const id = await placed("approved");

    const taps = (await Promise.all([post({ intent: "advance", orderId: id, version: "1" }), post({ intent: "advance", orderId: id, version: "1" })])) as (Refusal | { ok: true })[];
    expect(taps.filter((tap) => "ok" in tap && tap.ok)).toHaveLength(1);
    expect(await row(id)).toMatchObject({ status: "in_preparation", version: 2 });
    // Another admin moved it on before Undo.
    await post({ intent: "advance", orderId: id, version: "2" });
    const undo = (await post({ intent: "revert", orderId: id, version: "2" })) as Refusal;
    expect(undo.init.status).toBe(409);
    expect(undo.data.error.code).toBe("ORDER_CHANGED");
    expect(await row(id)).toMatchObject({ status: "ready_for_pickup", version: 3 });
  });

  test("a pending order has no one-tap step: advance is INVALID_TRANSITION (AC3)", async () => {
    const id = await placed("pending_approval");

    expect(((await post({ intent: "advance", orderId: id, version: "1" })) as Refusal).data.error.code).toBe("INVALID_TRANSITION");
  });

  test("a bad order id is VALIDATION_FAILED", async () => {
    expect(((await post({ intent: "advance", orderId: "nope", version: "1" })) as Refusal).init.status).toBe(400);
  });
});
