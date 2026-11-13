// S-091 AC8: pipeline step 3 (RL-order and Turnstile) on placeOrder. The count happens inside
// the same CALL as the order (place_order_limited, drizzle/0019): still one round trip. A
// refusal writes nothing but the counter, and the idempotency replay (step 2) wins over both.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BasketLine } from "~/domain/basket";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { RL_ORDER, RL_ORDER_UNVERIFIED } from "~/server/rate-limit.server";
import type { TurnstileCheck, TurnstileVerdict } from "~/server/turnstile.server";
import { type OrderGuard, type PlaceOrderResult, placeOrder } from "./place-order.server";

let database: TestDatabase;
let cakeId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  cakeId = await insertProduct(database.db);
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

/** Tue 2026-11-10 12:00 in Mauritius; Fri 13 is the earliest date with 3 days' notice. */
const NOW = new Date("2026-11-10T08:00:00Z");
const basket = (): BasketLine[] => [{ lineId: "a", productId: cakeId, options: [], quantity: 1 }];

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    intent: "placeOrder",
    idempotencyKey: randomUUID(),
    displayedTotalRs: "850",
    fulfilment: "pickup",
    date: "2026-11-13",
    "windowId.pickup": "afternoon",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
    turnstileToken: "token",
    ...overrides,
  };
}

const turnstile = (verdict: TurnstileVerdict, siteKey: string | null = "site"): TurnstileCheck => ({ siteKey, verify: vi.fn(async () => verdict) });

function place(posted: Record<string, string>, guard: OrderGuard, now = NOW) {
  return placeOrder(posted, { db: database.db, now, locale: "en", basket: basket(), guard });
}

async function count(table: string) {
  return (await database.client.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]!.n;
}

function expectRefused<C extends string>(result: PlaceOrderResult, code: C) {
  if (result.ok) throw new Error(`expected ${code}`);
  expect(result.code).toBe(code);
  return result as Extract<PlaceOrderResult, { code: C }>;
}

async function expectNothingWritten() {
  expect(await count("orders")).toBe(0);
  expect(await count("email_outbox")).toBe(0);
  expect((await database.client.query<{ value: number }>(`select value from counter where name = 'order_number'`)).rows[0]!.value).toBe(0);
}

/** Uses up `n` attempts of the window with refusals that write nothing (an empty name). */
async function spend(n: number, guard: OrderGuard) {
  for (let i = 0; i < n; i += 1) expectRefused(await place(form({ "contact.name": "" }), guard), "VALIDATION_FAILED");
}

describe("RL-order (S-091 AC8; 5 per 10 minutes per IP with a verified token)", () => {
  test("the 5th attempt still places; the 6th is RATE_LIMITED with a retry time and writes nothing", async () => {
    const guard = { ip: "203.0.113.5", turnstile: turnstile("ok") };
    await spend(4, guard);
    expect((await place(form(), guard)).ok).toBe(true);

    // 12:02 Mauritius: the window (12:00-12:10) ends in 8 minutes.
    const refused = expectRefused(await place(form(), guard, new Date(NOW.getTime() + 2 * 60_000)), "RATE_LIMITED");

    expect(refused.retryAfterSeconds).toBe(8 * 60);
    expect(await count("orders")).toBe(1);
    expect(await count("email_outbox")).toBe(1);
  });

  test("another IP has its own count, and the next window starts again", async () => {
    const guard = { ip: "203.0.113.5", turnstile: turnstile("ok") };
    await spend(RL_ORDER.max, guard);
    expectRefused(await place(form(), guard), "RATE_LIMITED");

    expect((await place(form(), { ...guard, ip: "198.51.100.7" })).ok).toBe(true);
    expect((await place(form(), guard, new Date(NOW.getTime() + RL_ORDER.windowMs))).ok).toBe(true);
  });

  test("the bucket key is a hash, never the IP (NFR-004)", async () => {
    await place(form(), { ip: "203.0.113.5", turnstile: turnstile("ok") });
    const { rows } = await database.client.query<{ key: string }>("select key from rate_limit_bucket");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toMatch(/^site\.placeOrder:[0-9a-f]{64}$/);
  });

  test("a replay of an order already placed is answered even when the IP is over the limit (step 2 first)", async () => {
    const guard = { ip: "203.0.113.5", turnstile: turnstile("ok") };
    const first = form();
    const placed = await place(first, guard);
    await spend(RL_ORDER.max - 1, guard);
    expectRefused(await place(form(), guard), "RATE_LIMITED");

    const replay = await place(first, guard);

    expect(replay).toMatchObject({ ok: true, replayed: true, orderNumber: (placed as { orderNumber: string }).orderNumber });
    expect(await count("orders")).toBe(1);
  });
});

