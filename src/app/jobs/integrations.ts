// integrations (ADR-0002 amendment): every hourly tick, one structured warn line per missing
// integration (key NAMES only), so a Worker running on the core secrets alone says what is
// off. While email is not configured, outbox rows stay pending (nothing sends them) and the
// line counts them; sending itself arrives with E-10 and checks integrationConfigured too.
import { count, eq } from "drizzle-orm";
import { emailOutbox } from "~/db/schema";
import { INTEGRATIONS, missingKeys } from "~/lib/integrations";
import type { Database } from "~/server/db.server";
import type { JobContext, JobResult } from "./types";

async function queuedEmails(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(emailOutbox).where(eq(emailOutbox.status, "pending"));
  return row?.n ?? 0;
}

export async function integrationsCheck({ db, env = {} }: JobContext): Promise<JobResult> {
  let missing = 0;
  for (const integration of INTEGRATIONS) {
    const keys = missingKeys(env, integration.name);
    if (keys.length === 0) continue;
    missing += 1;
    const line: Record<string, unknown> = {
      level: "warn",
      event: "integration_missing",
      integration: integration.name,
      missing: keys,
      effect: integration.whenMissing,
    };
    if (integration.name === "email") line.queuedEmails = await queuedEmails(db);
    console.log(JSON.stringify(line));
  }
  return { job: "integrations", ran: true, processed: missing };
}
