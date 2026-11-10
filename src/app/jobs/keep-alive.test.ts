// keepAlive job (S-020 AC3, NFR-005): keeps the free Supabase project from pausing.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { pingAuth } from "~/server/health.server";
import { keepAlive } from "./keep-alive";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const supabase = { url: "https://ref.supabase.co", anonKey: "anon" };

describe("keepAlive (AC3)", () => {
  test("runs select 1 and GET {SUPABASE_URL}/auth/v1/health with a 5 s timeout", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const execute = vi.spyOn(database.db, "execute");

    const result = await keepAlive({ now: new Date("2026-11-15T22:00:00Z"), db: database.db as unknown as Database, supabase, fetch });

    expect(result).toEqual({ job: "keepAlive", ran: true, processed: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/auth/v1/health");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("throws when Auth does not answer OK (the dispatcher records the failure)", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 503 }));

    await expect(keepAlive({ now: new Date(), db: database.db as unknown as Database, supabase, fetch })).rejects.toThrow(/auth/i);
  });

  test("an Auth request that hangs is aborted at the timeout", async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );

    await expect(pingAuth(supabase, hanging as unknown as typeof fetch, 20)).rejects.toThrow();
  });
});
