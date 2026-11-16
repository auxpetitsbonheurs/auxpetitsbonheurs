// S-320 order discount on `admin/order` (setDiscount, removeDiscount): parsing and field messages,
// any admin, the loader's money lines and `allowed.discount`, the Activity lines, the WhatsApp
// total, the log line without amounts, and anonymous visitors or customers never write one.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { routeArgs } from "~/server/testing/route-context";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { action, loader } from "./order";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah", role: "admin" });
}, 60_000);

afterEach(async () => {
  await database.close();
  vi.restoreAllMocks();
});

type Answer = { ok: true; intent: string; order?: { status: string; version: number } } | { ok: false; intent?: string; error: { code: string; fields?: Record<string, string> } };
const body = (result: unknown): Answer => ((result as { data?: Answer }).data ?? result) as Answer;

/** Rs 1,200 of items + Rs 150 delivery = Rs 1,350, awaiting payment, version 1. */
async function anOrder(status: "awaiting_payment" | "pending_approval" | "approved" | "cancelled" = "awaiting_payment", paid = false) {
  const customerId = await insertTestCustomer(database.db);
  return (await insertTestOrder(database.db, { customerId, status, totalRs: 1350, deliveryFeeRs: 150, fulfilment: "delivery", paid })).id;
}

const post = (id: string, form: Record<string, string>, cookie: string | undefined = session.cookie) =>
  action(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie, form }) as never) as Promise<unknown>;
const load = (id: string) => loader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie }) as never);
const money = async (id: string) => (await database.client.query<Record<string, unknown>>("select total_rs, discount_rs, discount_percent, discount_reason, version from orders where id = $1", [id])).rows[0]!;

async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("setDiscount and removeDiscount (S-320 AC1-AC3)", () => {
  test("an Admin adds Rs 200 with a reason; the loader shows subtotal, discount and total; Activity names her", async () => {
    const id = await anOrder();
    expect(body(await post(id, { intent: "setDiscount", version: "1", kind: "amount", value: "200", reason: " Loyal customer " }))).toEqual({
      ok: true,
      intent: "setDiscount",
      order: { status: "awaiting_payment", version: 2 },
    });
    expect(await money(id)).toEqual({ total_rs: 1150, discount_rs: 200, discount_percent: null, discount_reason: "Loyal customer", version: 2 });
    const page = await load(id);
    expect(page.order.discount).toEqual({ discountRs: 200, percent: null, reason: "Loyal customer", subtotalRs: 1350 });
    expect(page.order.goodsRs).toBe(1200);
    expect(page.allowed.discount).toBe(true);
    const line = page.events.find((event) => event.type === "discount_added")!;
    expect(line.text).toMatch(/^Discount added by Sarah, /);
    expect(line.notes).toEqual(["Discount: Rs 200, Loyal customer", "Total to pay: Rs 1,150"]);
  });

  test("10% of the items (never the delivery fee), typed with a comma-free number; French WhatsApp says it was discounted", async () => {
    const id = await anOrder();
    await database.client.query("update orders set locale = 'fr' where id = $1", [id]);
    await post(id, { intent: "setDiscount", version: "1", kind: "percent", value: "10", reason: "" });
    expect(await money(id)).toMatchObject({ total_rs: 1230, discount_rs: 120, discount_percent: 10, discount_reason: null });
    const payment = (await load(id)).whatsapp.templates?.find((item) => item.key === "payment_instructions");
    expect(decodeURIComponent(payment!.url)).toContain("(après une remise de Rs");
  });

  test.each([
    [{ kind: "amount", value: "1201" }, "value", "Rs 1,200"],
    [{ kind: "amount", value: "12.5" }, "value", "whole number"],
    [{ kind: "percent", value: "150" }, "value", "1 to 100"],
    [{ kind: "amount", value: "100", reason: "x".repeat(81) }, "reason", "80"],
  ])("%o is refused with a %s message (%s) and nothing changes", async (form, field, words) => {
    const id = await anOrder();
    const answer = body(await post(id, { intent: "setDiscount", version: "1", reason: "", ...form }));
    expect(answer).toMatchObject({ ok: false, intent: "setDiscount", error: { code: "VALIDATION_FAILED", fields: { [field]: expect.stringContaining(words) } } });
    expect(await money(id)).toMatchObject({ total_rs: 1350, discount_rs: null, version: 1 });
  });

  test("remove puts the full price back; the log line never carries amounts or the reason", async () => {
    const id = await anOrder();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await post(id, { intent: "setDiscount", version: "1", kind: "amount", value: "321", reason: "Secret reason" });
    expect(body(await post(id, { intent: "removeDiscount", version: "2" }))).toMatchObject({ ok: true, intent: "removeDiscount" });
    expect(await money(id)).toMatchObject({ total_rs: 1350, discount_rs: null });
    const lines = log.mock.calls.map((call) => String(call[0])).filter((text) => text.includes("order_discount_saved"));
    expect(lines.map((text) => JSON.parse(text))).toEqual([
      { level: "info", event: "order_discount_saved", orderId: id, actorRole: "admin", kind: "amount", removed: false },
      { level: "info", event: "order_discount_saved", orderId: id, actorRole: "admin", kind: null, removed: true },
    ]);
    expect(lines.join("")).not.toMatch(/321|Secret/);
  });

  test("a stale page is ORDER_CHANGED", async () => {
    const id = await anOrder();
    await post(id, { intent: "setDiscount", version: "1", kind: "amount", value: "100" });
    expect(body(await post(id, { intent: "setDiscount", version: "1", kind: "amount", value: "50" }))).toMatchObject({ ok: false, error: { code: "ORDER_CHANGED" } });
  });
});

describe("when it can change (S-320 AC4, AC5)", () => {
  test("a paid order shows its discount read-only and refuses a change", async () => {
    const id = await anOrder("approved", true);
    await database.client.query("update orders set discount_rs = 100, total_rs = 1250 where id = $1", [id]);
    const page = await load(id);
    expect(page.allowed.discount).toBe(false);
    expect(page.order.discount).toMatchObject({ discountRs: 100, subtotalRs: 1350 });
    expect(body(await post(id, { intent: "removeDiscount", version: "1" }))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });

  test("a cancelled order takes none", async () => {
    const id = await anOrder("cancelled");
    expect((await load(id)).allowed.discount).toBe(false);
    expect(body(await post(id, { intent: "setDiscount", version: "1", kind: "amount", value: "10" }))).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
  });
});

test("authz: anonymous is sent to sign in and a customer session is FORBIDDEN; nothing changes (S-320 AC1)", async () => {
  const id = await anOrder();
  const account = await insertCustomerAccount(database, session.auth);
  const customerCookie = session.auth.sessionCookie(account.id, new Date("2026-11-09T08:00:00Z"));
  const form = { intent: "setDiscount", version: "1", kind: "amount", value: "10" };
  const args = (cookie?: string) => routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie, form }) as never;
  expect(((await thrown(() => action(args()))) as Response).headers.get("Location")).toContain("/admin/login");
  expect(((await thrown(() => action(args(customerCookie)))) as { init: { status: number } }).init.status).toBe(403);
  expect(await money(id)).toMatchObject({ discount_rs: null, version: 1 });
});
