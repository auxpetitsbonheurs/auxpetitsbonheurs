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
export const CONNECTION_OPTIONS = { max: 1, prepare: false, fetch_types: false, connect_timeout: 5, query_timeout: 10, max_pipeline: 1 } as const;

/** Last-resort ceiling for one request's work; above the query timeouts, well below the platform's. */
export const REQUEST_DEADLINE_MS = 25_000;

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

/** Runs one request with its own database client and closes it after the response. */
export async function handleWithDb(
  url: string,
  ctx: Pick<ExecutionContext, "waitUntil">,
  handle: (requestDb: RequestDb) => Promise<Response>,
  connect: Connect = postgres,
): Promise<Response> {
  const requestDb = createRequestDb(url, connect);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      console.error(JSON.stringify({ level: "error", event: "request_deadline_exceeded", afterMs: REQUEST_DEADLINE_MS }));
      resolve(new Response("Service temporarily unavailable", { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } }));
    }, REQUEST_DEADLINE_MS);
  });
  try {
    return await Promise.race([handle(requestDb), deadline]);
  } finally {
    clearTimeout(timer);
    ctx.waitUntil(requestDb.close());
  }
}

/** Route loaders/actions read the request's client with `context.get(requestDbContext).db`. */
export const requestDbContext = createContext<RequestDb>();
