// S-318 "Cost to make" (`admin/order` saveCost) and "Cost to run" (`admin/workshop` saveCost):
// validation on the server, any admin and any status, the Activity line, never a version bump,
// and anonymous visitors or customers never write a cost.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { routeArgs } from "~/server/testing/route-context";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { insertWorkshopEvent } from "~/server/testing/workshops";
import { action, loader } from "./order";
import { action as eventAction, loader as eventLoader } from "./workshop";

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

type Answer = { ok: true; intent: string; costRs: number | null } | { ok: false; intent?: string; error: { code: string; fields?: Record<string, string> } };
const body = (result: unknown): Answer => ((result as { data?: Answer }).data ?? result) as Answer;

async function anOrder(status: "completed" | "cancelled" | "pending_approval" = "completed") {
  const customerId = await insertTestCustomer(database.db);
  return (await insertTestOrder(database.db, { customerId, status, totalRs: 2000 })).id;
}

const post = (id: string, form: Record<string, string>, cookie = session.cookie) =>
  action(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie, form }) as never) as Promise<unknown>;
const load = (id: string) => loader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie }) as never);
const orderRow = async (id: string) => (await database.client.query<{ cost_rs: number | null; version: number }>("select cost_rs, version from orders where id = $1", [id])).rows[0]!;

async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("Cost to make on an order (S-318 AC1-AC4)", () => {
  test("AC1, AC2: an Admin (not only the Owner) saves a cost; the loader shows it and the version is untouched", async () => {
    const id = await anOrder();
    expect(body(await post(id, { intent: "saveCost", costRs: "1,250" }))).toEqual({ ok: true, intent: "saveCost", costRs: 1250 });
    expect(await orderRow(id)).toEqual({ cost_rs: 1250, version: 1 });
    expect((await load(id)).order.costRs).toBe(1250);
  });

  test.each(["completed", "cancelled", "pending_approval"] as const)("AC2: a %s order takes a cost too (any status)", async (status) => {
    const id = await anOrder(status);
    expect(body(await post(id, { intent: "saveCost", costRs: "0" }))).toMatchObject({ ok: true, costRs: 0 });
  });

  test("AC3: empty clears the cost", async () => {
    const id = await anOrder();
    await post(id, { intent: "saveCost", costRs: "900" });
    expect(body(await post(id, { intent: "saveCost", costRs: "" }))).toEqual({ ok: true, intent: "saveCost", costRs: null });
    expect((await orderRow(id)).cost_rs).toBeNull();
  });

  test.each(["-5", "12.5", "1000001", "abc"])("AC3: %s is refused with a field message and nothing changes", async (costRs) => {
    const id = await anOrder();
    await post(id, { intent: "saveCost", costRs: "300" });
    const answer = body(await post(id, { intent: "saveCost", costRs }));
    expect(answer).toMatchObject({ ok: false, intent: "saveCost", error: { code: "VALIDATION_FAILED", fields: { costRs: expect.stringContaining("1,000,000") } } });
    expect((await orderRow(id)).cost_rs).toBe(300);
  });

  test("AC4: a change is logged in Activity with the old and new amounts; the same value again logs nothing", async () => {
    const id = await anOrder();
    await post(id, { intent: "saveCost", costRs: "500" });
    await post(id, { intent: "saveCost", costRs: "500" });
    await post(id, { intent: "saveCost", costRs: "650" });
    await post(id, { intent: "saveCost", costRs: "" });
    const lines = (await load(id)).events.filter((event) => event.type === "cost_changed");
    expect(lines.map((line) => line.notes)).toEqual([["Cost: none → Rs 500"], ["Cost: Rs 500 → Rs 650"], ["Cost: Rs 650 → none"]]);
    expect(lines[0]!.text).toMatch(/^Cost to make changed by Sarah, /);
  });

  test("the log line names the order and role, never the amount", async () => {
    const id = await anOrder();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await post(id, { intent: "saveCost", costRs: "777" });
    const line = log.mock.calls.map((call) => String(call[0])).find((text) => text.includes("order_cost_saved"))!;
    expect(JSON.parse(line)).toEqual({ level: "info", event: "order_cost_saved", orderId: id, actorRole: "admin", cleared: false });
    expect(line).not.toContain("777");
  });

  test("an unknown order is NOT_FOUND", async () => {
    expect(body(await post("7d1f0c9e-1111-4222-8333-944455566677", { intent: "saveCost", costRs: "5" }))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  test("authz: anonymous is sent to sign in and a customer session is FORBIDDEN; the cost stays empty", async () => {
    const id = await anOrder();
    const account = await insertCustomerAccount(database, session.auth);
    const customerCookie = session.auth.sessionCookie(account.id, new Date("2026-11-09T08:00:00Z"));
    const args = (cookie?: string) => routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie, form: { intent: "saveCost", costRs: "10" } }) as never;
    expect(((await thrown(() => action(args()))) as Response).headers.get("Location")).toContain("/admin/login");
    expect(((await thrown(() => action(args(customerCookie)))) as { init: { status: number } }).init.status).toBe(403);
    expect((await orderRow(id)).cost_rs).toBeNull();
  });
});

describe("Cost to run on a workshop event (S-318 AC8)", () => {
  const postEvent = (id: string, form: Record<string, string>, cookie: string | undefined = session.cookie) =>
    eventAction(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie, form }) as never) as Promise<unknown>;
  const eventRow = async (id: string) => (await database.client.query<{ cost_rs: number | null; version: number }>("select cost_rs, version from workshop_event where id = $1", [id])).rows[0]!;

  test.each(["published", "completed", "cancelled", "draft"] as const)("an Admin sets the cost of a %s event; no version change", async (status) => {
    const id = await insertWorkshopEvent(database, { status });
    expect(body(await postEvent(id, { intent: "saveCost", costRs: "4 500" }))).toEqual({ ok: true, intent: "saveCost", costRs: 4500 });
    expect(await eventRow(id)).toEqual({ cost_rs: 4500, version: 1 });
    const page = await eventLoader(routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie: session.cookie }) as never);
    expect(page.event?.costRs).toBe(4500);
  });

  test("validation: over 1,000,000 is refused; empty clears", async () => {
    const id = await insertWorkshopEvent(database, { costRs: 100 });
    expect(body(await postEvent(id, { intent: "saveCost", costRs: "2000000" }))).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", fields: { costRs: expect.any(String) } } });
    expect((await eventRow(id)).cost_rs).toBe(100);
    expect(body(await postEvent(id, { intent: "saveCost", costRs: "" }))).toMatchObject({ ok: true, costRs: null });
    expect((await eventRow(id)).cost_rs).toBeNull();
  });

  test("authz: anonymous is sent to sign in, a customer is FORBIDDEN", async () => {
    const id = await insertWorkshopEvent(database);
    const account = await insertCustomerAccount(database, session.auth);
    const customerCookie = session.auth.sessionCookie(account.id, new Date("2026-11-09T08:00:00Z"));
    const args = (cookie?: string) => routeArgs(database, { path: `/admin/workshops/${id}`, params: { id }, auth: session.auth, cookie, form: { intent: "saveCost", costRs: "10" } }) as never;
    expect(((await thrown(() => eventAction(args()))) as Response).headers.get("Location")).toContain("/admin/login");
    expect(((await thrown(() => eventAction(args(customerCookie)))) as { init: { status: number } }).init.status).toBe(403);
    expect((await eventRow(id)).cost_rs).toBeNull();
  });
});
