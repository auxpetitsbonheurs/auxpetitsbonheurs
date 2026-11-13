// `site/tracking` cancel (S-096, FR-027; checkout spec "Tracking actions"): the token holder
// cancels while the order is Pending approval or Quote needed and unpaid. One statement, so
// one round trip and one implicit transaction (ADR-0003 amendment 3), as approve does: the
// conditional UPDATE (status, unpaid, version) is the lock, so of a cancel and an approval at
// the same moment exactly one matches; the customer event, the `cancellation_confirmed` email
// and one `admin_alert_customer_cancelled` per admin with email alerts on are written from
// its RETURNING. Sending is the outbox job's (E-10): a provider outage leaves the rows pending.
import { sql } from "drizzle-orm";
import { CUSTOMER_CANCELLABLE, type OrderStatus, canCustomerCancel } from "~/domain/status";
import type { Database } from "~/server/db.server";

export interface CancelOrderInput {
  token: string;
  /** The version the tracking page loaded. */
  version: number;
  now: Date;
}

export type CancelOrderResult =
  | { ok: true; order: { status: OrderStatus; version: number } }
  | { ok: false; code: "NOT_FOUND" | "CANCEL_NOT_ALLOWED" | "ORDER_CHANGED" };

interface Current {
  status: OrderStatus;
  version: number;
  paid: boolean;
}

interface Row {
  changed: { status: OrderStatus; version: number } | string | null;
  current: Current | string | null;
}

const parsed = <T>(value: T | string | null): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

export async function cancelOrderByCustomer(db: Database, input: CancelOrderInput): Promise<CancelOrderResult> {
  const at = input.now.toISOString();
  const cancellable = JSON.stringify([...CUSTOMER_CANCELLABLE]);
  const result = (await db.execute(sql`
    with target as (
      select id, status from orders where tracking_token = ${input.token}
    ), changed as (
      update orders o set status = 'cancelled', cancel_reason = 'customer', version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      from target t
      where o.id = t.id and o.version = ${input.version}::integer and not o.paid
        and o.status in (select value::order_status from json_array_elements_text(${cancellable}::json))
      returning o.id, t.status as from_status, o.status, o.version, o.contact_email, o.locale
    ), logged as (
      insert into order_event (order_id, actor_type, type, from_status, to_status, created_at)
      select id, 'customer', 'cancelled', from_status, status, ${at}::timestamptz from changed
    ), to_customer as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'cancellation_confirmed', contact_email, locale, jsonb_build_object('orderId', id), id, 'order:' || id || ':cancellation_confirmed'
      from changed where contact_email is not null
    ), to_admins as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'admin_alert_customer_cancelled', a.email, a.locale, jsonb_build_object('orderId', c.id), c.id, 'order:' || c.id || ':admin_alert_customer_cancelled:' || a.id
      from changed c cross join admin a where a.active and a.alert_email
    )
    select
      (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed,
      (select json_build_object('status', o.status, 'version', o.version, 'paid', o.paid) from orders o join target t on t.id = o.id) as current
  `)) as unknown as { rows: Row[] };
  const row = result.rows[0];
  const changed = parsed(row?.changed ?? null);
  if (changed) return { ok: true, order: changed };
  const current = parsed(row?.current ?? null);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  // The status (and paid) rule first, then the version (checkout spec: CANCEL_NOT_ALLOWED before ORDER_CHANGED).
  if (!canCustomerCancel(current)) return { ok: false, code: "CANCEL_NOT_ALLOWED" };
  return { ok: false, code: "ORDER_CHANGED" };
}
