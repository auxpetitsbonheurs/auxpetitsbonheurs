// `expireQuotes` (E-08 S-160, FR-032; contracts.md "Scheduled jobs"): every hourly tick, quotes
// still Quote sent whose expiry day has passed in Mauritius (`quote_expires_on < todayMU`) move to
// Closed with a system event and "Quote closed" (the same dedupe key as a customer's decline, so
// never two emails). Each row is its own versioned update: a customer who accepted a moment
// before keeps Approved (AC3), a second run finds nothing (AC2), and one failing row does not stop
// the others (AC6). Admins with push on get one push per closed quote (E-10 S-199).
import { sql } from "drizzle-orm";
import { todayMU } from "~/domain/time";
import { pushOrderAlert } from "~/server/notify/admin-alerts.server";
import type { JobContext, JobResult } from "./types";

export const EXPIRE_BATCH = 200;

export interface Due {
  id: string;
  version: number;
}

/** One versioned close; false when the row moved on (accepted, declined, already closed). */
export async function closeExpiredQuote(context: JobContext, due: Due): Promise<boolean> {
  const at = context.now.toISOString();
  const { rows } = (await context.db.execute(sql`
    with changed as (
      update orders set status = 'closed', version = ${due.version + 1}::integer, updated_at = ${at}::timestamptz
      where id = ${due.id}::uuid and version = ${due.version}::integer and status = 'quote_sent'
      returning id, contact_email, locale
    ), logged as (
      insert into order_event (order_id, actor_type, type, from_status, to_status, created_at)
      select id, 'system', 'quote_expired', 'quote_sent', 'closed', ${at}::timestamptz from changed
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'quote_closed', contact_email, locale, jsonb_build_object('orderId', id, 'why', 'expired'), id, 'order:' || id || ':quote_closed'
      from changed where contact_email is not null
      on conflict (dedupe_key) do nothing
    )
    select count(*)::int as n from changed
  `)) as unknown as { rows: { n: number }[] };
  return (rows[0]?.n ?? 0) > 0;
}

export async function expireQuotes(context: JobContext): Promise<JobResult> {
  const today = todayMU(context.now);
  const { rows: due } = (await context.db.execute(sql`
    select o.id, o.version from orders o join custom_request cr on cr.order_id = o.id
    where o.status = 'quote_sent' and cr.quote_expires_on < ${today}::date
    order by cr.quote_expires_on, o.number limit ${EXPIRE_BATCH}
  `)) as unknown as { rows: Due[] };
  let processed = 0;
  const failed: string[] = [];
  for (const row of due) {
    try {
      if (await closeExpiredQuote(context, row)) {
        processed += 1;
        // S-199: admins with push on hear about it, only after the close succeeded (AC2, AC4).
        if (context.pusher) await pushOrderAlert(context.db, context.pusher, "quote_expired", { orderId: row.id }, context.now).catch(() => undefined);
      }
    } catch (error) {
      failed.push(row.id);
      console.log(JSON.stringify({ level: "error", event: "expire_quote_failed", orderId: row.id, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    }
  }
  if (failed.length > 0) return { job: "expireQuotes", ran: false, error: `${failed.length} of ${due.length} quotes could not be closed (${processed} closed)` };
  return { job: "expireQuotes", ran: true, processed };
}
