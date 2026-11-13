// `admin/availability` addBlock / removeBlock (S-057 AC1-AC4, AC6) through the route action.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { action, loader } from "~/routes/admin/availability";
import { signedInAdmin } from "~/server/testing/admin-session";
import { getSiteSettings } from "~/server/repos/settings.server";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Refusal = { data: { ok: false; intent?: string; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };

async function owner() {
  return signedInAdmin(database, { role: "owner" });
}

async function post(form: Record<string, string>) {
  const session = await owner();
  return (await action(routeArgs(database, { path: "/admin/availability", auth: session.auth, cookie: session.cookie, form }) as never)) as unknown;
}

async function page() {
  const session = await owner();
  return loader(routeArgs(database, { path: "/admin/availability", auth: session.auth, cookie: session.cookie }) as never);
}

const blockCount = async () => (await database.client.query<{ n: number }>("select count(*)::int as n from blocked_date")).rows[0]!.n;

describe("S-057 AC1: add a block with a private reason", () => {
  test("a range with a reason is stored and listed with its dates and reason", async () => {
    const answer = await post({ intent: "addBlock", startsOn: "2026-12-24", endsOn: "2027-01-02", reason: "Christmas holidays" });

    expect(answer).toMatchObject({ ok: true, intent: "addBlock", label: "Thu 24 Dec to Sat 2 Jan 2027", existingOrders: [] });
    expect((await page()).blocks).toEqual([{ id: expect.any(String), startsOn: "2026-12-24", endsOn: "2027-01-02", reason: "Christmas holidays", label: "Thu 24 Dec to Sat 2 Jan 2027" }]);
  });
});

describe("S-057 AC2: a range over booked dates", () => {
  test("lists the 2 active orders as a warning, saves the block and leaves the orders as they were", async () => {
    await placeTestOrder(database, { overrides: { date: "2026-11-12" } });
    await placeTestOrder(database, { overrides: { date: "2026-11-13" } });
    const outside = await placeTestOrder(database, { overrides: { date: "2026-11-16" } });
    const cancelled = await placeTestOrder(database, { overrides: { date: "2026-11-13" } });
    await database.client.query("update orders set status = 'cancelled' where tracking_token = $1", [cancelled.token]);
    const before = (await database.client.query("select id, status, version from orders order by number")).rows;

    const answer = await post({ intent: "addBlock", startsOn: "2026-11-12", endsOn: "2026-11-14", reason: "" });

    expect(answer).toMatchObject({
      ok: true,
      existingOrders: [
        { number: "APB-0001", fulfilOn: "2026-11-12", status: "awaiting_payment", dateLabel: "Thu 12 Nov" },
        { number: "APB-0002", fulfilOn: "2026-11-13", status: "awaiting_payment", dateLabel: "Fri 13 Nov" },
      ],
    });
    expect(await blockCount()).toBe(1);
    expect((await database.client.query("select id, status, version from orders order by number")).rows).toEqual(before);
    expect(outside.token).toBeTruthy();
  });
});

describe("S-057 AC3: invalid blocks create nothing", () => {
  test.each([
    [{ startsOn: "2026-12-24", endsOn: "2026-12-23" }, { endsOn: "The last day cannot be before the first day." }],
    [{ startsOn: "", endsOn: "2026-12-23" }, { startsOn: "Enter the first day." }],
    [{ startsOn: "2026-12-24", endsOn: "" }, { endsOn: "Enter the last day." }],
    [{ startsOn: "2026-02-30", endsOn: "2026-03-01" }, { startsOn: "Enter the first day as a date, YYYY-MM-DD." }],
    [{ startsOn: "2026-12-24", endsOn: "2026-12-24", reason: "r".repeat(201) }, { reason: "The reason is too long (200 characters at most)." }],
  ])("%o", async (fields, expected) => {
    const refused = (await post({ intent: "addBlock", reason: "", ...fields })) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data).toMatchObject({ intent: "addBlock", error: { code: "VALIDATION_FAILED", fields: expected } });
    expect(await blockCount()).toBe(0);
  });

  test("a reason of exactly 200 characters is accepted", async () => {
    expect(await post({ intent: "addBlock", startsOn: "2026-12-24", endsOn: "2026-12-24", reason: "r".repeat(200) })).toMatchObject({ ok: true });
  });
});

describe("S-057 AC4: remove a block", () => {
  test("a listed block is deleted; an unknown id is NOT_FOUND; a malformed one VALIDATION_FAILED", async () => {
    await post({ intent: "addBlock", startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "" });
    const [block] = (await page()).blocks;

    expect(await post({ intent: "removeBlock", id: block!.id })).toEqual({ ok: true, intent: "removeBlock", id: block!.id });
    expect(await blockCount()).toBe(0);
    const again = (await post({ intent: "removeBlock", id: block!.id })) as Refusal;
    expect(again.init.status).toBe(404);
    expect(again.data).toMatchObject({ intent: "removeBlock", error: { code: "NOT_FOUND" } });
    expect(((await post({ intent: "removeBlock", id: "nope" })) as Refusal).init.status).toBe(400);
  });
});

describe("S-057 AC6: single days and overlapping blocks", () => {
  test("a single day (start = end) is valid and two overlapping blocks are both kept", async () => {
    expect(await post({ intent: "addBlock", startsOn: "2026-12-25", endsOn: "2026-12-25", reason: "Christmas" })).toMatchObject({ ok: true, label: "Fri 25 Dec" });
    expect(await post({ intent: "addBlock", startsOn: "2026-12-20", endsOn: "2026-12-31", reason: "" })).toMatchObject({ ok: true });

    expect((await page()).blocks.map((b) => [b.startsOn, b.endsOn])).toEqual([
      ["2026-12-20", "2026-12-31"],
      ["2026-12-25", "2026-12-25"],
    ]);
  });
});

describe("S-083: the customer date rules follow a block at once on this isolate", () => {
  test("adding and removing a block refreshes the cached Settings", async () => {
    expect((await getSiteSettings(database.db)).availability.blocked).toEqual([]);

    await post({ intent: "addBlock", startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "Christmas holidays" });
    const { blocked } = (await getSiteSettings(database.db)).availability;
    expect(blocked).toEqual([{ startsOn: "2026-12-24", endsOn: "2026-12-26" }]);

    const [row] = (await database.client.query<{ id: string }>("select id from blocked_date")).rows;
    await post({ intent: "removeBlock", id: row!.id });
    expect((await getSiteSettings(database.db)).availability.blocked).toEqual([]);
  });
});
