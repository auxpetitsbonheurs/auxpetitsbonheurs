import type { Database } from "~/server/db.server";
import type { SupabaseEndpoint } from "~/server/health.server";

/** What every scheduled job receives (architecture "Scheduled jobs"). */
export interface JobContext {
  /** The tick's scheduled time; jobs compute Mauritius dates from it, never from the system clock. */
  now: Date;
  db: Database;
  supabase: SupabaseEndpoint;
  fetch?: typeof fetch;
  /** The validated bindings, for jobs that check which optional integrations are configured. */
  env?: Readonly<Record<string, unknown>>;
}

export type JobResult = { job: string; ran: true; processed: number } | { job: string; ran: false; error: string };
