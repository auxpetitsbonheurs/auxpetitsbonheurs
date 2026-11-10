// `/healthz` (S-020 AC1, AC2; contracts.md): database and Auth reachability for an uptime monitor.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { HEALTH_TIMEOUT_MS } from "~/server/health.server";
import { TEST_SUPABASE_URL, routeArgs } from "~/server/testing/route-context";
import { loader } from "./healthz";

let database: TestDatabase;
let closed = false;

beforeEach(async () => {
  database = await createTestDatabase();
  closed = false;
}, 60_000);

afterEach(async () => {
  vi.unstubAllGlobals();
  if (!closed) await database.close();
});

const authAnswers = (status: number) => vi.fn(async () => new Response(JSON.stringify({ version: "v2.170.0", name: "GoTrue" }), { status }));
const get = () => loader(routeArgs(database, { path: "/healthz" }) as never) as Promise<Response>;

describe("GET /healthz", () => {
  test("AC1: 200 { ok, db, auth } with no-store when the database and Auth answer", async () => {
    const fetch = authAnswers(200);
    vi.stubGlobal("fetch", fetch);

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, db: "ok", auth: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${TEST_SUPABASE_URL}/auth/v1/health`);
    expect(new Headers(init.headers).get("apikey")).toBe("test-anon-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("AC2: Auth failing gives 503 naming auth, and never echoes versions or error text", async () => {
    vi.stubGlobal("fetch", authAnswers(500));

    const response = await get();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ ok: false, db: "ok", auth: "fail" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(text).not.toMatch(/v2\.170|GoTrue/);
  });

  test("AC2: the database down gives 503 naming db, with no error text", async () => {
    vi.stubGlobal("fetch", authAnswers(200));
    await database.close();
    closed = true;

    const response = await get();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ ok: false, db: "fail", auth: "ok" });
  });

  test("AC2: a network error to Auth is a failure too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed: secret-host"))));

    const response = await get();

    expect(await response.text()).toBe(JSON.stringify({ ok: false, db: "ok", auth: "fail" }));
  });

  test("AC2: the timeout is 5 s", () => {
    expect(HEALTH_TIMEOUT_MS).toBe(5_000);
  });
});