test("S-228 AC2: a replay of a placed order is never counted, so refreshing a confirmation uses up nothing", async () => {
  const guard = { ip: "203.0.113.5", turnstile: turnstile("ok") };
  const first = form();
  expect((await place(first, guard)).ok).toBe(true);

  for (let i = 0; i < 10; i += 1) expect(await place(first, guard)).toMatchObject({ ok: true, replayed: true });

  const { rows } = await database.client.query<{ count: number }>("select count from rate_limit_bucket");
  expect(rows).toEqual([{ count: 1 }]);
  expect((await place(form(), guard)).ok).toBe(true);
});

describe("Turnstile (S-091 AC8; never blocks an honest customer whose widget did not load)", () => {
  test("a token Cloudflare refuses is BOT_CHECK_FAILED and writes nothing", async () => {
    const check = turnstile("failed");
    expectRefused(await place(form({ turnstileToken: "forged" }), { ip: "203.0.113.5", turnstile: check }), "BOT_CHECK_FAILED");

    expect(check.verify).toHaveBeenCalledWith("forged", "203.0.113.5");
    await expectNothingWritten();
  });

  test("a double submit whose token was already used gets its order back, not BOT_CHECK_FAILED", async () => {
    const first = form();
    const placed = await place(first, { ip: "203.0.113.5", turnstile: turnstile("ok") });

    const replay = await place(first, { ip: "203.0.113.5", turnstile: turnstile("failed") });

    expect(replay).toMatchObject({ ok: true, replayed: true, orderId: (placed as { orderId: string }).orderId });
  });

  test("no token (no JavaScript, script blocked) places the order under the stricter limit, logged without personal data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const check = turnstile("ok");
    const guard = { ip: "203.0.113.5", turnstile: check };
    await spend(RL_ORDER_UNVERIFIED.max - 1, guard);

    expect((await place(form({ turnstileToken: "" }), guard)).ok).toBe(true);
    expect(check.verify).toHaveBeenCalledTimes(RL_ORDER_UNVERIFIED.max - 1);
    const logged = log.mock.calls.map((c) => String(c[0])).filter((line) => line.includes("place_order_unverified"));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('"reason":"no_token"');
    expect(logged[0]).not.toContain("203.0.113.5");

    expectRefused(await place(form({ turnstileToken: "" }), guard), "RATE_LIMITED");
  });

  test("a Cloudflare outage or a stale token is allowed under the stricter limit", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const guard = { ip: "203.0.113.5", turnstile: turnstile("unverified") };
    for (let i = 0; i < RL_ORDER_UNVERIFIED.max; i += 1) expect((await place(form(), guard)).ok).toBe(true);
    expectRefused(await place(form(), guard), "RATE_LIMITED");
  });

  test("without Turnstile keys every post counts as verified (the integration list warns the Owner)", async () => {
    const guard = { ip: "203.0.113.5", turnstile: turnstile("ok", null) };
    await spend(RL_ORDER.max - 1, guard);
    expect((await place(form({ turnstileToken: "" }), guard)).ok).toBe(true);
  });
});
