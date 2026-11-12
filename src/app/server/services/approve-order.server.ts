// `admin/order` approve (FR-052, FR-054): pending_approval -> approved with the activity-log
// event (actor = the admin, FR-045) and the order_confirmed email in the outbox (order locale;
// sending is E-10, after the response through afterResponse). One statement, so one round trip
// and one implicit transaction (ADR-0003 amendment 3): the versioned conditional UPDATE is the
// lock, the event and outbox rows are written from its RETURNING in data-modifying CTEs, and
// the order's current status and version come back too, to explain a refusal. Of two
// simultaneous approvals with the same version exactly one matches a row.
import { sql } from "drizzle-orm";
import { type OrderStatus, transitionTarget } from "~/domain/status";
import type { Database } from "~/server/db.server";

export interface ApproveOrderInput {
  orderId: string;
  /** The version the admin's page loaded. */
  version: number;
  adminId: string;
  now: Date;
}

export type ApproveOrderResult =
  | { ok: true; order: { status: OrderStatus; version: number } }
  | { ok: false; code: "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION" };

interface Row {
  changed: { status: OrderStatus; version: number } | string | null;
  current: { status: OrderStatus; version: number } | string | null;
}

const parsed = <T>(value: T | string | null): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

export async function approveOrder(db: Database, input: ApproveOrderInput): Promise<ApproveOrderResult> {
  const from: OrderStatus = "pending_approval";
  const to = transitionTarget("approve", from)!;
  const at = input.now.toISOString();
  const result = (await db.execute(sql`
    with changed as (
      update orders set status = ${to}::order_status, version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      where id = ${input.orderId}::uuid and version = ${input.version}::integer and status = ${from}::order_status
      returning id, status, version, contact_email, locale
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, from_status, to_status, created_at)
      select id, 'admin', ${input.adminId}::uuid, 'approved', ${from}::order_status, ${to}::order_status, ${at}::timestamptz from changed
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'order_confirmed', contact_email, locale, jsonb_build_object('orderId', id), id, 'order:' || id || ':order_confirmed:v' || version
      from changed where contact_email is not null
    )
    select
      (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed,
      (select json_build_object('status', o.status, 'version', o.version) from orders o where o.id = ${input.orderId}::uuid) as current
  `)) as unknown as { rows: Row[] };
  const row = result.rows[0];
  const changed = parsed(row?.changed ?? null);
  if (changed) return { ok: true, order: changed };
  const current = parsed(row?.current ?? null);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.version !== input.version) return { ok: false, code: "ORDER_CHANGED" };
  return { ok: false, code: "INVALID_TRANSITION" };
}
