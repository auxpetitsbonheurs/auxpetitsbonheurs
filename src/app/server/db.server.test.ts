import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { type AddressInfo, type Socket, createServer } from "node:net";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import * as schema from "~/db/schema";
import { counter } from "~/db/schema";
import { createAfterResponse } from "./after-response.server";
import {
  ATTEMPT_MS,
  CLOSE_TIMEOUT_MS,
  CONNECTION_OPTIONS,
  type Connect,
  type PoolConfig,
  REQUEST_DEADLINE_MS,
  connectPool,
  createRequestDb,
  handleWithDb,
} from "./db.server";

// A pg Pool is lazy: no socket is opened until a query runs, so these tests use no network.
const URL = "postgresql://user:placeholder@127.0.0.1:6543/postgres";

function spyConnect() {
  const calls: PoolConfig[] = [];
  const clients: pg.Pool[] = [];
  const connect: Connect = (config) => {
    calls.push(config);
    const client = connectPool(config);
    clients.push(client);
    return client;
  };
  return { connect, calls, clients };
}

function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: vi.fn((p: Promise<unknown>) => void pending.push(p)), pending };
}

describe("per-request database client (AC4)", () => {
  test("uses node-postgres with a pool of one connection and no idle timer", () => {
    const { connect, calls, clients } = spyConnect();

    const requestDb = createRequestDb(URL, connect);
    const db = requestDb.db;

    expect(calls).toEqual([{ connectionString: URL, ...CONNECTION_OPTIONS }]);
    expect(clients[0]?.options.max).toBe(1);
    expect(clients[0]?.options.idleTimeoutMillis).toBe(0);
    expect(db.$client).toBe(clients[0]);
  });

  test("a URL with sslmode keeps libpq's meaning (Supabase's own CA would fail verify-full)", () => {
    const { connect, calls } = spyConnect();

    void createRequestDb(`${URL}?sslmode=require`, connect).db;

    expect(calls[0]?.connectionString).toBe(`${URL}?sslmode=require&uselibpqcompat=true`);
  });

  test("connects lazily, once per request", () => {
    const { connect, calls } = spyConnect();

    const requestDb = createRequestDb(URL, connect);
    expect(calls).toHaveLength(0);
    void requestDb.db;
    void requestDb.db;

    expect(calls).toHaveLength(1);
  });

  test("closes the client through ctx.waitUntil after the response", async () => {
    const { connect, clients } = spyConnect();
    const ctx = fakeCtx();
    const order: string[] = [];

    const response = await handleWithDb(URL, ctx, async (requestDb) => {
      void requestDb.db;
      vi.spyOn(clients[0]!, "end").mockImplementation(async () => void order.push("closed"));
      order.push("responded");
      return new Response("ok");
    }, connect);
    await Promise.all(ctx.pending);

    expect(await response.text()).toBe("ok");
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["responded", "closed"]);
  });

  test("a handler that throws becomes a fast 503 (never an unhandled rejection) and the client still closes", async () => {
    const { connect, clients } = spyConnect();
    const ctx = fakeCtx();
    let ended = false;

    const response = await handleWithDb(URL, ctx, async (requestDb) => {
      void requestDb.db;
      vi.spyOn(clients[0]!, "end").mockImplementation(async () => void (ended = true));
      throw new Error("boom");
    }, connect);
    await Promise.all(ctx.pending);

    expect(response.status).toBe(503);
    expect(ended).toBe(true);
  });

  test("a hung connect or query is bounded: every wait has a timeout", () => {
    expect(CONNECTION_OPTIONS.connectionTimeoutMillis).toBeLessThanOrEqual(10_000);
    expect(CONNECTION_OPTIONS.query_timeout).toBeLessThanOrEqual(15_000);
    expect(CONNECTION_OPTIONS.connectionTimeoutMillis + CONNECTION_OPTIONS.query_timeout).toBeLessThan(REQUEST_DEADLINE_MS);
  });

  test("a server that accepts the socket but never answers fails the query at the connect timeout", async () => {
    // A local socket that swallows the startup message: the stuck-pooler case, without any network.
    const sockets: Socket[] = [];
    const server = createServer((socket) => void sockets.push(socket));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const requestDb = createRequestDb(`postgresql://user:placeholder@127.0.0.1:${port}/postgres`, (config) =>
      connectPool({ ...config, connectionTimeoutMillis: 150 } as unknown as PoolConfig),
    );
    const started = Date.now();
    try {
      await expect(requestDb.db.select().from(counter)).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      await requestDb.close();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("a dropped idle connection is logged by name and code; the socket's own close while ending is not", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = connectPool({ connectionString: URL, ...CONNECTION_OPTIONS });

    pool.emit("error", Object.assign(new Error("server closed the connection to someone@example.com"), { code: "57P01" }));
    await pool.end();
    pool.emit("error", new TypeError("socket closed"));

    expect(error.mock.calls.map((c) => String(c[0]))).toEqual([JSON.stringify({ level: "error", event: "db_connection_error", error: "Error", code: "57P01" })]);
    error.mockRestore();
  });

  test("closing a pool that never ends gives up after CLOSE_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    try {
      const { connect, clients } = spyConnect();
      const requestDb = createRequestDb(URL, connect);
      void requestDb.db;
      vi.spyOn(clients[0]!, "end").mockImplementation(() => new Promise<void>(() => {}));
      let closed = false;
      void requestDb.close().then(() => (closed = true));

      await vi.advanceTimersByTimeAsync(CLOSE_TIMEOUT_MS + 1);

      expect(closed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("deferred work runs after the response (ADR-0003 amendment 3)", () => {
  test("deferred tasks start only once the response is chosen, and the client closes after them", async () => {
    const { connect, clients } = spyConnect();
    const ctx = fakeCtx();
    const after = createAfterResponse(ctx.waitUntil);
    const order: string[] = [];

    const response = await handleWithDb(URL, ctx, async (requestDb) => {
      void requestDb.db;
      vi.spyOn(clients[0]!, "end").mockImplementation(async () => void order.push("closed"));
      after.defer("email", async () => void order.push("deferred ran"));
      await Promise.resolve();
      order.push("handler done");
      return new Response("ok");
    }, connect, { afterResponse: after });
    await response.text();
    await after.settled();
    await Promise.all(ctx.pending);

    expect(order).toEqual(["handler done", "deferred ran", "closed"]);
  });

  test("a failing deferred task never changes the response and is logged without its message", async () => {
    const { connect } = spyConnect();
    const ctx = fakeCtx();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = createAfterResponse(ctx.waitUntil);

    const response = await handleWithDb(URL, ctx, async () => {
      after.defer("push", async () => {
        throw Object.assign(new Error("to someone@example.com failed"), { code: "ETIMEDOUT" });
      });
      return new Response("placed", { status: 302 });
    }, connect, { afterResponse: after });
    await after.settled();
    await Promise.all(ctx.pending);

    expect(response.status).toBe(302);
    const lines = error.mock.calls.map((call) => String(call[0]));
    expect(lines).toContainEqual(JSON.stringify({ level: "error", event: "deferred_task_failed", task: "push", error: "Error", code: "ETIMEDOUT" }));
    expect(lines.join("\n")).not.toContain("someone@example.com");
    error.mockRestore();
  });

  test("a handler that never answers becomes a 503 after the deadline, and the client still closes", async () => {
    vi.useFakeTimers();
    try {
      const { connect } = spyConnect();
      const ctx = fakeCtx();
      const pending = handleWithDb(URL, ctx, () => new Promise<Response>(() => {}), connect);
      await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 1);
      const response = await pending;
      await Promise.all(ctx.pending);

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("5");
      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a handler that answers in time is returned untouched and the deadline timer is cleared", async () => {
    vi.useFakeTimers();
    try {
      const { connect } = spyConnect();
      const response = await handleWithDb(URL, fakeCtx(), async () => new Response("ok", { status: 201 }), connect);

      expect(response.status).toBe(201);
      await response.text();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a request that never touched the database opens nothing", async () => {
    const { connect, calls } = spyConnect();
    const ctx = fakeCtx();

    await (await handleWithDb(URL, ctx, async () => new Response("static"), connect)).text();
    await Promise.all(ctx.pending);

    expect(calls).toHaveLength(0);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
  });
});

/** A response whose body the test feeds by hand, like a streamed React Router page. */
function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return { body, push: (text: string) => controller.enqueue(new TextEncoder().encode(text)), end: () => controller.close() };
}

describe("one deadline for the whole response, headers and body (staging page hangs)", () => {
  afterEach(() => vi.useRealTimers());

  test("a body that never finishes is cut at the deadline, not streamed forever", async () => {
    vi.useFakeTimers();
    const { connect } = spyConnect();
    const ctx = fakeCtx();
    const stream = openStream();
    const response = await handleWithDb(URL, ctx, async () => new Response(stream.body, { status: 200 }), connect);
    const reading = response.text().then(
      () => "finished",
      () => "cut",
    );

    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 1);

    expect(await reading).toBe("cut");
    await Promise.all(ctx.pending);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("the client is closed when the body ends, not when the headers are ready", async () => {
    const { connect, clients } = spyConnect();
    const ctx = fakeCtx();
    const stream = openStream();
    const response = await handleWithDb(URL, ctx, async (requestDb) => {
      void requestDb.db;
      return new Response(stream.body);
    }, connect);
    const end = vi.spyOn(clients[0]!, "end").mockResolvedValue(undefined);

    expect(ctx.waitUntil).not.toHaveBeenCalled();
    stream.push("<html>");
    stream.end();
    expect(await response.text()).toBe("<html>");
    await Promise.all(ctx.pending);

    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  test("the client is closed when the visitor goes away mid-body", async () => {
    const { connect } = spyConnect();
    const ctx = fakeCtx();
    const response = await handleWithDb(URL, ctx, async () => new Response(openStream().body), connect);

    await response.body!.cancel();

    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
  });
});

describe("a stuck first connection fails over, never hangs", () => {
  afterEach(() => vi.useRealTimers());
  const GET = { idempotent: true };

  test("a read whose first attempt stalls is retried once on a fresh client and succeeds", async () => {
    vi.useFakeTimers();
    const { connect, calls } = spyConnect();
    const ctx = fakeCtx();
    const dbs: unknown[] = [];
    let attempt = 0;
    const pending = handleWithDb(URL, ctx, async (requestDb) => {
      dbs.push(requestDb);
      void requestDb.db;
      attempt += 1;
      return attempt === 1 ? new Promise<Response>(() => {}) : new Response("page");
    }, connect, GET);

    await vi.advanceTimersByTimeAsync(ATTEMPT_MS + 1);
    const response = await pending;

    expect(await response.text()).toBe("page");
    expect(calls).toHaveLength(2);
    expect(dbs[0]).not.toBe(dbs[1]);
    expect(ATTEMPT_MS * 2).toBeLessThanOrEqual(REQUEST_DEADLINE_MS);
  });

  test("a read that answers 500 once is retried once; a second 500 is returned as is", async () => {
    const { connect } = spyConnect();
    let calls = 0;
    const response = await handleWithDb(URL, fakeCtx(), async () => (++calls, new Response("err", { status: 500 })), connect, GET);

    expect(response.status).toBe(500);
    expect(calls).toBe(2);
  });

  test("a read that stalls twice is a 503 before the deadline, with both clients closed", async () => {
    vi.useFakeTimers();
    const { connect } = spyConnect();
    const ctx = fakeCtx();
    const pending = handleWithDb(URL, ctx, () => new Promise<Response>(() => {}), connect, GET);

    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);
  });

  test("a write is never retried (it could run twice)", async () => {
    const { connect } = spyConnect();
    let calls = 0;
    const response = await handleWithDb(URL, fakeCtx(), async () => (++calls, new Response("err", { status: 500 })), connect);

    expect(response.status).toBe(500);
    expect(calls).toBe(1);
  });

  test("only a 500 is retried: 404, redirects and 503 answers are final", async () => {
    const { connect } = spyConnect();
    for (const status of [302, 404, 503]) {
      let calls = 0;
      await handleWithDb(URL, fakeCtx(), async () => (++calls, new Response(null, { status })), connect, GET);
      expect(calls).toBe(1);
    }
  });
});

describe("transactions on real Postgres (AC5, in-process PGlite)", () => {
  const client = new PGlite();
  const db = drizzle({ client, schema });

  beforeAll(async () => {
    await client.exec(`create table counter (name text primary key, value integer not null default 0)`);
  }, 60_000); // waits for this PGlite's initdb, slow when every core runs a test file
  // One PGlite for the block: each test starts from an empty table, in any order.
  beforeEach(async () => {
    await client.exec("delete from counter");
  });
  afterAll(async () => {
    await client.close();
  });

  test("a transaction that throws midway leaves none of its writes", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(counter).values({ name: "order_number", value: 1 });
        await tx.insert(counter).values({ name: "other", value: 2 });
        throw new Error("midway failure");
      }),
    ).rejects.toThrow("midway failure");

    expect(await db.select().from(counter)).toEqual([]);
  });

  test("a transaction that completes keeps its writes", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(counter).values({ name: "order_number", value: 1 });
    });

    expect(await db.select().from(counter)).toEqual([{ name: "order_number", value: 1 }]);
  });
});
