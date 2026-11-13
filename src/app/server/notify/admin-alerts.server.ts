// Admin alerts (S-195; spec "Alert matrix"): push to every device of every active admin with
// push on, in that admin's locale, and an `admin_alert_*` email row per active admin with email
// on. The two channels are independent: an email outage never stops the push (AC6), and an
// admin without a device still gets the email (AC7). Both run after the response, so the
// customer never waits for them.
//
// Who queues the email rows: the custom-request procedure (0016), the quote answers and the
// customer cancel already write theirs in the same statement as the status change; the new
// website order's rows are written here (place_order stays untouched, it is shared by several
// jobs), keyed so a replay never queues twice. E-10's sender (S-186) sends them all.
import { sql } from "drizzle-orm";
import { type RouterContextProvider } from "react-router";
import { formatOrderNumber } from "~/domain/order-number";
import { afterResponseContext } from "~/server/after-response.server";
import { clockContext } from "~/server/clock.server";
import { type Executor, requestDbContext } from "~/server/db.server";
import { type PushReport, type Pusher, pushContext, sendPushes } from "~/server/push/push.server";
import { pushRecipients } from "~/server/push/subscriptions.server";
import { type AlertOrder, type OrderAlert, orderAlertPayload } from "./push-text.server";

export type OrderRef = { orderId: string } | { trackingToken: string };

interface AlertRow extends AlertOrder {
  source: "website" | "custom_request" | "manual";
}

const NONE: PushReport = { sent: 0, gone: 0, failed: 0 };

async function alertOrder(db: Executor, ref: OrderRef): Promise<AlertRow | null> {
  const where = "orderId" in ref ? sql`o.id = ${ref.orderId}::uuid` : sql`o.tracking_token = ${ref.trackingToken}`;
  const { rows } = (await db.execute(sql`
    select o.id, o.number, coalesce(o.number_prefix, s.order_number_prefix) as prefix, o.contact_name as "contactName", o.source
    from orders o cross join settings s where ${where} limit 1
  `)) as unknown as { rows: { id: string; number: number; prefix: string; contactName: string | null; source: AlertRow["source"] }[] };
  const row = rows[0];
  return row ? { id: row.id, orderNumber: formatOrderNumber(row.prefix, row.number), contactName: row.contactName, source: row.source } : null;
}

/**
 * Pushes `event` for one order to every opted-in device (S-195 AC1-AC5, AC8, AC11). A
 * new-order alert is for website orders only: an order an admin keyed in alerts nobody (AC9).
 */
export async function pushOrderAlert(db: Executor, pusher: Pusher, event: OrderAlert, ref: OrderRef, now: Date): Promise<PushReport> {
  const order = await alertOrder(db, ref);
  if (!order || (event === "new_order" && order.source !== "website")) return NONE;
  const recipients = await pushRecipients(db);
  const jobs = recipients.map(({ device, locale }) => ({ device, payload: orderAlertPayload(event, order, locale) }));
  return sendPushes(db, pusher, event, jobs, now);
}

/** The `admin_alert_new_order` email rows (S-195 AC1, AC3, AC4): one per active admin with email on. */
export async function queueNewOrderEmails(db: Executor, orderId: string): Promise<number> {
  const { rows } = (await db.execute(sql`
    with queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'admin_alert_new_order', a.email, a.locale, jsonb_build_object('orderId', o.id), o.id, 'order:' || o.id || ':admin_alert_new_order:' || a.id
      from orders o cross join admin a
      where o.id = ${orderId}::uuid and o.source = 'website' and a.active and a.alert_email
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*)::int as n from queued
  `)) as unknown as { rows: { n: number }[] };
  return rows[0]?.n ?? 0;
}

type AlertContext = Pick<RouterContextProvider, "get">;

/**
 * For route actions: after the response, queue the new-order email rows (when `event` is
 * `new_order`) and push the alert. Never throws into the action; failures are logged by the
 * after-response queue with the task name only.
 */
export function deferOrderAlert(context: AlertContext, event: OrderAlert, ref: OrderRef): void {
  const db = context.get(requestDbContext).db;
  const { pusher } = context.get(pushContext);
  const now = context.get(clockContext).now();
  const afterResponse = context.get(afterResponseContext);
  if (event === "new_order" && "orderId" in ref) afterResponse.defer("admin_alert_email", () => queueNewOrderEmails(db, ref.orderId));
  if (pusher) afterResponse.defer("admin_alert_push", () => pushOrderAlert(db, pusher, event, ref, now));
}
