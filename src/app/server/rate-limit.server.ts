// Fixed-window rate limits in Postgres (architecture "Cross-cutting", data-model
// `rate_limit_bucket`; no new infrastructure: the Free plan's database already holds the
// table). Generic over a class (max per window) and a subject (action + identifying
// parts); RL-order and RL-track reuse it in E-05. Keys are SHA-256 hashes, never the raw
// email or IP (NFR-004). The increment is one atomic upsert, so concurrent attempts
// are all counted.
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { rateLimitBucket } from "~/db/schema";
import type { Executor } from "~/server/db.server";

export interface RateLimitClass {
  name: string;
  max: number;
  windowMs: number;
}

/** Sign-in, sign-in link and password reset: 5 per 15 minutes per email + IP. */
export const RL_AUTH: RateLimitClass = { name: "RL-auth", max: 5, windowMs: 15 * 60 * 1000 };

/** Buckets are kept one day, then purged (data-model retention "Rate-limit keys"). */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface RateLimitSubject {
  /** What is limited, e.g. `admin.signIn`; part of the key so actions never share a count. */
  action: string;
  /** Identifying values (email, IP); trimmed and lower-cased before hashing. */
  parts: string[];
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** `<action>:<sha256(action|part|part...)>` */
export function rateLimitKey(subject: RateLimitSubject): string {
  const material = [subject.action, ...subject.parts.map((part) => part.trim().toLowerCase())].join("|");
  return `${subject.action}:${createHash("sha256").update(material).digest("hex")}`;
}

/** Counts this attempt and says whether it may go ahead (the `max`-th still may). */
export async function consumeRateLimit(db: Executor, limit: RateLimitClass, subject: RateLimitSubject, now: Date): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / limit.windowMs) * limit.windowMs);
  const [row] = await db
    .insert(rateLimitBucket)
    .values({ key: rateLimitKey(subject), windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimitBucket.key, rateLimitBucket.windowStart], set: { count: sql`${rateLimitBucket.count} + 1` } })
    .returning({ count: rateLimitBucket.count });
  if ((row?.count ?? 1) <= limit.max) return { ok: true };
  const retryAfterMs = windowStart.getTime() + limit.windowMs - now.getTime();
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

/** Deletes buckets whose window started more than a day before `now`; returns how many. */
export async function purgeRateLimitBuckets(db: Executor, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);
  const deleted = await db.delete(rateLimitBucket).where(lt(rateLimitBucket.windowStart, cutoff)).returning({ key: rateLimitBucket.key });
  return deleted.length;
}
