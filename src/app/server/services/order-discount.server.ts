// Order discount (S-320, contracts.md "Order discounts"): add, change or remove it while the order
// is unpaid and pending approval, awaiting payment or a quote. Like the payment actions, each is
// ONE statement (one round trip, one implicit transaction): the row is locked, the versioned
// conditional UPDATE is the guard (so it never races with Approve or Payment received), and the
// activity-log event and, while awaiting payment, a fresh payment_instructions email are written
// from its RETURNING. `total_rs` stays the amount to pay: subtotal - discount.
import { type SQL, sql } from "drizzle-orm";
import { DISCOUNT_STATUSES, type DiscountKind, canEditDiscount, resolveDiscount } from "~/domain/order-discount";
import type { OrderStatus } from "~/domain/status";
import type { Database } from "~/server/db.server";

export interface DiscountActionInput {
  orderId: string;
  version: number;
  adminId: string;
  now: Date;
}

export interface SetDiscountInput extends DiscountActionInput {
  kind: DiscountKind;
  value: number;
  reason: string | null;
}

export type DiscountActionResult =
  | { ok: true; order: { status: OrderStatus; version: number } }
  | { ok: false; code: "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION" }
  | { ok: false; code: "VALIDATION_FAILED"; field: "value" | "reason"; kind: DiscountKind; maxRs: number };

interface Current {
  status: OrderStatus;
  version: number;
  paid: boolean;
  goodsRs: number;
  discountRs: number | null;
}

interface Row {
  changed: { status: OrderStatus; version: number } | string | null;
  current: Current | string | null;
}

const parsed = <T>(value: T | string | null): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

const statusList = () => sql.join([...DISCOUNT_STATUSES].map((s) => sql`${s}::order_status`), sql`, `);

/** The new discount in Rs from `o` (the order before): a percentage of the goods (half up), else the amount. */
interface Change {
  /** SQL for the new `discount_rs` (null removes it), reading `o.goods_rs`. */
  discountRs: SQL;
  percent: number | null;
  reason: string | null;
  /** Extra guard (the new value in range, or a discount to remove). */
  guard: SQL;
}

async function runChange(db: Database, input: DiscountActionInput, change: Change): Promise<{ changed: Row["changed"]; current: Current | null }> {
  const at = input.now.toISOString();
  const result = (await db.execute(sql`
    with o as (
      select id, status, paid, delivery_fee_rs, discount_rs, discount_percent, discount_reason,
        total_rs + coalesce(discount_rs, 0) as subtotal_rs,
        greatest(total_rs + coalesce(discount_rs, 0) - delivery_fee_rs, 0) as goods_rs
      from orders where id = ${input.orderId}::uuid for update
    ), n as (
      select o.*, (${change.discountRs})::integer as new_rs from o
    ), changed as (
      update orders set discount_rs = n.new_rs,
        discount_percent = case when n.new_rs is null then null else ${change.percent}::smallint end,
        discount_reason = case when n.new_rs is null then null else ${change.reason}::text end,
        total_rs = n.subtotal_rs - coalesce(n.new_rs, 0),
        version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      from n
      where orders.id = n.id and orders.version = ${input.version}::integer
        and n.status in (${statusList()}) and not n.paid and ${change.guard}
      returning orders.id, orders.status, orders.version, orders.total_rs, orders.contact_email, orders.locale,
        n.discount_rs as from_rs, n.new_rs as to_rs
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, details, created_at)
      select id, 'admin', ${input.adminId}::uuid,
        case when to_rs is null then 'discount_removed' when from_rs is null then 'discount_added' else 'discount_changed' end,
        jsonb_strip_nulls(jsonb_build_object('fromRs', from_rs, 'toRs', to_rs,
          'percent', case when to_rs is null then null else ${change.percent}::integer end,
          'reason', case when to_rs is null then null else ${change.reason}::text end, 'totalRs', total_rs)),
        ${at}::timestamptz
      from changed
    ), withdrawn as (
      update email_outbox set status = 'dead', last_error = 'withdrawn'
      where order_id in (select id from changed where status = 'awaiting_payment') and template = 'payment_instructions' and status = 'pending'
    ), queued as (
      -- The customer already has the payment details: the new amount goes out at once (S-320 AC6).
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'payment_instructions', contact_email, locale, jsonb_build_object('orderId', id, 'amountChanged', true), id,
        'order:' || id || ':payment_instructions:v' || version
      from changed where status = 'awaiting_payment' and contact_email is not null
      on conflict (dedupe_key) do nothing
    )
    select
      (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed,
      (select json_build_object('status', x.status, 'version', x.version, 'paid', x.paid,
        'goodsRs', greatest(x.total_rs + coalesce(x.discount_rs, 0) - x.delivery_fee_rs, 0), 'discountRs', x.discount_rs)
        from orders x where x.id = ${input.orderId}::uuid) as current
  `)) as unknown as { rows: Row[] };
  const row = result.rows[0];
  return { changed: row?.changed ?? null, current: parsed(row?.current ?? null) };
}

/** NOT_FOUND, ORDER_CHANGED (stale page) or INVALID_TRANSITION (paid, wrong status), in that order; null = none of these. */
function stateRefusal(current: Current | null, version: number): DiscountActionResult | null {
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.version !== version) return { ok: false, code: "ORDER_CHANGED" };
  if (!canEditDiscount(current)) return { ok: false, code: "INVALID_TRANSITION" };
  return null;
}

/** `setDiscount` (S-320 AC1-AC6): a fixed amount Rs 1..goods or a percentage 1..100 of the goods. */
export async function setOrderDiscount(db: Database, input: SetDiscountInput): Promise<DiscountActionResult> {
  const value = Math.trunc(input.value);
  const discountRs = input.kind === "percent" ? sql`floor(o.goods_rs * ${value}::integer / 100.0 + 0.5)` : sql`${value}::integer`;
  const { changed, current } = await runChange(db, input, {
    discountRs,
    percent: input.kind === "percent" ? value : null,
    reason: input.reason,
    guard: sql`n.new_rs between 1 and n.goods_rs`,
  });
  const done = parsed(changed);
  if (done) return { ok: true, order: done };
  const refused = stateRefusal(current, input.version);
  if (refused) return refused;
  const check = resolveDiscount({ kind: input.kind, value, reason: input.reason }, current!.goodsRs);
  return { ok: false, code: "VALIDATION_FAILED", field: check.ok ? "value" : check.field, kind: input.kind, maxRs: current!.goodsRs };
}

/** `removeDiscount` (S-320 AC3): the total goes back to the subtotal. INVALID_TRANSITION when there is none. */
export async function removeOrderDiscount(db: Database, input: DiscountActionInput): Promise<DiscountActionResult> {
  const { changed, current } = await runChange(db, input, { discountRs: sql`null`, percent: null, reason: null, guard: sql`n.discount_rs is not null` });
  const done = parsed(changed);
  if (done) return { ok: true, order: done };
  return stateRefusal(current, input.version) ?? { ok: false, code: "INVALID_TRANSITION" };
}
