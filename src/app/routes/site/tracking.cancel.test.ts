// Tracking page: what the loader offers (S-094 AC1, AC4, AC6; S-095 AC1, AC2; S-096 AC1, AC3,
// AC9) and the `cancel` action (S-096 AC1-AC5, AC7), against PGlite with real migrations.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./tracking";

let database: TestDatabase;
let token: string;

const NOW = "2026-11-06T09:30:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  ({ token } = await placeTestOrder(database, { overrides: DELIVERY_ORDER, quantity: 2 }));
  // A placeholder number (never a real contact).
  await database.client.query("update settings set contact_whatsapp = '+230 5700 0000'");
  // Pending approval: the approval step the cancel cases are written against (awaiting payment is covered in the service test).
  await database.client.query("update orders set status = 'pending_approval'");
}, 60_000);

afterEach(async () => {
  await database.close();
});

type TrackingData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;

const load = async (path = `/t/${token}`, headers: Record<string, string> = {}) =>
  (await loader(routeArgs(database, { path, params: { token: path.split("/t/")[1]! }, now: NOW, headers }) as never)) as TrackingData;

const post = (form: Record<string, string>, path = `/t/${token}`, headers: Record<string, string> = {}) =>
  action(routeArgs(database, { path, params: { token: path.split("/t/")[1]! }, form, now: NOW, headers }) as never) as Promise<unknown>;

const setOrder = (assignments: string) => database.client.query(`update orders set ${assignments} where tracking_token = $1`, [token]);

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error("expected a thrown response");
    },
    (error: unknown) => error,
  );
}

const body = (result: unknown) => (result as { data: { ok: boolean; error?: { code: string } } }).data;
const status = (result: unknown) => (result as { init?: { status?: number } }).init?.status;

describe("WhatsApp and cancel offers in the loader (S-094 AC1, S-096 AC1, AC3, AC9)", () => {
  test("a pending order can be cancelled and has a WhatsApp link prefilled with its number", async () => {
    const data = await load();

    expect(data.canCancel).toBe(true);
    expect(data.whatsappUrl).toBe(`https://wa.me/23057000000?text=${encodeURIComponent("Hello, about my order APB-0001")}`);
  });

  test("the French page prefills the WhatsApp message in French", async () => {
    await setOrder("locale = 'fr'");
    const data = await load(`/fr/t/${token}`);

    expect(data.whatsappUrl).toContain(encodeURIComponent("Bonjour, au sujet de ma commande APB-0001"));
  });

  test.each(["approved", "in_preparation", "out_for_delivery", "completed", "declined", "cancelled", "closed"])("%s cannot be cancelled", async (state) => {
    await setOrder(`status = '${state}'`);

    expect((await load()).canCancel).toBe(false);
  });

  test("a paid pending order cannot be cancelled from the page (refund goes through the bakery)", async () => {
    await setOrder("paid = true, paid_at = now()");

    expect((await load()).canCancel).toBe(false);
  });

  test("no WhatsApp number in Settings: no link", async () => {
    await database.client.query("update settings set contact_whatsapp = null");

    expect((await load()).whatsappUrl).toBeNull();
  });

  test("the data offers no edit action and carries no admin note (S-094 AC6, S-096 AC9)", async () => {
    await setOrder("admin_note = 'Customer was rude on the phone'");
    const data = await load();

    expect(JSON.stringify(data)).not.toContain("rude");
    expect(Object.keys(data).filter((k) => /edit/i.test(k))).toEqual([]);
  });
});

describe("final states and the quote path (S-095 AC1, AC2, AC4)", () => {
  test("a declined order has no progress and carries the reason given to the customer", async () => {
    await setOrder("status = 'declined', decline_reason = 'Fully booked <b>that day</b>'");
    const data = await load();

    expect(data.progress).toBeNull();
    expect(data.order).toMatchObject({ status: "declined", declineReason: "Fully booked <b>that day</b>" });
  });

  test("a custom request in quote needed is step 1 of the quote path", async () => {
    await setOrder("source = 'custom_request', status = 'quote_needed'");
    const data = await load();

    expect(data.progress).toEqual({ steps: ["quote_needed", "quote_sent", "awaiting_payment", "approved", "in_preparation", "out_for_delivery", "completed"], current: 0 });
    expect(data.canCancel).toBe(true);
  });
});

