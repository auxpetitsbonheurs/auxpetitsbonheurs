// `admin/calendar` loader and blockDay / unblockDay (S-136, S-137, S-138).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { loader as menuLoader } from "~/routes/hooks/menu";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { siteSettingsCache } from "~/server/repos/settings.server";
import { action, loader } from "./calendar";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

/** Sat 14 Nov 2026, 10:00 in Mauritius. */
const NOW = "2026-11-14T06:00:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
  siteSettingsCache.clear();
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function placed(status: string, date: string, overrides: Record<string, string> = {}) {
  const { token } = await placeTestOrder(database, { overrides: { date, ...overrides } });
  const id = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  await database.client.query("update orders set status = $2 where id = $1", [id, status]);
  return id;
}

const delivery = { fulfilment: "delivery", address: "12 Royal Road, Rose Hill", "windowId.delivery": "morning", displayedTotalRs: "1050" };

type LoaderData = Awaited<ReturnType<typeof loader>>;
const load = (query = "", as = session): Promise<LoaderData> => loader(routeArgs(database, { path: `/admin/calendar${query}`, auth: as.auth, cookie: as.cookie, now: NOW }) as never);
const post = (form: Record<string, string>, as = session) => action(routeArgs(database, { path: "/admin/calendar", auth: as.auth, cookie: as.cookie, form, now: NOW }) as never) as Promise<unknown>;
const day = (page: LoaderData, date: string) => page.days.find((d) => d.date === date)!;
const blocks = async () => (await database.client.query<{ starts_on: string; ends_on: string; reason: string | null }>("select to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on, reason from blocked_date order by starts_on")).rows;

type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> }; details?: { reason: string } }; init: { status: number } };

async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("month view (S-136)", () => {
  test("counts active orders per day split by fulfilment; stopped ones are left out, pending counts (AC1, AC2)", async () => {
    await placed("approved", "2026-12-12");
    await placed("approved", "2026-12-12");
    await placed("approved", "2026-12-12", delivery);
    await placed("pending_approval", "2026-12-12");
    await placed("cancelled", "2026-12-12");
    await placed("declined", "2026-12-12");
    await placed("closed", "2026-12-12");

    const page = await load("?month=2026-12");

    expect(day(page, "2026-12-12")).toMatchObject({ pickup: 3, delivery: 1, blocked: false, closedDay: false, dayMonth: "12 Dec" });
    expect(page.weeks).toHaveLength(5);
    expect(page.weeks[0]![0]).toBe("2026-11-30");
    expect(page.list).toEqual([]);
  });

  test("a blocked day keeps its count and carries kind and private reason; a closed weekday is not a block (AC3, AC4)", async () => {
    await placed("approved", "2026-12-12");
    await database.client.query("insert into blocked_date (starts_on, ends_on, reason) values ('2026-12-12', '2026-12-12', 'Family event'), ('2026-12-20', '2026-12-27', null)");
    await database.client.query("update settings set closed_weekdays = '{7}'");

    const page = await load("?month=2026-12");

    expect(day(page, "2026-12-12")).toMatchObject({ pickup: 1, blocked: true, blockKind: "single", blockReason: "Family event" });
    expect(day(page, "2026-12-22")).toMatchObject({ blocked: true, blockKind: "range" });
    expect(day(page, "2026-12-13")).toMatchObject({ blocked: false, closedDay: true });
  });

  test("defaults to this Mauritius month; an invalid month is 400 (AC6, AC7)", async () => {
    expect((await load()).month).toBe("2026-11");
    expect((await load()).today).toBe("2026-11-14");
    const thrown = (await thrownBy(() => load("?month=2026-13"))) as { init: { status: number } };
    expect(thrown.init.status).toBe(400);
  });

  test("a customer session gets no data (AC10)", async () => {
    const customer = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    const thrown = await thrownBy(() => loader(routeArgs(database, { path: "/admin/calendar", auth: session.auth, cookie, now: NOW }) as never));
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toContain("/admin/login");
  });
});

describe("week and day lists (S-137)", () => {
  test("week lists active orders by date, window start, then number; stopped ones are not listed (AC1, AC2)", async () => {
    const afternoon = await placed("approved", "2026-12-12", { "windowId.pickup": "afternoon" });
    const morning = await placed("in_preparation", "2026-12-12");
    const quote = await placed("quote_needed", "2026-12-08");
    await placed("cancelled", "2026-12-12");
    await placed("approved", "2026-12-14");

    const page = await load("?view=week&date=2026-12-10");

    expect(page.days.map((d) => d.date)).toEqual(["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"]);
    expect(page.list.map((o) => o.id)).toEqual([quote, morning, afternoon]);
    expect(page.list[0]).toMatchObject({ status: "quote_needed", contactName: "Aisha", number: expect.stringMatching(/^APB-/), dateLabel: "Tue 8 Dec" });
  });

  test("day view lists that day only; an invalid date is 400 (AC3, AC6)", async () => {
    const id = await placed("approved", "2026-12-12");
    await placed("approved", "2026-12-14");

    expect((await load("?view=day&date=2026-12-12")).list.map((o) => o.id)).toEqual([id]);
    expect((await load("?view=day&date=2026-12-15")).list).toEqual([]);
    expect(((await thrownBy(() => load("?view=day&date=2026-02-30"))) as { init: { status: number } }).init.status).toBe(400);
  });

  test("French dates and labels follow the admin's language (AC7)", async () => {
    await database.client.query("update admin set locale = 'fr' where id = $1", [session.admin.id]);
    await placed("approved", "2026-12-12");
    const page = await load("?view=day&date=2026-12-12");
    expect(page.days[0]!.longLabel).toBe("samedi 12 décembre 2026");
    expect(page.list[0]!.dateLabel).toBe("sam. 12 déc.");
  });
});

