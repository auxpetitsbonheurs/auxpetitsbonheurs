// S-217 account usage counters: listed properties only (AC1), never personal data (AC2), a failed
// write never fails the action and is logged without PII (AC4), no counter for a failed sign-in (AC5).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { action as signInAction } from "~/routes/account/sign-in";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { USAGE_EVENTS, incrementUsage, recordUsage, usageProps } from "./usage.server";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  await database.client.exec("delete from usage_counter; delete from rate_limit_bucket");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await database.close();
});

const rows = async () => (await database.client.query<{ event: string; props: string; count: number }>("select event, props, count from usage_counter order by event, props")).rows;

describe("properties (AC1, AC2)", () => {
  test("only the listed properties are kept, as short codes; personal data has nowhere to go", () => {
    expect(usageProps("account_created", { method: "signup", linkedOrders: 2, email: "a@example.com", userId: "u-1" } as never)).toBe("linkedOrders=2;method=signup");
    expect(usageProps("sign_in", { method: "magic link <x>" })).toBe("method=magiclinkx");
    expect(usageProps("save_details_completed", { name: "Anna" } as never)).toBe("");
    expect(Object.keys(USAGE_EVENTS).sort()).toEqual(["account_created", "address_saved", "reorder_started", "save_details_completed", "save_details_shown", "sign_in"]);
  });

  test("counts add up per day, event and property set; the table has no personal columns", async () => {
    const now = new Date("2026-11-13T10:00:00Z");
    await incrementUsage(database.db as never, now, "reorder_started", { skippedCount: 1 });
    await incrementUsage(database.db as never, now, "reorder_started", { skippedCount: 1 });
    await incrementUsage(database.db as never, now, "address_saved", { atCheckout: true });
    expect(await rows()).toEqual([
      { event: "address_saved", props: "atCheckout=true", count: 1 },
      { event: "reorder_started", props: "skippedCount=1", count: 2 },
    ]);
    const { rows: columns } = await database.client.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'usage_counter' order by column_name");
    expect(columns.map((c) => c.column_name)).toEqual(["count", "day", "event", "props"]);
  });
});

describe("failures (AC4)", () => {
  test("a failed counter write resolves, and the log names the event only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.reject(new Error("db down for anna@example.com")) }) }) };
    const args = routeArgs(database, { path: "/", auth });
    const { requestDbContext } = await import("~/server/db.server");
    args.context.set(requestDbContext, { db: broken as never, close: async () => {} });

    await expect(recordUsage(args as never, "sign_in", { method: "password" })).resolves.toBeUndefined();
    await args.afterResponse.settled();

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("usage_count_failed");
    expect(logged).not.toContain("anna@example.com");
  });
});

describe("sign-in counters (AC1, AC5)", () => {
  test("a successful password sign-in counts once; a failed one counts nothing", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const post = async (password: string) => {
      const args = routeArgs(database, { path: "/account/sign-in", auth, form: { intent: "password", email: customer.email, password } });
      await signInAction(args as never).catch((thrown: unknown) => thrown);
      await args.afterResponse.settled();
    };
    await post("wrong password!");
    expect(await rows()).toEqual([]);
    await post("correct horse battery");
    expect(await rows()).toEqual([{ event: "sign_in", props: "method=password", count: 1 }]);
  });
});
