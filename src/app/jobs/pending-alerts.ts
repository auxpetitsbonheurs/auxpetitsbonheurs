// `pendingAlerts` (S-200, FR-075; contracts.md "Scheduled jobs"): every hourly tick, website
// orders still Pending approval 24 hours after they were placed get ONE push to the admins with
// push on. The marker is set in the same statement that picks the rows (`… AND
// pending_alert_sent_at IS NULL RETURNING`), so overlapping ticks alert each order once (AC5),
// and it is never cleared, so an order reverted to Pending later is not alerted again (AC8).
// No status change, no email (AC6). While push is not configured nothing is marked, so the
// orders still waiting are alerted once the keys are set.
import { sql } from "drizzle-orm";
import { pushOrderAlert } from "~/server/notify/admin-alerts.server";
import type { JobContext, JobResult } from "./types";

export const PENDING_ALERT_AFTER_MS = 24 * 3_600_000;
/** A tick handles at most this many orders (a backlog drains over the next ticks). */
export const PENDING_ALERT_BATCH = 50;

/** Marks the due orders and logs `pending_alert_sent`; returns their ids. */
export async function claimPendingAlerts(context: JobContext): Promise<string[]> {
  const at = context.now.toISOString();
  const due = new Date(context.now.getTime() - PENDING_ALERT_AFTER_MS).toISOString();
  const { rows } = (await context.db.execute(sql`
    with marked as (
      update orders set pending_alert_sent_at = ${at}::timestamptz
      where id in (
        select id from orders
        where status = 'pending_approval' and source = 'website' and pending_alert_sent_at is null and created_at < ${due}::timestamptz
        order by created_at limit ${PENDING_ALERT_BATCH}
      ) and pending_alert_sent_at is null
      returning id
    ), logged as (
      insert into order_event (order_id, actor_type, type, created_at)
      select id, 'system', 'pending_alert_sent', ${at}::timestamptz from marked
    )
    select id from marked
  `)) as unknown as { rows: { id: string }[] };
  return rows.map((row) => row.id);
}

export async function pendingAlerts(context: JobContext): Promise<JobResult> {
  const pusher = context.pusher;
  if (!pusher) return { job: "pendingAlerts", ran: true, processed: 0 };
  const ids = await claimPendingAlerts(context);
  for (const orderId of ids) await pushOrderAlert(context.db, pusher, "pending_24h", { orderId }, context.now);
  return { job: "pendingAlerts", ran: true, processed: ids.length };
}
