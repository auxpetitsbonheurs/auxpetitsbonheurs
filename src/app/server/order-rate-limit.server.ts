// RL-order (checkout spec "placeOrder pipeline" step 3, S-228 AC2): 5 orders per 10 minutes per IP.
// Step 2 comes first: a replay of a placed order's idempotency key (double tap, refresh, Back and
// resend) is never counted or refused, so one statement checks the key and counts the attempt
// only when it is new (one database round trip, like the plain limiter).
import { sql } from "drizzle-orm";
import type { Executor } from "~/server/db.server";
import { Uuid } from "~/server/contracts/shared";
import { RL_ORDER, type RateLimitResult, rateLimitBucketFor, rateLimitVerdict } from "~/server/rate-limit.server";

export async function consumeOrderRateLimit(db: Executor, ip: string, idempotencyKey: unknown, now: Date): Promise<RateLimitResult> {
  const { key, windowStart } = rateLimitBucketFor(RL_ORDER, { action: "site.placeOrder", parts: [ip] }, now);
  const known = Uuid.safeParse(idempotencyKey);
  // Not a uuid: placeOrder refuses it anyway; it still counts.
  const replay = known.success ? sql`exists (select 1 from orders where idempotency_key = ${known.data}::uuid)` : sql`false`;
  const { rows } = (await db.execute(sql`
    with replay as (select ${replay} as yes),
    counted as (
      insert into rate_limit_bucket (key, window_start, count)
      select ${key}, ${windowStart.toISOString()}::timestamptz, 1 from replay where not replay.yes
      on conflict (key, window_start) do update set count = rate_limit_bucket.count + 1
      returning count
    )
    select (select count from counted) as count`)) as unknown as { rows: { count: number | null }[] };
  const count = rows[0]?.count ?? null;
  return count === null ? { ok: true } : rateLimitVerdict(RL_ORDER, windowStart, Number(count), now);
}
