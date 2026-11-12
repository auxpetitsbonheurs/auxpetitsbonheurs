// One database client per request (architecture.md#data, NFR-005, NFR-013): node-postgres
// (`pg`, ADR-0003 amendment 3), a pool of at most one connection opened on first use and
// closed via ctx.waitUntil after the response and its deferred work. The URL is the Hyperdrive
// binding's connection string when bound (Cloudflare's recommended driver for Hyperdrive), else
// DATABASE_URL (Supavisor transaction pooler: local dev, e2e, CI and the fallback). node-postgres
// sends each parameterised query as one Parse/Bind/Execute/Sync batch with unnamed statements:
// one round trip, no describe wait (the postgres.js stall behind Hyperdrive), and safe on the
// transaction pooler.
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import { createContext } from "react-router";
import * as schema from "~/db/schema";
import { withLibpqSslModes } from "~/lib/pg-url";
import type { AfterResponseQueue } from "./after-response.server";
import { type DbTimingName, startDbTiming } from "./db-timing.server";
import { workersSocketFactory } from "./pg-socket.server";

/**
 * Every wait is bounded so a stuck connection fails fast instead of hanging the customer
 * (staging run 43021376002: a page request got no response for 5 minutes). `max: 1`: loaders
 * that run in parallel queue on the pool, and a transaction holds the only connection, so no
 * other query can slip into it. `idleTimeoutMillis: 0`: no idle timer; the pool is ended
 * explicitly at the end of the request.
 */
export const CONNECTION_OPTIONS = { max: 1, connectionTimeoutMillis: 4_000, query_timeout: 5_000, idleTimeoutMillis: 0 } as const;

/** How long closing may take before it is abandoned (the runtime would cut it anyway). */
export const CLOSE_TIMEOUT_MS = 5_000;

/**
 * Ceiling for one whole request, response body included. Below the 15 s a visitor (and the
 * cpu-measure client) waits, so a stuck database answers 503 instead of leaving a hang.
 */
export const REQUEST_DEADLINE_MS = 14_000;

/** A read (GET/HEAD) gets this long to produce its headers before it is retried once on a fresh connection. */
export const ATTEMPT_MS = 6_000;

export type PoolConfig = pg.PoolConfig & typeof CONNECTION_OPTIONS & { connectionString: string };
export type Connect = (config: PoolConfig) => pg.Pool;

type Callback = (error: Error | null, result?: unknown) => void;

/** Records `name` for the request in scope when a callback-style or promise call settles. */
function timedCall(name: DbTimingName, args: unknown[], call: (args: unknown[]) => unknown): unknown {
  const done = startDbTiming(name);
  const last = args.at(-1);
  if (typeof last === "function") {
    const callback = last as Callback;
    return call([...args.slice(0, -1), (error: Error | null, result?: unknown) => (done(), callback(error, result))]);
  }
  const result = call(args);
  if (result instanceof Promise) return result.finally(done);
  done();
  return result;
}

const superConnect = pg.Client.prototype.connect as (...args: unknown[]) => unknown;
const superQuery = pg.Client.prototype.query as (...args: unknown[]) => unknown;

