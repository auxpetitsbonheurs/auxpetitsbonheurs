// Database timings per request: the connection and each query land in the Server-Timing of
// the request that made them, never another's, and without SQL.
import { describe, expect, test } from "vitest";
import { ServerTiming } from "./server-timing.server";
import { startDbTiming, withDbTiming } from "./db-timing.server";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fakeQuery(ms: number) {
  const done = startDbTiming("db-query");
  await pause(ms);
  done();
}

describe("withDbTiming", () => {
  test("each query's time goes to the request that made it", async () => {
    const a = new ServerTiming();
    const b = new ServerTiming();

    await Promise.all([
      withDbTiming(a, async () => {
        await fakeQuery(2);
        await fakeQuery(1);
      }),
      withDbTiming(b, () => fakeQuery(1)),
    ]);

    expect(a.header()).toMatch(/^db-query;dur=[\d.]+, db-query-2;dur=[\d.]+$/);
    expect(b.header()).toMatch(/^db-query;dur=[\d.]+$/);
  });

  test("the connection time is recorded as db-connect, once", async () => {
    const timing = new ServerTiming();
    await withDbTiming(timing, async () => {
      const done = startDbTiming("db-connect");
      await pause(2);
      done();
      done();
    });

    expect(timing.header()).toMatch(/^db-connect;dur=[\d.]+$/);
  });

  test("queries outside any request are ignored", async () => {
    await expect(fakeQuery(0)).resolves.toBeUndefined();
  });
});
