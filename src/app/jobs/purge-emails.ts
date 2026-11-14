// Outbox rows hold an address, order ids and short reasons. After 90 days a finished row keeps
// none of it (NFR-004, S-187 AC6, PRV-01): the payload is emptied and the recipient cleared. The
// row stays (status, dates, provider id) so its dedupe key still blocks a second send; pending
// rows are never touched (they may still go out). Runs once a day in the 03:00 Mauritius hour.
import { and, lt, ne, or, sql } from "drizzle-orm";
import { emailOutbox } from "~/db/schema";
import { instantToMuDateTime } from "~/domain/time";
import type { JobContext, JobResult } from "./types";

export const RETENTION_DAYS = 90;
export const PURGE_HOUR = 3;
/** What a purged row holds instead of an address (`to_email` is NOT NULL; an empty string is never sendable). */
export const CLEARED_RECIPIENT = "";

export async function purgeEmails({ db, now }: JobContext): Promise<JobResult> {
  if (Number(instantToMuDateTime(now).slice(11, 13)) !== PURGE_HOUR) return { job: "purgeEmails", ran: true, processed: 0 };
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .update(emailOutbox)
    .set({ payload: {}, toEmail: CLEARED_RECIPIENT })
    .where(
      and(
        lt(emailOutbox.createdAt, cutoff),
        ne(emailOutbox.status, "pending"),
        or(sql`${emailOutbox.payload} <> '{}'::jsonb`, ne(emailOutbox.toEmail, CLEARED_RECIPIENT)),
      ),
    )
    .returning({ id: emailOutbox.id });
  return { job: "purgeEmails", ran: true, processed: rows.length };
}