/** A pg Client that reports its connection and query times to Server-Timing (durations only). */
class TimedClient extends pg.Client {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pg's overloads (callback and promise forms) pass through untouched
  override connect(...args: any[]): any {
    return timedCall("db-connect", args, (a) => superConnect.apply(this, a));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above: pg-pool calls the callback form, drizzle the promise form
  override query(...args: any[]): any {
    return timedCall("db-query", args, (a) => superQuery.apply(this, a));
  }
}

const logEvent = (event: string, fields: Record<string, unknown>) => console.error(JSON.stringify({ level: "error", event, ...fields }));

/** On Workers, a socket that sends each query's messages in one write (pg-socket.server.ts). */
const workersStream = workersSocketFactory();

export const connectPool: Connect = (config) => {
  const pool = new pg.Pool({
    ...config,
    Client: TimedClient as unknown as new () => pg.ClientBase,
    ...(workersStream ? { stream: workersStream as unknown as pg.PoolConfig["stream"] } : {}),
  });
  // A connection that drops while idle emits "error"; unhandled, it would throw in the isolate.
  // While the pool is ending, the Workers socket reports its own close as an error: not news.
  pool.on("error", (error) => {
    if (pool.ending) return;
    logEvent("db_connection_error", { error: error.name, code: (error as { code?: string }).code });
  });
  return pool;
};

/** Driver-independent type so services also accept an in-process test database. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A transaction handle from `db.transaction`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Repositories that may run inside a caller's transaction take either. */
export type Executor = Database | Transaction;

export interface RequestDb {
  /** Created on first use; requests that never query open no connection. */
  readonly db: ReturnType<typeof drizzle<typeof schema, pg.Pool>>;
  close(): Promise<void>;
}

export function poolConfig(url: string): PoolConfig {
  return { connectionString: withLibpqSslModes(url), ...CONNECTION_OPTIONS };
}

export function createRequestDb(url: string, connect: Connect = connectPool): RequestDb {
  let pool: pg.Pool | undefined;
  let db: RequestDb["db"] | undefined;
  return {
    get db() {
      if (!db) {
        pool = connect(poolConfig(url));
        db = drizzle({ client: pool, schema });
      }
      return db;
    },
    async close() {
      if (!pool) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const gaveUp = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CLOSE_TIMEOUT_MS);
      });
      try {
        await Promise.race([pool.end().catch(() => undefined), gaveUp]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface HandleOptions {
  /** True for GET/HEAD: the work may run again on a fresh client if the first attempt stalls or answers 500. */
  idempotent?: boolean;
  deadlineMs?: number;
  attemptMs?: number;
  /** The request's deferred work: released once a response is chosen; clients close after it settles. */
  afterResponse?: AfterResponseQueue;
}

type Attempt = { kind: "response"; response: Response } | { kind: "stalled" } | { kind: "threw"; name: string };

const unavailable = () =>
  new Response("Service temporarily unavailable", { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });

/** Runs the handler until it has headers, `budgetMs` passes, or it throws; a late answer is discarded. */
async function attemptWithin(requestDb: RequestDb, handle: (db: RequestDb) => Promise<Response>, budgetMs: number): Promise<Attempt> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<Attempt>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "stalled" }), Math.max(0, budgetMs));
  });
  const work = Promise.resolve()
    .then(() => handle(requestDb))
    .then<Attempt, Attempt>(
      (response) => ({ kind: "response", response }),
      (error: unknown) => ({ kind: "threw", name: error instanceof Error ? error.name : "unknown" }),
    );
  try {
    const outcome = await Promise.race([work, stalled]);
    // An abandoned attempt that answers later must not leave its body open.
    if (outcome.kind === "stalled") void work.then((late) => {
      if (late.kind === "response") void late.response.body?.cancel().catch(() => {});
    });
    return outcome;
  } finally {
    clearTimeout(timer);
  }
}

/** Passes the body through, but errors it at the deadline and reports when it ends, fails or is cancelled. */
function boundBody(response: Response, budgetMs: number, onEnd: () => void): Response {
  if (!response.body) {
    onEnd();
    return response;
  }
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    onEnd();
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setTimeout(() => {
        logEvent("request_deadline_exceeded", { phase: "body", afterMs: REQUEST_DEADLINE_MS });
        controller.error(new Error("request deadline exceeded"));
        reader.cancel().catch(() => {});
        finish();
      }, Math.max(0, budgetMs));
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          finish();
        } else controller.enqueue(value);
      } catch (error) {
        if (!ended) controller.error(error);
        finish();
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  return new Response(body, response);
}

/**
 * Runs one request with its own database client. One deadline covers headers and body; the
 * client closes (ctx.waitUntil) only when the body is done and the request's deferred work has
 * settled. A read whose first attempt stalls (a stuck first connection on a fresh isolate) or
 * answers 500 is retried once on a new client; a request that cannot be answered becomes a
 * 503, never a hang. Deferred work starts once a response is chosen, never before.
 */
export async function handleWithDb(
  url: string,
  ctx: Pick<ExecutionContext, "waitUntil">,
  handle: (requestDb: RequestDb) => Promise<Response>,
  connect: Connect = connectPool,
  options: HandleOptions = {},
): Promise<Response> {
  const deadlineMs = options.deadlineMs ?? REQUEST_DEADLINE_MS;
  const attemptMs = options.attemptMs ?? ATTEMPT_MS;
  const after = options.afterResponse;
  const startedAt = Date.now();
  const remaining = () => deadlineMs - (Date.now() - startedAt);
  const maxAttempts = options.idempotent ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    const requestDb = createRequestDb(url, connect);
    const close = () => void ctx.waitUntil((after ? after.settled() : Promise.resolve()).then(() => requestDb.close()));
    const budget = options.idempotent ? Math.min(attemptMs, remaining()) : remaining();
    const outcome = await attemptWithin(requestDb, handle, budget);
    const last = attempt >= maxAttempts || remaining() < 1_000;
    if (outcome.kind === "response" && (outcome.response.status !== 500 || last)) {
      after?.release();
      return boundBody(outcome.response, remaining(), close);
    }
    if (outcome.kind === "response") void outcome.response.body?.cancel().catch(() => {});
    logEvent("request_attempt_failed", { attempt, reason: outcome.kind === "response" ? "status_500" : outcome.kind, ...(outcome.kind === "threw" ? { error: outcome.name } : {}) });
    if (last) {
      after?.release();
      close();
      return unavailable();
    }
    close();
  }
}

/** Route loaders/actions read the request's client with `context.get(requestDbContext).db`. */
export const requestDbContext = createContext<RequestDb>();
