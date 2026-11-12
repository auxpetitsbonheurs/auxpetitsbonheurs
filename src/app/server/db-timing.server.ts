// Database timings for Server-Timing (ADR-0003 amendments 2 and 3). The node-postgres client
// in db.server.ts reports each connection and query with `recordDbTiming`; AsyncLocalStorage
// ties it to the request that caused it, so concurrent requests in one isolate never mix.
// Only durations are kept: SQL text and parameters never reach this module.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ServerTiming } from "./server-timing.server";

const requestTiming = new AsyncLocalStorage<ServerTiming>();

export type DbTimingName = "db-connect" | "db-query";

/** The request's timing in scope (undefined in jobs, scripts and tests). Capture it before awaiting. */
export function currentDbTiming(): ServerTiming | undefined {
  return requestTiming.getStore();
}

/** Starts a measurement for the request in scope; the returned function records it once. */
export function startDbTiming(name: DbTimingName): () => void {
  const timing = requestTiming.getStore();
  if (!timing) return () => {};
  const at = performance.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    timing.add(name, performance.now() - at);
  };
}

/** Runs one request's work with its database events recorded into `timing`. */
export function withDbTiming<T>(timing: ServerTiming, work: () => T): T {
  return requestTiming.run(timing, work);
}
