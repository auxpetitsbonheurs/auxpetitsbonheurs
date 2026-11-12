// Hourly retry of Storage removals that failed (S-045 AC6): up to 100 queued objects per
// tick, grouped by bucket; removed ones leave the queue, failures count an attempt and wait
// for the next tick. Never throws for a Storage failure (the dispatcher logs the result).
import { and, eq, inArray, sql } from "drizzle-orm";
import { storagePurge } from "~/db/schema";
import { type StorageGateway, supabaseStorage } from "~/server/storage.server";
import type { JobContext, JobResult } from "./types";

export const PURGE_BATCH = 100;

function gatewayFor(context: JobContext): StorageGateway | null {
  const key = context.env?.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== "string" || key === "") return null;
  return supabaseStorage({ url: context.supabase.url, serviceRoleKey: key, fetch: context.fetch });
}

export async function purgeStorage(context: JobContext, storage: StorageGateway | null = gatewayFor(context)): Promise<JobResult> {
  const queued = await context.db.select({ bucket: storagePurge.bucket, path: storagePurge.path }).from(storagePurge).orderBy(storagePurge.createdAt).limit(PURGE_BATCH);
  if (queued.length === 0) return { job: "purgeStorage", ran: true, processed: 0 };
  if (!storage) return { job: "purgeStorage", ran: false, error: "no Storage key configured" };
  let processed = 0;
  for (const bucket of new Set(queued.map((q) => q.bucket))) {
    const paths = queued.filter((q) => q.bucket === bucket).map((q) => q.path);
    const inBucket = and(eq(storagePurge.bucket, bucket), inArray(storagePurge.path, paths));
    try {
      await storage.remove(bucket, paths);
      await context.db.delete(storagePurge).where(inBucket);
      processed += paths.length;
    } catch (error) {
      const lastError = error instanceof Error ? error.message.slice(0, 200) : "unknown";
      await context.db.update(storagePurge).set({ attempts: sql`least(${storagePurge.attempts} + 1, 32767)`, lastError }).where(inBucket);
    }
  }
  return { job: "purgeStorage", ran: true, processed };
}
