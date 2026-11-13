// `retryEmails` (S-186, FR-074): the hourly tick sends every due outbox row, at most 50, with
// the backoff and the daily cap of process-outbox. It shares the one hourly Cron Trigger
// (wrangler.jsonc); rows are normally sent right after their request, so this mops up retries
// and anything queued while email was not set up. No due rows: processed 0, no error.
import { mailerFromEnv, siteUrlFromEnv } from "~/server/email/mailer-config.server";
import { processOutbox } from "~/server/email/process-outbox.server";
import type { JobContext, JobResult } from "./types";

export const EMAILS_PER_TICK = 50;

export async function retryEmails(context: JobContext): Promise<JobResult> {
  const env = context.env ?? {};
  const report = await processOutbox(context.db, {
    now: context.now,
    mailer: mailerFromEnv(env, context.fetch),
    siteUrl: siteUrlFromEnv(env),
    limit: EMAILS_PER_TICK,
  });
  return { job: "retryEmails", ran: true, processed: report.sent + report.failed + report.dead + report.deferred };
}
