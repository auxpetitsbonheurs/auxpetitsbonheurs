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

/** Placing an order (checkout spec step 3, S-228 AC2): 5 per 10 minutes per IP, with a verified Turnstile token or without Turnstile keys (S-091 AC8). */
export const RL_ORDER: RateLimitClass = { name: "RL-order", max: 5, windowMs: 10 * 60 * 1000 };

/** Custom cake requests (S-162 AC2): 3 per 10 minutes per IP. */
export const RL_REQUEST: RateLimitClass = { name: "RL-request", max: 3, windowMs: 10 * 60 * 1000 };

/** Upload URLs for request photos (S-162 AC3): 20 per 10 minutes per IP. */
export const RL_UPLOAD: RateLimitClass = { name: "RL-upload", max: 20, windowMs: 10 * 60 * 1000 };

/** Customer sign-up and Save my details: 3 per hour per IP (customer-accounts spec, RL-signup). */
export const RL_SIGNUP: RateLimitClass = { name: "RL-signup", max: 3, windowMs: 60 * 60 * 1000 };

/** One confirmation or sign-in email per address per minute (S-206 AC7, S-208 AC5: "resend after 60 s"). */
export const RL_EMAIL_RESEND: RateLimitClass = { name: "RL-email-resend", max: 1, windowMs: 60 * 1000 };

/** Posting or editing a review: 5 per hour per account (S-262 AC8). */
export const RL_REVIEW: RateLimitClass = { name: "RL-review", max: 5, windowMs: 60 * 60 * 1000 };
/**
 * Place order that Turnstile could not vouch for (no token: no JavaScript or a blocked script;
 * Cloudflare unreachable; a stale token): allowed, with a stricter limit on the same count (S-091 AC8).
 */
export const RL_ORDER_UNVERIFIED: RateLimitClass = { name: "RL-order-unverified", max: 3, windowMs: 10 * 60 * 1000 };

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

/** Tracking page and its actions (FR-026, S-094 AC4): 60 requests per 10 minutes per IP. */
export const RL_TRACK: RateLimitClass = { name: "RL-track", max: 60, windowMs: 10 * 60 * 1000 };

/** The bucket this attempt counts in, for a caller that counts inside its own statement (one round trip). */
export function rateLimitBucketFor(limit: RateLimitClass, subject: RateLimitSubject, now: Date): { key: string; windowStart: Date } {
  return { key: rateLimitKey(subject), windowStart: new Date(Math.floor(now.getTime() / limit.windowMs) * limit.windowMs) };
}

/** The answer for a count already taken in `bucket` (see `rateLimitBucketFor`). */
export function rateLimitVerdict(limit: RateLimitClass, windowStart: Date, count: number, now: Date): RateLimitResult {
  if (count <= limit.max) return { ok: true };
  const retryAfterMs = windowStart.getTime() + limit.windowMs - now.getTime();
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
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
