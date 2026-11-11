// Hourly purge of rate-limit buckets older than one day (data-model retention
// "Rate-limit keys"; architecture "purge" job). One indexed delete on the primary key.
import { purgeRateLimitBuckets } from "~/server/rate-limit.server";
import type { JobContext, JobResult } from "./types";

export async function purgeRateLimits(context: JobContext): Promise<JobResult> {
  const processed = await purgeRateLimitBuckets(context.db, context.now);
  return { job: "purgeRateLimits", ran: true, processed };
}
