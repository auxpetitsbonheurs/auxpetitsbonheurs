// S-023: the generic fixed-window rate limiter over `rate_limit_bucket` (architecture
// "Cross-cutting": RL-auth = 5 per 15 min per email + IP), with a fixed clock.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Executor } from "~/server/db.server";
import { RL_AUTH, RL_REQUEST, RL_UPLOAD, consumeRateLimit, purgeRateLimitBuckets, rateLimitKey } from "./rate-limit.server";

let database: TestDatabase;
let db: Executor;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Executor;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const T0 = new Date("2026-11-12T08:01:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const subject = (email = "sarah@example.com", ip = "203.0.113.7") => ({ action: "admin.signIn", parts: [email, ip] });

async function attempts(n: number, now = T0, who = subject()) {
  const results = [];
  for (let i = 0; i < n; i += 1) results.push(await consumeRateLimit(db, RL_AUTH, who, now));
  return results;
}

describe("RL-auth: 5 per 15 minutes per email + IP", () => {
  test("AC1: the fifth attempt is allowed, the sixth is refused with the seconds to wait", async () => {
    const results = await attempts(6);

    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, retryAfterSeconds: 14 * 60 });
  });

  test("AC2: once the 15-minute window has passed the next attempt is allowed", async () => {
    await attempts(6);

    expect((await consumeRateLimit(db, RL_AUTH, subject(), at(13))).ok).toBe(false);
    expect(await consumeRateLimit(db, RL_AUTH, subject(), at(15))).toEqual({ ok: true });
  });

  test("AC3: different emails from the same IP have their own counts", async () => {
    await attempts(6, T0, subject("sarah@example.com"));

    expect((await consumeRateLimit(db, RL_AUTH, subject("other@example.com"), T0)).ok).toBe(true);
    expect((await consumeRateLimit(db, RL_AUTH, subject("sarah@example.com", "198.51.100.1"), T0)).ok).toBe(true);
  });

  test("AC4: the stored key is a SHA-256 hash of action, email and IP; no raw email or IP is written", async () => {
    await attempts(1);

    const { rows } = await database.client.query<{ key: string }>("select key from rate_limit_bucket");
    const hash = createHash("sha256").update("admin.signIn|sarah@example.com|203.0.113.7").digest("hex");
    expect(rows).toEqual([{ key: `admin.signIn:${hash}` }]);
    expect(rateLimitKey(subject())).toBe(`admin.signIn:${hash}`);
    const dump = JSON.stringify((await database.client.query("select * from rate_limit_bucket")).rows);
    expect(dump).not.toContain("sarah");
    expect(dump).not.toContain("203.0.113.7");
  });

  test("the email is compared without case or surrounding spaces", async () => {
    expect(rateLimitKey(subject(" Sarah@Example.com "))).toBe(rateLimitKey(subject("sarah@example.com")));
  });

  test("AC5: 20 concurrent attempts count exactly 20 and only 5 are allowed", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(db, RL_AUTH, subject(), T0)));

    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const { rows } = await database.client.query<{ count: number }>("select count from rate_limit_bucket");
    expect(rows).toEqual([{ count: 20 }]);
  });
});

describe("purgeRateLimitBuckets (AC7)", () => {
  test("deletes buckets older than one day and keeps newer ones", async () => {
    await consumeRateLimit(db, RL_AUTH, subject("old@example.com"), new Date("2026-11-10T07:00:00Z"));
    await consumeRateLimit(db, RL_AUTH, subject("recent@example.com"), new Date("2026-11-11T09:00:00Z"));

    const purged = await purgeRateLimitBuckets(db, new Date("2026-11-12T08:00:00Z"));

    expect(purged).toBe(1);
    const { rows } = await database.client.query<{ key: string }>("select key from rate_limit_bucket");
    expect(rows).toEqual([{ key: rateLimitKey(subject("recent@example.com")) }]);
  });
});

describe("RL-request and RL-upload per IP (S-162 AC2, AC3)", () => {
  const ip = (action: string) => ({ action, parts: ["198.51.100.20"] });

  test("AC2: three requests in 10 minutes pass, the fourth waits for the window", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consumeRateLimit(db, RL_REQUEST, ip("site.submitCustomRequest"), at(i)));
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3]).toEqual({ ok: false, retryAfterSeconds: expect.any(Number) });
    // T0 is 08:01: the 10-minute window ends at 08:10, 6 minutes after the 4th attempt (08:04).
    expect(results[3]).toEqual({ ok: false, retryAfterSeconds: 6 * 60 });
  });

  test("AC3: twenty upload URL requests pass, the twenty-first is refused; the two classes count apart", async () => {
    const results = [];
    for (let i = 0; i < 21; i += 1) results.push(await consumeRateLimit(db, RL_UPLOAD, ip("site.requestUploadUrls"), T0));
    expect(results.filter((r) => r.ok)).toHaveLength(20);
    expect(results[20]!.ok).toBe(false);
    expect((await consumeRateLimit(db, RL_REQUEST, ip("site.submitCustomRequest"), T0)).ok).toBe(true);
  });
});
