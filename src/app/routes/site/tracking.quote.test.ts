// Tracking page for a custom request (E-08 S-158, S-159, S-160 AC7, S-161 AC2): the quote the
// loader shows and the acceptQuote / declineQuote actions, against PGlite with real migrations.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { sendQuote } from "~/server/services/quotes.server";
import { insertAdmin } from "~/server/testing/admins";
import { submitTestRequest } from "~/server/testing/custom-requests";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./tracking";

let database: TestDatabase;
let token: string;
let orderId: string;
let adminId: string;

/** Thu 12 Nov 10:00 MU. */
const NOW = "2026-11-12T06:00:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth())).id;
  ({ trackingToken: token, orderId } = await submitTestRequest(database));
}, 60_000);

afterEach(async () => {
  await database.close();
});

type TrackingData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;
const load = async (now = NOW, path = `/t/${token}`) => (await loader(routeArgs(database, { path, params: { token }, now }) as never)) as TrackingData;
const post = (form: Record<string, string>, now = NOW) => action(routeArgs(database, { path: `/t/${token}`, params: { token }, form, now }) as never) as Promise<unknown>;
const quote = (amountRs = 4500, expiresOn = "2026-11-15", version = 1) =>
  sendQuote(database.db as unknown as Database, { orderId, version, adminId, amountRs, note: "Two tiers, gold leaf", expiresOn, now: new Date("2026-11-10T08:00:00Z") });
const statusOf = async () => (await database.client.query<{ status: string }>("select status from orders")).rows[0]!.status;
const errorCode = (result: unknown) => (result as { data: { error: { code: string } } }).data.error.code;

describe("the quote on the tracking page (S-158 AC2)", () => {
  test("Quote needed: no quote yet, the request waits; no items block", async () => {
    const data = await load();
    expect(data).toMatchObject({ isRequest: true, quote: null, order: { status: "quote_needed" } });
  });

  test("Quote sent: amount, note and 'Valid until' in the page language, answerable; GET changes nothing", async () => {
    await quote();
    const data = await load(NOW, `/fr/t/${token}`);
    expect(data.quote).toEqual({ amountRs: 4500, note: "Two tiers, gold leaf", expiresLabel: expect.stringMatching(/15 novembre 2026/), canRespond: true, expired: false });
    expect(await statusOf()).toBe("quote_sent");
  });

  test("AC3: the day after expiry the page says expired and offers no answer; Accept is QUOTE_EXPIRED", async () => {
    await quote(4500, "2026-11-11");
    expect((await load()).quote).toMatchObject({ canRespond: false, expired: true });
    expect(errorCode(await post({ intent: "acceptQuote", version: "2" }))).toBe("QUOTE_EXPIRED");
    expect(await statusOf()).toBe("quote_sent");
  });
});

describe("acceptQuote and declineQuote (S-158, S-159)", () => {
  test("S-158 AC1: Accept moves to Awaiting payment and redirects back; the page then shows the Juice payment", async () => {
    await quote();

    const response = (await post({ intent: "acceptQuote", version: "2" })) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/t/${token}?accepted=1`);
    const data = await load(NOW, `/t/${token}?accepted=1`);
    expect(data).toMatchObject({ justAccepted: true, order: { status: "awaiting_payment" } });
    expect(data.payment).not.toBeNull();
    expect(data.quote).toMatchObject({ canRespond: false });
  });

  test("S-158 AC5: a second Accept is INVALID_TRANSITION; the page shows no buttons", async () => {
    await quote();
    await post({ intent: "acceptQuote", version: "2" });
    expect(errorCode(await post({ intent: "acceptQuote", version: "3" }))).toBe("INVALID_TRANSITION");
  });

  test("S-158 AC7, S-161 AC2: after a re-quote the old page's Accept is ORDER_CHANGED; the page shows the new amount", async () => {
    await quote(4500);
    await quote(5200, "2026-11-15", 2);
    expect(errorCode(await post({ intent: "acceptQuote", version: "2" }))).toBe("ORDER_CHANGED");
    expect((await load()).quote?.amountRs).toBe(5200);
  });

  test("S-158 AC8: a malformed token is a 404 before any database read", async () => {
    await expect(action(routeArgs(database, { path: "/t/short", params: { token: "short" }, form: { intent: "acceptQuote", version: "2" }, now: NOW }) as never)).rejects.toMatchObject({ init: { status: 404 } });
  });

  test("S-159 AC1, S-160 AC7: Decline closes the request; the page shows Closed and no buttons", async () => {
    await quote();
    const response = (await post({ intent: "declineQuote", version: "2" })) as Response;
    expect(response.headers.get("Location")).toBe(`/t/${token}?declined=1`);
    expect(await statusOf()).toBe("closed");
    expect((await load()).quote).toMatchObject({ canRespond: false, expired: false });
  });

  test("S-159 AC3: a stale version is ORDER_CHANGED", async () => {
    await quote();
    expect(errorCode(await post({ intent: "declineQuote", version: "1" }))).toBe("ORDER_CHANGED");
  });
});
