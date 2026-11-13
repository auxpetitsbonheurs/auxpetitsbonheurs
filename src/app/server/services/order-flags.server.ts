// Flags on an order that are never transitions (FR-051 rules, FR-052): paid/unpaid, versioned
// and logged like any mutation (FR-054), and the private admin note, which neither takes nor
// bumps `version` and writes no event (contracts.md Conventions: autosave never conflicts).
import { eq, sql } from "drizzle-orm";
import { orders } from "~/db/schema";
import type { Database } from "~/server/db.server";
import { type OrderState, type TransitionOrderResult, refusal } from "./transition-order.server";

export interface SetPaidInput {
  orderId: string;
  paid: boolean;
  version: number;
  adminId: string;
  now: Date;
}

interface Row {
  changed: OrderState | string | null;
  current: OrderState | string | null;
}

const parsed = <T>(value: T | string | null): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

/**
 * Mark paid sets `paid_at`/`paid_by`, Mark unpaid clears them; no status change, no email; refused
 * (INVALID_TRANSITION) while the order awaits its Juice payment. Asking
 * for the flag the order already has (a second tab, a double tap) is answered with the order as it
 * is, without a new version or event.
 */
export async function setPaid(db: Database, input: SetPaidInput): Promise<TransitionOrderResult> {
  const at = input.now.toISOString();
  const event = input.paid ? "marked_paid" : "marked_unpaid";
  const result = (await db.execute(sql`
    with changed as (
      update orders set paid = ${input.paid}::boolean, version = version + 1, updated_at = ${at}::timestamptz,
        paid_at = case when ${input.paid}::boolean then ${at}::timestamptz end,
        paid_by = case when ${input.paid}::boolean then ${input.adminId}::uuid end
      where id = ${input.orderId}::uuid and version = ${input.version}::integer and paid <> ${input.paid}::boolean
        and status <> 'awaiting_payment'::order_status
      returning id, status, version, paid
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, created_at)
      select id, 'admin', ${input.adminId}::uuid, ${event}, ${at}::timestamptz from changed
    )
    select
      (select json_build_object('status', c.status, 'version', c.version, 'paid', c.paid) from changed c) as changed,
      (select json_build_object('status', o.status, 'version', o.version, 'paid', o.paid) from orders o where o.id = ${input.orderId}::uuid) as current
  `)) as unknown as { rows: Row[] };
  const row = result.rows[0];
  const changed = parsed(row?.changed ?? null);
  if (changed) return { ok: true, order: changed };
  const current = parsed(row?.current ?? null);
  if (current && current.version === input.version && current.paid === input.paid) return { ok: true, order: current };
  // While a Juice payment is awaited, Payment received is the only way to paid (juice-payment spec).
  if (current?.version === input.version && current.status === "awaiting_payment") return { ok: false, code: "INVALID_TRANSITION" };
  const code = refusal(current, input.version);
  return { ok: false, code: code === "INVALID_TRANSITION" ? "ORDER_CHANGED" : code };
}


/** Last write wins; a blank note is stored as null. False when the order does not exist. */
export async function saveAdminNote(db: Database, orderId: string, note: string): Promise<boolean> {
  const value = note.trim() === "" ? null : note;
  const rows = await db.update(orders).set({ adminNote: value }).where(eq(orders.id, orderId)).returning({ id: orders.id });
  return rows.length === 1;
}
