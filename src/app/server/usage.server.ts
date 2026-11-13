// Server-side usage counters (S-217, customer-accounts spec "Analytics Events", NFR-011): no
// cookie, no third-party script, no personal data. Each call adds 1 to the row for
// (Mauritius day, event, props) after the response is ready; a failed write is logged with
// the event name only and never fails the visitor's action (AC4).
import { sql } from "drizzle-orm";
import { usageCounter } from "~/db/schema";
import { todayMU } from "~/domain/time";
import { afterResponseContext } from "~/server/after-response.server";
import type { GuardArgs } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { type Executor, requestDbContext } from "~/server/db.server";

/** The events and the only properties each may carry (spec table; AC1, AC2). */
export const USAGE_EVENTS = {
  account_created: ["method", "linkedOrders"],
  sign_in: ["method"],
  save_details_shown: [],
  save_details_completed: [],
  reorder_started: ["skippedCount"],
  address_saved: ["atCheckout"],
} as const satisfies Record<string, readonly string[]>;

export type UsageEvent = keyof typeof USAGE_EVENTS;
export type UsageProps = Record<string, string | number | boolean>;

/** `k=v;k=v` of the allowed properties only, sorted; values are short scalars (never free text). */
export function usageProps(event: UsageEvent, props: UsageProps = {}): string {
  const allowed = USAGE_EVENTS[event] as readonly string[];
  return Object.keys(props)
    .filter((key) => allowed.includes(key))
    .sort()
    .map((key) => `${key}=${String(props[key]).slice(0, 20).replace(/[^A-Za-z0-9_.-]/g, "")}`)
    .join(";");
}

/** One upsert: the count for today's row goes up by one. */
export async function incrementUsage(db: Executor, now: Date, event: UsageEvent, props: UsageProps = {}): Promise<void> {
  await db
    .insert(usageCounter)
    .values({ day: todayMU(now), event, props: usageProps(event, props), count: 1 })
    .onConflictDoUpdate({ target: [usageCounter.day, usageCounter.event, usageCounter.props], set: { count: sql`${usageCounter.count} + 1` } });
}

/** Counts `event` after the response (never in the visitor's way); failures are logged without PII. */
export function recordUsage(args: Pick<GuardArgs, "context">, event: UsageEvent, props: UsageProps = {}): Promise<void> {
  const db = args.context.get(requestDbContext).db;
  const now = args.context.get(clockContext).now();
  const write = () =>
    incrementUsage(db, now, event, props).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", event: "usage_count_failed", usage: event, error: error instanceof Error ? error.name : "unknown" }));
    });
  let after;
  try {
    after = args.context.get(afterResponseContext);
  } catch {
    after = undefined;
  }
  if (after) {
    after.defer("usage_count", write);
    return Promise.resolve();
  }
  return write();
}
