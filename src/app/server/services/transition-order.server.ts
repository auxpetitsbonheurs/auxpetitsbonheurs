// Admin status actions on an order (FR-051, FR-052, FR-054): approve, advance, revert, cancel
// (Refuse, Payment received and its Undo are the Juice payment services, order-payment.server).
// Cancelling a paid order records the refund due, like Refuse does (juice-payment spec). One statement, so one round trip and one implicit transaction (ADR-0003 amendment 3):
// the action's rows from `domain/order-transitions` go in as a VALUES list and the versioned
// UPDATE picks the row matching the order's own status and fulfilment, so the target is never
// taken from input and a stale or repeated request matches nothing. The event and the outbox
// row are written from its RETURNING in data-modifying CTEs; the current status and version
// come back too, to explain a refusal.
import { type SQL, sql } from "drizzle-orm";
import { type AdminAction, adminRules } from "~/domain/order-transitions";
import type { OrderStatus } from "~/domain/status";
import type { Database } from "~/server/db.server";

export type TransitionAction = Extract<AdminAction, "approve" | "declineRequest" | "advance" | "revert" | "cancel">;

export interface TransitionOrderInput {
  orderId: string;
  action: TransitionAction;
  /** The version the admin's page loaded. */
  version: number;
  adminId: string;
  now: Date;
  /** Cancel and declineRequest only: shown to the customer in the email (<= 500, checked at the boundary). */
  reason?: string | null;
}

export interface OrderState {
  status: OrderStatus;
  version: number;
  paid: boolean;
}

export type TransitionFailure = "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION";

export type TransitionOrderResult = { ok: true; order: OrderState } | { ok: false; code: TransitionFailure };

interface Row {
  changed: OrderState | string | null;
  current: OrderState | string | null;
}

const parsed = <T>(value: T | string | null): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

function ruleValues(action: TransitionAction): SQL {
  const rows = adminRules(action).map(
    (rule) =>
      sql`(${rule.from}::order_status, ${rule.fulfilment ?? null}::fulfilment, ${rule.to}::order_status, ${rule.email}::text, ${rule.event}::text)`,
  );
  return sql.join(rows, sql`, `);
}

/** Which refusal a statement that changed nothing means. */
export function refusal(current: Pick<OrderState, "version"> | null, version: number): TransitionFailure {
  if (!current) return "NOT_FOUND";
  return current.version !== version ? "ORDER_CHANGED" : "INVALID_TRANSITION";
}

const orderState = (alias: string) =>
  sql.raw(`json_build_object('status', ${alias}.status, 'version', ${alias}.version, 'paid', ${alias}.paid)`);

export async function transitionOrder(db: Database, input: TransitionOrderInput): Promise<TransitionOrderResult> {
  const at = input.now.toISOString();
  const reason = input.reason?.trim() || null;
  const isCancel = input.action === "cancel";
  // The thank-you mail goes once per order (notifications spec dedupe pattern); the others once per version.
  const result = (await db.execute(sql`
    with rule (from_status, fulfilment, to_status, email, event) as (values ${ruleValues(input.action)}),
    changed as (
      update orders o set status = r.to_status, version = o.version + 1, updated_at = ${at}::timestamptz,
        refund_due_rs = case when ${isCancel}::boolean and o.paid then o.total_rs else o.refund_due_rs end,
        decline_reason = case when ${input.action === "declineRequest"}::boolean then ${reason}::text else o.decline_reason end
      from rule r
      where o.id = ${input.orderId}::uuid and o.version = ${input.version}::integer
        and o.status = r.from_status and (r.fulfilment is null or r.fulfilment = o.fulfilment)
      returning o.id, o.status, o.version, o.paid, o.refund_due_rs, o.contact_email, o.locale, r.from_status, r.email, r.event
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, from_status, to_status, details, created_at)
      select id, 'admin', ${input.adminId}::uuid, event, from_status, status,
        nullif(jsonb_strip_nulls(jsonb_build_object('reason', ${reason}::text, 'paid', case when event = 'cancelled' and paid then true end,
          'refundDueRs', case when event = 'cancelled' then refund_due_rs end)), '{}'::jsonb),
        ${at}::timestamptz
      from changed
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select email, contact_email, locale, jsonb_strip_nulls(jsonb_build_object('orderId', id, 'reason', ${reason}::text)), id,
        'order:' || id || ':' || email || case when email = 'thank_you' then '' else ':v' || version end
      from changed where email is not null and contact_email is not null
      on conflict (dedupe_key) do nothing
    )
    select
      (select ${orderState("c")} from changed c) as changed,
      (select ${orderState("o")} from orders o where o.id = ${input.orderId}::uuid) as current
  `)) as unknown as { rows: Row[] };
  const row = result.rows[0];
  const changed = parsed(row?.changed ?? null);
  if (changed) return { ok: true, order: changed };
  return { ok: false, code: refusal(parsed(row?.current ?? null), input.version) };
}
