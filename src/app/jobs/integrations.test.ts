// Missing integrations are visible every hour (ADR-0002 amendment): one structured warn line
// per missing integration, names only; queued emails are counted while email is not set up.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { integrationsCheck } from "./integrations";

let database: TestDatabase;
const supabase = { url: "https://ref.supabase.co", anonKey: "anon" };
const SECRET = "fake-resend-key-never-logged";

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

async function queueEmail(dedupeKey: string, status = "pending") {
  await database.client.query(
    `insert into email_outbox (template, to_email, locale, payload, dedupe_key, status) values ('order_received', 'c@example.com', 'en', '{}', $1, $2)`,
    [dedupeKey, status],
  );
}

function run(env: Record<string, unknown>) {
  return integrationsCheck({ now: new Date("2026-11-15T22:00:00Z"), db: database.db as unknown as Database, supabase, env });
}

const warnLines = (log: { mock: { calls: unknown[][] } }): Record<string, unknown>[] =>
  log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

describe("integrationsCheck job", () => {
  test("email not configured: emails stay queued and the line says how many, naming the missing keys", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await queueEmail("a");
    await queueEmail("b");
    await queueEmail("c", "sent");

    const result = await run({ RESEND_API_KEY: SECRET });

    const email = warnLines(log).find((line) => line.integration === "email");
    expect(email).toEqual({
      level: "warn",
      event: "integration_missing",
      integration: "email",
      missing: ["EMAIL_FROM"],
      effect: "order emails stay queued in the outbox; nothing is sent",
      queuedEmails: 2,
    });
    expect(result).toEqual({ job: "integrations", ran: true, processed: 5 });
    const { rows } = await database.client.query<{ n: number }>("select count(*)::int as n from email_outbox where status = 'pending'");
    expect(rows[0]!.n).toBe(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
  });

  test("everything configured: no warn line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = {
      RESEND_API_KEY: SECRET, EMAIL_FROM: "x", VAPID_PUBLIC_KEY: "x", VAPID_PRIVATE_KEY: "x", VAPID_SUBJECT: "x",
      SUPABASE_AUTH_HOOK_SECRET: "x", TURNSTILE_SITE_KEY: "x", TURNSTILE_SECRET_KEY: "x", SENTRY_DSN: "https://k@o0.ingest.sentry.io/0",
    };

    expect(await run(env)).toEqual({ job: "integrations", ran: true, processed: 0 });
    expect(log).not.toHaveBeenCalled();
  });
});
