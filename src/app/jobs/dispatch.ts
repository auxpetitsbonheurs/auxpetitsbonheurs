// Hourly Cron Trigger -> due jobs (architecture "Scheduled jobs", S-020 AC4). Each job runs
// in turn; a failing job is recorded and logged, the others still run, and the dispatcher
// never throws. Later epics add their jobs (with their own "due" rules) to JOBS.
import { createRequestDb } from "~/server/db.server";
import { getEnv } from "~/server/env.server";
import { pushConfigFromEnv } from "~/server/push/push.server";
import { eveningReminder } from "./evening-reminder";
import { pendingAlerts } from "./pending-alerts";
import { expireQuotes } from "./expire-quotes";
import { integrationsCheck } from "./integrations";
import { keepAlive } from "./keep-alive";
import { paymentDeadlines } from "./payment-deadlines";
import { purgeRateLimits } from "./purge-rate-limits";
import { purgeEmails } from "./purge-emails";
import { purgeStorage } from "./purge-storage";
import { retryEmails } from "./retry-emails";
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
  // Juice payment (S-280): 12 h reminder, 24 h unpaid cancel.
  { name: "paymentDeadlines", run: paymentDeadlines },
  { name: "expireQuotes", run: expireQuotes },
  // Notifications (E-10): after the jobs that queue emails, so one tick can send what it queued.
  { name: "retryEmails", run: retryEmails },
  { name: "purgeEmails", run: purgeEmails },
  // E-10 admin pushes (S-200, S-198): each is idempotent on its own marker or run key.
  { name: "pendingAlerts", run: pendingAlerts },
  { name: "eveningReminder", run: eveningReminder },
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
    const context: JobContext = {
      now,
      db: requestDb.db,
      supabase: { url: settings.SUPABASE_URL, anonKey: settings.SUPABASE_ANON_KEY },
      env: settings,
      // VAPID tokens are dated from the tick (S-196); null while the keys are not set.
      pusher: pushConfigFromEnv(settings, () => now).pusher,
    };
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
