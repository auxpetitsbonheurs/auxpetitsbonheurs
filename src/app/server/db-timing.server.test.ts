// Database timings per request from postgres.js diagnostics channels: the connection and
// each query land in the Server-Timing of the request that made them, never another's.
import diagnostics from "node:diagnostics_channel";
import { describe, expect, test } from "vitest";
import { ServerTiming } from "./server-timing.server";
import { withDbTiming } from "./db-timing.server";

const query = diagnostics.tracingChannel("postgres:query");
const connect = diagnostics.tracingChannel("postgres:connect");

/** Publishes what postgres.js publishes for one query (times from performance.now()). */
function fakeQuery(sent: number, complete: number, secret = "select email from customer where email = $1") {
  return query.tracePromise(async () => undefined, { query: secret, queued: sent, sent, firstByte: complete, complete } as never);
}

describe("withDbTiming", () => {
  test("each query's time goes to the request that made it, without its SQL", async () => {
    const a = new ServerTiming();
    const b = new ServerTiming();

    await Promise.all([
      withDbTiming(a, async () => {
        await fakeQuery(10, 30);
        await fakeQuery(40, 45);
      }),
      withDbTiming(b, () => fakeQuery(0, 100)),
    ]);

    expect(a.header()).toBe("db-query;dur=20, db-query-2;dur=5");
    expect(b.header()).toBe("db-query;dur=100");
    expect(a.header()).not.toMatch(/select|email/);
  });

  test("the connection time is recorded as db-connect", async () => {
    const timing = new ServerTiming();
    await withDbTiming(timing, () => connect.tracePromise(async () => new Promise((resolve) => setTimeout(resolve, 5)), { host: "pooler" } as never));

    expect(timing.header()).toMatch(/^db-connect;dur=\d+(\.\d)?$/);
  });

  test("queries outside any request are ignored", async () => {
    await expect(fakeQuery(0, 1)).resolves.toBeUndefined();
  });
});
