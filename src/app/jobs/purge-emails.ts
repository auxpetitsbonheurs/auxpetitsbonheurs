// Outbox payloads hold order ids and short reasons; after 90 days they are emptied (NFR-004,
// S-187 AC6). Runs once a day in the 03:00 Mauritius hour; newer rows are untouched.
import { and, lt, ne, sql } from "drizzle-orm";
import { emailOutbox } from "~/db/schema";
import { instantToMuDateTime } from "~/domain/time";
import type { JobContext, JobResult } from "./types";

export const RETENTION_DAYS = 90;
export const PURGE_HOUR = 3;

export async function purgeEmails({ db, now }: JobContext): Promise<JobResult> {
  if (Number(instantToMuDateTime(now).slice(11, 13)) !== PURGE_HOUR) return { job: "purgeEmails", ran: true, processed: 0 };
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .update(emailOutbox)
    .set({ payload: {} })
    .where(and(lt(emailOutbox.createdAt, cutoff), ne(emailOutbox.status, "pending"), sql`${emailOutbox.payload} <> '{}'::jsonb`))
    .returning({ id: emailOutbox.id });
  return { job: "purgeEmails", ran: true, processed: rows.length };
}
