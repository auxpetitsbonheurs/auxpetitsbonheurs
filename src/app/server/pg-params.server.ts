// postgres.js 4 with `prepare: false` (Supavisor transaction pooler) describes every query that
// has an untyped parameter before running it: Parse/Describe, wait, then Bind/Execute. That is
// one extra round trip to the Supabase region per query (staging: ~190 ms each). Strings sent
// as PostgreSQL's `unknown` type (oid 705) are resolved by the server exactly like a quoted
// literal in the statement, so the query runs in one round trip. Values stay parameters (never
// spliced into SQL). Numbers are already sent without a describe; other values are left alone.
import type postgres from "postgres";

export const UNKNOWN_OID = 705;

type Sql = postgres.Sql | postgres.TransactionSql;

function withUnknownStrings(sql: Sql, params: unknown): unknown {
  if (!Array.isArray(params)) return params;
  return params.map((value: unknown) => (typeof value === "string" ? sql.typed(value as never, UNKNOWN_OID) : value));
}

/** Wraps a callback's transaction/savepoint client the same way. */
function wrapLast(args: unknown[], root: Sql): unknown[] {
  const callback = args.at(-1);
  if (typeof callback !== "function") return args;
  return [...args.slice(0, -1), (tx: Sql) => (callback as (tx: Sql) => unknown)(wrap(tx, root))];
}

function wrap<T extends Sql>(sql: T, root: Sql): T {
  return new Proxy(sql, {
    get(target, property, receiver) {
      if (property === "unsafe") {
        return (query: string, params?: unknown, options?: unknown) =>
          (target.unsafe as (q: string, p?: unknown, o?: unknown) => unknown)(query, withUnknownStrings(root, params), options);
      }
      if (property === "begin" || property === "savepoint") {
        const method = Reflect.get(target, property, receiver) as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => method.apply(target, wrapLast(args, root));
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/** The client drizzle uses: string parameters typed `unknown`, so no describe round trip. */
export function withUnknownStringParams<T extends postgres.Sql>(sql: T): T {
  return wrap(sql, sql);
}
