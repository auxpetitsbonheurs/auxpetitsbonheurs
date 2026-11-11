// Database timings for Server-Timing, from the diagnostics channels postgres.js publishes on
// (`postgres:connect`, `postgres:query`). AsyncLocalStorage ties each event to the request
// that caused it, so concurrent requests in one isolate never mix. Only durations are kept:
// the SQL text and parameters on the channel context are never read.
import { AsyncLocalStorage } from "node:async_hooks";
import diagnostics from "node:diagnostics_channel";
import type { ServerTiming } from "./server-timing.server";

const requestTiming = new AsyncLocalStorage<ServerTiming>();
const started = new WeakMap<object, { timing: ServerTiming; at: number }>();
let subscribed = false;

interface QueryContext {
  sent?: number | null;
  complete?: number | null;
}

/** Fills `ctx` start bookkeeping for the request in scope; settled events record a duration. */
function track(channel: string, record: (ctx: object, from: { timing: ServerTiming; at: number }) => void) {
  const settle = (ctx: object) => {
    const from = started.get(ctx);
    if (!from) return;
    started.delete(ctx);
    record(ctx, from);
  };
  diagnostics.tracingChannel(channel).subscribe({
    start(ctx: unknown) {
      const timing = requestTiming.getStore();
      if (timing) started.set(ctx as object, { timing, at: performance.now() });
    },
    end() {},
    asyncStart() {},
    asyncEnd: (ctx: unknown) => settle(ctx as object),
    error: (ctx: unknown) => settle(ctx as object),
  });
}

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  track("postgres:connect", (_ctx, from) => from.timing.add("db-connect", performance.now() - from.at));
  track("postgres:query", (ctx, from) => {
    const { sent, complete } = ctx as QueryContext;
    // sent -> complete is the wire time; fall back to our own clock if the driver gave none.
    const duration = typeof sent === "number" && typeof complete === "number" ? complete - sent : performance.now() - from.at;
    from.timing.add("db-query", duration);
  });
}

/** Runs one request's work with its database events recorded into `timing`. */
export function withDbTiming<T>(timing: ServerTiming, work: () => T): T {
  subscribe();
  return requestTiming.run(timing, work);
}