describe("RL-track (S-094 AC4)", () => {
  test("the 61st request from one IP within 10 minutes is RATE_LIMITED with Retry-After; another IP is not", async () => {
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    for (let i = 0; i < 60; i += 1) await load(`/t/${token}`, ip);

    const limited = await rejection(load(`/t/${token}`, ip));
    expect(status(limited)).toBe(429);
    expect((limited as { init: { headers: Record<string, string> } }).init.headers["Retry-After"]).toMatch(/^\d+$/);
    expect((await load(`/t/${token}`, { "cf-connecting-ip": "203.0.113.8" })).order.number).toBe("APB-0001");
  });

  test("unknown tokens count too, so guessing is limited the same way", async () => {
    const ip = { "cf-connecting-ip": "203.0.113.9" };
    const unknown = "Z".repeat(43);
    for (let i = 0; i < 60; i += 1) await rejection(load(`/t/${unknown}`, ip));

    expect(status(await rejection(load(`/t/${unknown}`, ip)))).toBe(429);
  });
});

describe("cancel (S-096)", () => {
  test("AC1: confirming cancels the order and redirects back to the page, which shows Cancelled", async () => {
    const result = await post({ intent: "cancel", version: "1" });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe(`/t/${token}?cancelled=1`);
    const data = await load();
    expect(data.order.status).toBe("cancelled");
    expect(data.canCancel).toBe(false);
  });

  test("the French page redirects to the French page", async () => {
    const result = (await post({ intent: "cancel", version: "1" }, `/fr/t/${token}`)) as Response;

    expect(result.headers.get("Location")).toBe(`/fr/t/${token}?cancelled=1`);
  });

  test("AC3: a forged cancel on an approved order is CANCEL_NOT_ALLOWED and changes nothing", async () => {
    await setOrder("status = 'approved', version = 2");

    const result = await post({ intent: "cancel", version: "2" });
    expect(status(result)).toBe(409);
    expect(body(result).error?.code).toBe("CANCEL_NOT_ALLOWED");
    expect((await load()).order.status).toBe("approved");
  });

  test("AC4: a stale version on a still pending order is ORDER_CHANGED", async () => {
    await setOrder("version = 2");

    const result = await post({ intent: "cancel", version: "1" });
    expect(body(result).error?.code).toBe("ORDER_CHANGED");
    expect((await load()).order.status).toBe("pending_approval");
  });

  test("AC5: a second cancel is CANCEL_NOT_ALLOWED", async () => {
    await post({ intent: "cancel", version: "1" });

    expect(body(await post({ intent: "cancel", version: "2" })).error?.code).toBe("CANCEL_NOT_ALLOWED");
  });

  test("AC7: an unknown or malformed token gets the same 404 and nothing changes", async () => {
    const unknown = "Z".repeat(43);
    expect(status(await rejection(post({ intent: "cancel", version: "1" }, `/t/${unknown}`)))).toBe(404);
    expect(status(await rejection(post({ intent: "cancel", version: "1" }, "/t/short")))).toBe(404);
    expect((await load()).order.status).toBe("pending_approval");
  });

  test("a missing or invalid version, or an unknown intent, is VALIDATION_FAILED", async () => {
    expect(body(await post({ intent: "cancel" })).error?.code).toBe("VALIDATION_FAILED");
    expect(body(await post({ intent: "cancel", version: "zero" })).error?.code).toBe("VALIDATION_FAILED");
    expect(body(await post({ intent: "edit", version: "1" })).error?.code).toBe("VALIDATION_FAILED");
    expect((await load()).order.status).toBe("pending_approval");
  });
});
