// Hourly Cron Trigger -> due jobs (architecture "Scheduled jobs", S-020 AC4). Each job runs
// in turn; a failing job is recorded and logged, the others still run, and the dispatcher
// never throws. Later epics add their jobs (with their own "due" rules) to JOBS.
import { createRequestDb } from "~/server/db.server";
import { getEnv } from "~/server/env.server";
import { integrationsCheck } from "./integrations";
import { keepAlive } from "./keep-alive";
import { purgeRateLimits } from "./purge-rate-limits";
import { purgeStorage } from "./purge-storage";
import type { JobContext, JobResult } from "./types";

export type { JobContext, JobResult } from "./types";

export interface Job {
  name: string;
  run: (context: JobContext) => Promise<JobResult>;
}

export const JOBS: readonly Job[] = [
  { name: "keepAlive", run: keepAlive },
  { name: "integrations", run: integrationsCheck },
  { name: "purgeRateLimits", run: purgeRateLimits },
  { name: "purgeStorage", run: (context) => purgeStorage(context) },
];

/** Error name and message with any URL (it could carry credentials) replaced. */
function safeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : "Error: unknown";
  return text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]");
}

function logResult(result: JobResult): void {
  console.log(JSON.stringify({ level: result.ran ? "info" : "error", event: "job", ...result }));
}

async function runJob(job: Job, context: JobContext): Promise<JobResult> {
  try {
    return await job.run(context);
  } catch (error) {
    return { job: job.name, ran: false, error: safeError(error) };
  }
}

export async function dispatch(now: Date, env: object, ctx: Pick<ExecutionContext, "waitUntil">, jobs: readonly Job[] = JOBS): Promise<JobResult[]> {
  let settings;
  try {
    settings = getEnv(env);
  } catch (error) {
    const failed: JobResult = { job: "dispatch", ran: false, error: safeError(error) };
    logResult(failed);
    return [failed];
  }
  const requestDb = createRequestDb(settings.DATABASE_URL);
  try {
    const context: JobContext = { now, db: requestDb.db, supabase: { url: settings.SUPABASE_URL, anonKey: settings.SUPABASE_ANON_KEY }, env: settings };
    const results: JobResult[] = [];
    for (const job of jobs) {
      const result = await runJob(job, context);
      logResult(result);
      results.push(result);
    }
    return results;
  } finally {
    ctx.waitUntil(requestDb.close());
  }
}
