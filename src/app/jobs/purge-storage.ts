// Hourly retry of Storage removals that failed (S-045 AC6): up to 100 queued objects per
// tick, grouped by bucket; removed ones leave the queue, failures count an attempt and wait
// for the next tick. Never throws for a Storage failure (the dispatcher logs the result).
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { storagePurge } from "~/db/schema";
import { REQUEST_PHOTOS_BUCKET } from "~/domain/custom-request";
import { withVariantPaths } from "~/domain/upload";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import { type StorageGateway, supabaseStorage } from "~/server/storage.server";
import type { JobContext, JobResult } from "./types";

export const PURGE_BATCH = 100;

function gatewayFor(context: JobContext): StorageGateway | null {
  const key = context.env?.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof key !== "string" || key === "") return null;
  return supabaseStorage({ url: context.supabase.url, serviceRoleKey: key, fetch: context.fetch });
}

/**
 * Request photos an order took are never removed (S-153 AC7): submit drops their queue rows in
 * its transaction; this also drops any row whose path an order holds, before anything is removed.
 */
async function dropAttached(context: JobContext): Promise<void> {
  await context.db.execute(sql`
    delete from ${storagePurge} q using custom_request_photo p
    where q.bucket = ${REQUEST_PHOTOS_BUCKET} and q.path = p.storage_path
  `);
}

export async function purgeStorage(context: JobContext, storage: StorageGateway | null = gatewayFor(context)): Promise<JobResult> {
  await dropAttached(context);
  // Due rows only (0016): a customer's upload waits 24 h for its request to be sent.
  const queued = await context.db
    .select({ bucket: storagePurge.bucket, path: storagePurge.path })
    .from(storagePurge)
    .where(lte(storagePurge.dueAt, context.now))
    .orderBy(storagePurge.createdAt)
    .limit(PURGE_BATCH);
  if (queued.length === 0) return { job: "purgeStorage", ran: true, processed: 0 };
  if (!storage) return { job: "purgeStorage", ran: false, error: "no Storage key configured" };
  let processed = 0;
  for (const bucket of new Set(queued.map((q) => q.bucket))) {
    const paths = queued.filter((q) => q.bucket === bucket).map((q) => q.path);
    const inBucket = and(eq(storagePurge.bucket, bucket), inArray(storagePurge.path, paths));
    try {
      // Queued originals take their smaller copies with them (S-276; missing ones are a no-op).
      await storage.remove(bucket, bucket === PUBLIC_IMAGES_BUCKET ? withVariantPaths(paths) : paths);
      await context.db.delete(storagePurge).where(inBucket);
      processed += paths.length;
    } catch (error) {
      const lastError = error instanceof Error ? error.message.slice(0, 200) : "unknown";
      await context.db.update(storagePurge).set({ attempts: sql`least(${storagePurge.attempts} + 1, 32767)`, lastError }).where(inBucket);
    }
  }
  return { job: "purgeStorage", ran: true, processed };
}
