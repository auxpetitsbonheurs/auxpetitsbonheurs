import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as schema from "~/db/schema";
import { counter } from "~/db/schema";
import { CONNECTION_OPTIONS, type Connect, createRequestDb, handleWithDb } from "./db.server";

// postgres() is lazy: no socket is opened until a query runs, so these tests use no network.
const URL = "postgresql://user:placeholder@127.0.0.1:6543/postgres";

function spyConnect() {
  const calls: { url: string; options: unknown }[] = [];
  const clients: postgres.Sql[] = [];
  const connect: Connect = (url, options) => {
    calls.push({ url, options });
    const client = postgres(url, options);
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
  test("uses the postgres driver with one connection and no prepared statements", () => {
    const { connect, calls, clients } = spyConnect();

    const requestDb = createRequestDb(URL, connect);
    const db = requestDb.db;

    expect(CONNECTION_OPTIONS).toEqual({ max: 1, prepare: false });
    expect(calls).toEqual([{ url: URL, options: { max: 1, prepare: false } }]);
    expect(clients[0]?.options.max).toBe(1);
    expect(clients[0]?.options.prepare).toBe(false);
    expect(db.$client).toBe(clients[0]);
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

  test("still closes the client when the handler throws", async () => {
    const { connect, clients } = spyConnect();
    const ctx = fakeCtx();
    let ended = false;

    await expect(
      handleWithDb(URL, ctx, async (requestDb) => {
        void requestDb.db;
        vi.spyOn(clients[0]!, "end").mockImplementation(async () => void (ended = true));
        throw new Error("boom");
      }, connect),
    ).rejects.toThrow("boom");
    await Promise.all(ctx.pending);

    expect(ended).toBe(true);
  });

  test("a request that never touched the database opens nothing", async () => {
    const { connect, calls } = spyConnect();
    const ctx = fakeCtx();

    await handleWithDb(URL, ctx, async () => new Response("static"), connect);
    await Promise.all(ctx.pending);

    expect(calls).toHaveLength(0);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
  });
});

describe("transactions on real Postgres (AC5, in-process PGlite)", () => {
  const client = new PGlite();
  const db = drizzle({ client, schema });

  beforeAll(async () => {
    await client.exec(`create table counter (name text primary key, value integer not null default 0)`);
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
