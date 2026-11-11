// With prepare: false, postgres.js describes any query with an untyped parameter before
// running it: one extra network round trip per query to the Supabase region. Strings sent
// as PostgreSQL's `unknown` type (oid 705) are typed by the server like a quoted literal,
// in the same round trip.
import { describe, expect, test } from "vitest";
import { UNKNOWN_OID, withUnknownStringParams } from "./pg-params.server";

class Typed {
  constructor(
    readonly value: unknown,
    readonly type: number,
  ) {}
}

function fakeSql() {
  const calls: { via: string; params: unknown[] }[] = [];
  const make = (via: string): Record<string, unknown> => ({
    unsafe: (query: string, params: unknown[] = []) => {
      calls.push({ via, params });
      return { query, params };
    },
    begin: async (...args: unknown[]) => (args.at(-1) as (tx: unknown) => unknown)(make(`${via}>tx`)),
    savepoint: async (...args: unknown[]) => (args.at(-1) as (tx: unknown) => unknown)(make(`${via}>sp`)),
    typed: (value: unknown, type: number) => new Typed(value, type),
    options: { parsers: {}, serializers: {} },
  });
  return { sql: make("root"), calls };
}

describe("withUnknownStringParams", () => {
  test("string parameters go out as unknown (705); numbers, nulls and others are left alone", () => {
    const { sql, calls } = fakeSql();
    const wrapped = withUnknownStringParams(sql as never) as unknown as { unsafe: (q: string, p: unknown[]) => unknown };

    wrapped.unsafe("select 1 where a = $1 and b = $2 and c = $3 and d = $4", ["cake", 2, null, true]);

    expect(calls[0]!.params).toEqual([new Typed("cake", UNKNOWN_OID), 2, null, true]);
    expect(UNKNOWN_OID).toBe(705);
  });

  test("inside transactions and savepoints too", async () => {
    const { sql, calls } = fakeSql();
    const wrapped = withUnknownStringParams(sql as never) as unknown as {
      begin: (cb: (tx: { unsafe: (q: string, p: unknown[]) => unknown; savepoint: (cb: (sp: { unsafe: (q: string, p: unknown[]) => unknown }) => unknown) => Promise<unknown> }) => unknown) => Promise<unknown>;
    };

    await wrapped.begin(async (tx) => {
      tx.unsafe("insert ...", ["a"]);
      await tx.savepoint((sp) => sp.unsafe("insert ...", ["b"]));
    });

    expect(calls.map((c) => c.via)).toEqual(["root>tx", "root>tx>sp"]);
    expect(calls.map((c) => c.params)).toEqual([[new Typed("a", UNKNOWN_OID)], [new Typed("b", UNKNOWN_OID)]]);
  });

  test("everything else (options, end) is the client's own", () => {
    const { sql } = fakeSql();
    expect((withUnknownStringParams(sql as never) as unknown as { options: unknown }).options).toBe(sql.options);
  });
});
