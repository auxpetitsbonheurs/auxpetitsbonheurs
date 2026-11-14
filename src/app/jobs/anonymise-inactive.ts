// Retention (PRV-02; data-model "Customer personal"; NFR-004): once a month, guests whose last
// order (placed or fulfilled) is older than RETENTION.orderYears are anonymised with the same
// statement as the Owner's action; orders and totals stay. The period is the one the privacy
// note states (domain/privacy-facts), a proposed default until the Owner confirms it.
// Accounts are kept until deleted (PRV-04), so customers with a sign-in are skipped.
// Runs on the hourly tick of the 1st of each month (Mauritius), in batches, so a missed or
// failed tick is caught up the next hour; already anonymised rows are never touched again.
import { sql } from "drizzle-orm";
import { RETENTION } from "~/domain/privacy-facts";
import { muDateTimeToInstant, todayMU } from "~/domain/time";
import { anonymiseWhere } from "~/server/services/anonymise-customer.server";
import type { JobContext, JobResult } from "./types";

export const ANONYMISE_BATCH = 100;

/** Mauritius midnight, RETENTION.orderYears before today (29 Feb falls back to 28 Feb). */
export function retentionCutoff(now: Date): Date {
  const [year, month, day] = todayMU(now).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year - RETENTION.orderYears, month - 1, day));
  if (target.getUTCMonth() !== month - 1) target.setUTCDate(0);
  return muDateTimeToInstant(target.toISOString().slice(0, 10), "00:00");
}

export async function anonymiseInactive({ db, now }: JobContext, batch = ANONYMISE_BATCH): Promise<JobResult> {
  if (todayMU(now).slice(8, 10) !== "01") return { job: "anonymiseInactive", ran: true, processed: 0 };
  const cutoff = retentionCutoff(now);
  const cutoffDay = todayMU(cutoff);
  const at = sql`${cutoff.toISOString()}::timestamptz`;
  const inactiveGuest = sql`c.auth_user_id is null and c.created_at < ${at}
    and not exists (select 1 from orders o where o.customer_id = c.id and (o.created_at >= ${at} or o.fulfil_on >= ${cutoffDay}::date))`;
  const ids = await anonymiseWhere(db, inactiveGuest, now, batch);
  return { job: "anonymiseInactive", ran: true, processed: ids.length };
}