describe("block and reopen a day (S-138)", () => {
  test("blocking a free day writes one single-day row; the customer menu disables it without the reason (AC1, AC9)", async () => {
    expect(await post({ intent: "blockDay", date: "2026-12-12", reason: "Family event" })).toEqual({ ok: true, intent: "blockDay", date: "2026-12-12", existingOrders: [] });
    expect(await blocks()).toEqual([{ starts_on: "2026-12-12", ends_on: "2026-12-12", reason: "Family event" }]);

    const menu = await (await menuLoader(routeArgs(database, { path: "/api/menu", now: NOW }) as never) as Response).text();
    expect(menu).toContain("2026-12-12");
    expect(menu).not.toContain("Family event");
  });

  test("blocking a day with orders lists them and leaves them as they were (AC2)", async () => {
    const a = await placed("approved", "2026-12-12");
    const b = await placed("pending_approval", "2026-12-12");

    const answer = (await post({ intent: "blockDay", date: "2026-12-12" })) as { existingOrders: { id: string }[] };

    expect(answer.existingOrders.map((o) => o.id).sort()).toEqual([a, b].sort());
    const statuses = (await database.client.query("select status from orders where id = any($1) order by status", [[a, b]])).rows;
    expect(statuses).toEqual([{ status: "pending_approval" }, { status: "approved" }]);
  });

  test("a reason over 200 characters and a past date are VALIDATION_FAILED (AC3, AC6)", async () => {
    const long = (await post({ intent: "blockDay", date: "2026-12-12", reason: "x".repeat(201) })) as Refusal;
    expect(long.data.error).toMatchObject({ code: "VALIDATION_FAILED", fields: { reason: expect.any(String) } });
    expect(await post({ intent: "blockDay", date: "2026-12-12", reason: "x".repeat(200) })).toMatchObject({ ok: true });

    const past = (await post({ intent: "blockDay", date: "2026-11-13" })) as Refusal;
    expect(past.init.status).toBe(400);
    expect(past.data.error.fields).toHaveProperty("date");
  });

  test("blocking twice is idempotent: ok, one row (AC7)", async () => {
    await Promise.all([post({ intent: "blockDay", date: "2026-12-12" }), post({ intent: "blockDay", date: "2026-12-12" })]);
    expect(await post({ intent: "blockDay", date: "2026-12-12" })).toMatchObject({ ok: true });
    expect(await blocks()).toHaveLength(1);
  });

  test("reopening removes the single block, today included; an unblocked day is NOT_FOUND (AC4, AC6)", async () => {
    await post({ intent: "blockDay", date: "2026-11-14" });
    expect(await post({ intent: "unblockDay", date: "2026-11-14" })).toEqual({ ok: true, intent: "unblockDay", date: "2026-11-14" });
    expect(await blocks()).toEqual([]);
    const missing = (await post({ intent: "unblockDay", date: "2026-11-14" })) as Refusal;
    expect(missing.data.error.code).toBe("NOT_FOUND");
  });

  test("a day inside an Owner range cannot be reopened here: FORBIDDEN range_block, block kept (AC5)", async () => {
    await database.client.query("insert into blocked_date (starts_on, ends_on) values ('2026-12-20', '2026-12-27')");
    const refused = (await post({ intent: "unblockDay", date: "2026-12-22" })) as Refusal;
    expect(refused.init.status).toBe(403);
    expect(refused.data).toMatchObject({ error: { code: "FORBIDDEN" }, details: { reason: "range_block" } });
    expect(await blocks()).toHaveLength(1);
  });

  test("a customer mid-checkout on a day just blocked is refused; an earlier order stays (AC8)", async () => {
    const earlier = await placed("approved", "2026-12-12");
    await post({ intent: "blockDay", date: "2026-12-12" });
    siteSettingsCache.clear();

    await expect(placeTestOrder(database, { overrides: { date: "2026-12-12" } })).rejects.toThrow(/DATE_UNAVAILABLE/);
    expect((await database.client.query("select status from orders where id = $1", [earlier])).rows[0]).toEqual({ status: "approved" });
  });

  test("a customer session cannot block (AC11)", async () => {
    const customer = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    await expect(thrownBy(() => action(routeArgs(database, { path: "/admin/calendar", auth: session.auth, cookie, form: { intent: "blockDay", date: "2026-12-12" }, now: NOW }) as never))).resolves.toBeDefined();
    expect(await blocks()).toEqual([]);
  });
});
