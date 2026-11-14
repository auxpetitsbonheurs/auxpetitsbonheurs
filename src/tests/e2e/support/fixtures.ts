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

/**
 * Sessions that wait on a lock, sit idle inside a transaction, or have had a transaction open
 * for over 3 s, with the pids blocking them (production/tech-debt.md "Query read timeout"). Query
 * text only (parameters are `$n`, never values). Bounded: a stuck connection never hangs teardown.
 */
async function postgresActivity(sql: postgres.Sql): Promise<unknown[]> {
  const report = sql`
    select pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) as blocked_by,
      extract(epoch from now() - xact_start)::int as xact_seconds, left(query, 200) as query
    from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()
      and (wait_event_type = 'Lock' or state like 'idle in transaction%' or now() - xact_start > interval '3 seconds')`;
  const timeout = new Promise<unknown[]>((resolve) => setTimeout(() => resolve([{ error: "activity query timed out" }]), 3_000));
  return Promise.race([report.then((rows) => [...rows]), timeout]).catch((error: unknown) => [{ error: String(error) }]);
}

export const test = base.extend<{ lockReport: void }, { db: postgres.Sql }>({
  // On a failed test, what Postgres was waiting on (CI showed one "Query read timeout" stall on
  // admin sign-in and an order action; tech-debt). Printed to the log and attached to the report.
  lockReport: [
    async ({ db }, use, testInfo) => {
      await use();
      if (testInfo.status === testInfo.expectedStatus) return;
      const rows = await postgresActivity(db);
      if (rows.length === 0) return;
      console.log(JSON.stringify({ event: "e2e_postgres_activity", test: testInfo.titlePath.join(" › "), rows }));
      await testInfo.attach("postgres-activity.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
    },
    { auto: true },
  ],
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
