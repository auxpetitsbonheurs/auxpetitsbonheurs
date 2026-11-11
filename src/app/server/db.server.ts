// One database client per request (architecture.md#data, NFR-005, NFR-013):
// postgres.js, one connection, no prepared statements, closed via ctx.waitUntil after the
// response. The URL is the Hyperdrive binding's connection string when bound (ADR-0003, the
// recommended per-request client with max 1), else DATABASE_URL (Supavisor transaction
// pooler, which cannot keep prepared statements; we keep them off on both paths).
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createContext } from "react-router";
import * as schema from "~/db/schema";

/**
 * Every wait is bounded so a stuck pooler connection fails fast instead of hanging the
 * customer (staging run 43021376002: a page request got no response for 5 minutes).
 * `max_pipeline: 1` sends one query at a time: loaders run in parallel on the single
 * connection, and the transaction pooler cannot be trusted with interleaved extended-protocol
 * messages.
 */
export const CONNECTION_OPTIONS = { max: 1, prepare: false, fetch_types: false, connect_timeout: 4, query_timeout: 5, max_pipeline: 1 } as const;

/**
 * Ceiling for one whole request, response body included. Below the 15 s a visitor (and the
 * cpu-measure client) waits, so a stuck database answers 503 instead of leaving a hang.
 */
export const REQUEST_DEADLINE_MS = 14_000;

/** A read (GET/HEAD) gets this long to produce its headers before it is retried once on a fresh connection. */
export const ATTEMPT_MS = 6_000;

export type Connect = (url: string, options: typeof CONNECTION_OPTIONS) => postgres.Sql;

/** Driver-independent type so services also accept an in-process test database. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A transaction handle from `db.transaction`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Repositories that may run inside a caller's transaction take either. */
export type Executor = Database | Transaction;

export interface RequestDb {
  /** Created on first use; requests that never query open no connection. */
  readonly db: ReturnType<typeof drizzle<typeof schema, postgres.Sql>>;
  close(): Promise<void>;
}

export function createRequestDb(url: string, connect: Connect = postgres): RequestDb {
  let client: postgres.Sql | undefined;
  let db: RequestDb["db"] | undefined;
  return {
    get db() {
      if (!db) {
        client = connect(url, CONNECTION_OPTIONS);
        db = drizzle({ client, schema });
      }
      return db;
    },
    async close() {
      await client?.end({ timeout: 5 });
    },
  };
}

export interface HandleOptions {
  /** True for GET/HEAD: the work may run again on a fresh client if the first attempt stalls or answers 500. */
  idempotent?: boolean;
  deadlineMs?: number;
  attemptMs?: number;
}

type Attempt = { kind: "response"; response: Response } | { kind: "stalled" } | { kind: "threw"; name: string };

const unavailable = () =>
  new Response("Service temporarily unavailable", { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });

const logEvent = (event: string, fields: Record<string, unknown>) => console.error(JSON.stringify({ level: "error", event, ...fields }));

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
    if (outcome.kind === "stalled") void work.then((late) => late.kind === "response" && late.response.body?.cancel().catch(() => {}));
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
 * client closes (ctx.waitUntil) only when the body is done. A read whose first attempt stalls
 * (a stuck first connection on a fresh isolate) or answers 500 is retried once on a new client;
 * a request that cannot be answered becomes a 503, never a hang.
 */
export async function handleWithDb(
  url: string,
  ctx: Pick<ExecutionContext, "waitUntil">,
  handle: (requestDb: RequestDb) => Promise<Response>,
  connect: Connect = postgres,
  options: HandleOptions = {},
): Promise<Response> {
  const deadlineMs = options.deadlineMs ?? REQUEST_DEADLINE_MS;
  const attemptMs = options.attemptMs ?? ATTEMPT_MS;
  const startedAt = Date.now();
  const remaining = () => deadlineMs - (Date.now() - startedAt);
  const maxAttempts = options.idempotent ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    const requestDb = createRequestDb(url, connect);
    const close = () => void ctx.waitUntil(requestDb.close());
    const budget = options.idempotent ? Math.min(attemptMs, remaining()) : remaining();
    const outcome = await attemptWithin(requestDb, handle, budget);
    const last = attempt >= maxAttempts || remaining() < 1_000;
    if (outcome.kind === "response" && (outcome.response.status !== 500 || last)) {
      return boundBody(outcome.response, remaining(), close);
    }
    if (outcome.kind === "response") void outcome.response.body?.cancel().catch(() => {});
    logEvent("request_attempt_failed", { attempt, reason: outcome.kind === "response" ? "status_500" : outcome.kind, ...(outcome.kind === "threw" ? { error: outcome.name } : {}) });
    close();
    if (last) return unavailable();
  }
}

/** Route loaders/actions read the request's client with `context.get(requestDbContext).db`. */
export const requestDbContext = createContext<RequestDb>();
