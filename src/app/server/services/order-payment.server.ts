// Juice payment admin actions (docs/specs/features/juice-payment.md): Payment received and
// its Undo (S-279), Refuse and Refunded (S-281). Like approve-order, each action is ONE
// statement (one round trip, one implicit transaction): the row is locked, the versioned
// conditional UPDATE is the guard, and the activity-log event and the customer's outbox row
// are written from its RETURNING in data-modifying CTEs. The current status and version come
// back too, to explain a refusal. Emails are only queued; sending is E-10.
import { type SQL, sql } from "drizzle-orm";
import { type OrderStatus, transitionTarget } from "~/domain/status";
import type { Database } from "~/server/db.server";

export interface PaymentActionInput {
  orderId: string;
  /** The version the admin's page loaded. */
  version: number;
  adminId: string;
  now: Date;
}

export type PaymentActionResult =
  | { ok: true; order: { status: OrderStatus; version: number } }
  | { ok: false; code: "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION" };

interface Row {
  changed: { status: OrderStatus; version: number } | string | null;
  current: { status: OrderStatus; version: number } | string | null;
}

/** One action: which rows it may change, how, and what it records. `o` is the order before the change. */
interface Transition {
  allowed: SQL;
  set: SQL;
  event: string;
  /** Event details, read from `changed` (its columns: total_rs, refund_due_rs, from_status…). */
  details: SQL;
  /** Outbox template for the customer (dedupe per order and new version); none for an undo. */
  email: string | null;
  /** Extra data-modifying CTEs that read `changed` (e.g. withdraw an email). */
  extra?: SQL;
}

const parsed = <T>(value: T | string | null): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

const statusList = (statuses: readonly OrderStatus[]) => sql.join(statuses.map((s) => sql`${s}::order_status`), sql`, `);

const queueEmail = (template: string) => sql`, queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select ${template}, contact_email, locale, jsonb_build_object('orderId', id), id, 'order:' || id || ':' || ${template} || ':v' || version
      from changed where contact_email is not null
    )`;

async function runTransition(db: Database, input: PaymentActionInput, step: Transition): Promise<PaymentActionResult> {
  const at = input.now.toISOString();
  const result = (await db.execute(sql`
    with o as (
      select id, status, paid, total_rs from orders where id = ${input.orderId}::uuid for update
    ), changed as (
      update orders set ${step.set}, version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      from o
      where orders.id = o.id and orders.version = ${input.version}::integer and ${step.allowed}
      returning orders.id, o.status as from_status, orders.status, orders.version, orders.contact_email, orders.locale, orders.total_rs, orders.refund_due_rs
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, from_status, to_status, details, created_at)
      select id, 'admin', ${input.adminId}::uuid, ${step.event}, from_status, status, ${step.details}, ${at}::timestamptz from changed
    )${step.email ? queueEmail(step.email) : sql``}${step.extra ?? sql``}
    select
      (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed,
      (select json_build_object('status', x.status, 'version', x.version) from orders x where x.id = ${input.orderId}::uuid) as current
  `)) as unknown as { rows: Row[] };
  const row = result.rows[0];
  const changed = parsed(row?.changed ?? null);
  if (changed) return { ok: true, order: changed };
  const current = parsed(row?.current ?? null);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.version !== input.version) return { ok: false, code: "ORDER_CHANGED" };
  return { ok: false, code: "INVALID_TRANSITION" };
}

/** Payment received (S-279 AC2): awaiting_payment → approved, paid by this admin; the customer gets `order_confirmed`. */
export function markPaid(db: Database, input: PaymentActionInput): Promise<PaymentActionResult> {
  const to = transitionTarget("markPaid", "awaiting_payment")!;
  return runTransition(db, input, {
    allowed: sql`o.status = 'awaiting_payment'::order_status`,
    set: sql`status = ${to}::order_status, paid = true, paid_at = ${input.now.toISOString()}::timestamptz, paid_by = ${input.adminId}::uuid`,
    event: "payment_received",
    details: sql`jsonb_build_object('amountRs', total_rs)`,
    email: "order_confirmed",
  });
}

/**
 * Undo of Payment received (S-279 AC3): only while the order is still approved and paid and
 * Payment received is its latest event (nothing happened since). The confirmation email still
 * waiting in the outbox is withdrawn (`dead`, "withdrawn"); none is queued for the undo.
 */
export function undoPaid(db: Database, input: PaymentActionInput): Promise<PaymentActionResult> {
  return runTransition(db, input, {
    allowed: sql`o.status = 'approved'::order_status and o.paid
      and (select e.type from order_event e where e.order_id = o.id order by e.id desc limit 1) = 'payment_received'`,
    set: sql`status = 'awaiting_payment'::order_status, paid = false, paid_at = null, paid_by = null`,
    event: "payment_undone",
    details: sql`null::jsonb`,
    email: null,
    extra: sql`, withdrawn as (
      update email_outbox set status = 'dead', last_error = 'withdrawn'
      where order_id in (select id from changed) and template = 'order_confirmed' and status = 'pending'
    )`,
  });
}

/**
 * Refuse (S-281 AC1, AC2): from awaiting payment, pending approval, approved or in preparation
 * to declined with the optional reason; a paid order then owes its whole total back by Juice.
 */
export function declineOrder(db: Database, input: PaymentActionInput & { reason: string | null }): Promise<PaymentActionResult> {
  const from = (["awaiting_payment", "pending_approval", "approved", "in_preparation"] as const).filter((s) => transitionTarget("decline", s));
  return runTransition(db, input, {
    allowed: sql`o.status in (${statusList(from)})`,
    set: sql`status = 'declined'::order_status, decline_reason = ${input.reason}, refund_due_rs = case when o.paid then o.total_rs end`,
    event: "declined",
    details: sql`jsonb_build_object('refundDueRs', refund_due_rs)`,
    email: "order_declined",
  });
}

/** Refunded (S-281 AC3): a refused (or, since E-06, admin-cancelled) paid order's refund was sent by Juice; once only. */
export function markRefunded(db: Database, input: PaymentActionInput): Promise<PaymentActionResult> {
  return runTransition(db, input, {
    allowed: sql`o.status in ('declined'::order_status, 'cancelled'::order_status) and orders.refund_due_rs is not null and orders.refunded_at is null`,
    set: sql`refunded_at = ${input.now.toISOString()}::timestamptz, refunded_by = ${input.adminId}::uuid`,
    event: "refunded",
    details: sql`jsonb_build_object('amountRs', refund_due_rs)`,
    email: "order_refunded",
  });
}
