// keepAlive (S-020, contracts.md jobs): every hourly tick, touch the database and Auth so
// the free Supabase project never pauses for inactivity (NFR-005). Throws on failure; the
// dispatcher records it.
import { pingAuth, pingDatabase } from "~/server/health.server";
import type { JobContext, JobResult } from "./types";

export async function keepAlive({ db, supabase, fetch: fetchFn }: JobContext): Promise<JobResult> {
  await pingDatabase(db);
  await pingAuth(supabase, fetchFn);
  return { job: "keepAlive", ran: true, processed: 1 };
}
