import type { Database } from "~/server/db.server";
import type { SupabaseEndpoint } from "~/server/health.server";
import type { Pusher } from "~/server/push/push.server";

/** What every scheduled job receives (architecture "Scheduled jobs"). */
export interface JobContext {
  /** The tick's scheduled time; jobs compute Mauritius dates from it, never from the system clock. */
  now: Date;
  db: Database;
  supabase: SupabaseEndpoint;
  fetch?: typeof fetch;
  /** The validated bindings, for jobs that check which optional integrations are configured. */
  env?: Readonly<Record<string, unknown>>;
  /** Web Push sender (S-196); absent or null while the VAPID keys are not set (push jobs no-op). */
  pusher?: Pusher | null;
}

export type JobResult = { job: string; ran: true; processed: number } | { job: string; ran: false; error: string };
