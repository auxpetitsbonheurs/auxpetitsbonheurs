// The `test` every e2e spec imports: Playwright's, plus a per-worker database
// connection for specs that create their own data (S-005 AC4).
import { randomInt } from "node:crypto";
import { test as base } from "@playwright/test";
import type postgres from "postgres";
import { connectE2eDatabase } from "./database";

/** A documentation-range IPv4 address (198.18.0.0/15, benchmarking) unique enough per test. */
export function testIp(): string {
  const n = randomInt(0, 2 ** 17);
  return `198.${18 + (n >> 16)}.${(n >> 8) & 255}.${n & 255}`;
}

export const test = base.extend<object, { db: postgres.Sql }>({
  // Each test is its own visitor IP (CF-Connecting-IP, which Cloudflare sets in production),
  // so the sign-in rate limit (RL-auth, per email + IP) never couples parallel tests (S-023).
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
    await provide({ "cf-connecting-ip": testIp(), ...extraHTTPHeaders });
  },
  db: [
    // Playwright requires an object pattern here, even when no fixtures are used.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const sql = connectE2eDatabase();
      await use(sql);
      await sql.end();
    },
    { scope: "worker" },
  ],
});

export { type Page, expect } from "@playwright/test";
