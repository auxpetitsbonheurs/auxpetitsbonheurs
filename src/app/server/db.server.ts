// One database client per request (architecture.md#data, NFR-005, NFR-013):
// postgres.js over the Supavisor transaction pooler, one connection, no prepared
// statements (the pooler cannot keep them), closed via ctx.waitUntil after the response.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createContext } from "react-router";
import * as schema from "~/db/schema";

export const CONNECTION_OPTIONS = { max: 1, prepare: false } as const;

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
  try {
    return await handle(requestDb);
  } finally {
    ctx.waitUntil(requestDb.close());
  }
}

/** Route loaders/actions read the request's client with `context.get(requestDbContext).db`. */
export const requestDbContext = createContext<RequestDb>();
