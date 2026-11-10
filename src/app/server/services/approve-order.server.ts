// `admin/order` approve (FR-052, FR-054): pending_approval -> approved in one transaction
// with the activity-log event (actor = the admin, FR-045) and the order_confirmed email
// in the outbox (order locale; sending is E-10). The versioned conditional UPDATE is the
// lock: of two simultaneous approvals with the same version exactly one matches a row.
import { and, eq } from "drizzle-orm";
import { emailOutbox, orders } from "~/db/schema";
import { type OrderStatus, transitionTarget } from "~/domain/status";
import type { Database, Transaction } from "~/server/db.server";
import { appendOrderEvent } from "~/server/repos/order-events.server";

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

/** Why nothing matched: unknown order, someone changed it, or approve is not allowed from its status. */
async function refusal(tx: Transaction, input: ApproveOrderInput): Promise<ApproveOrderResult> {
  const [current] = await tx.select({ status: orders.status, version: orders.version }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.version !== input.version) return { ok: false, code: "ORDER_CHANGED" };
  return { ok: false, code: "INVALID_TRANSITION" };
}

export async function approveOrder(db: Database, input: ApproveOrderInput): Promise<ApproveOrderResult> {
  const to = transitionTarget("approve", "pending_approval")!;
  return db.transaction(async (tx) => {
    const [changed] = await tx
      .update(orders)
      .set({ status: to, version: input.version + 1, updatedAt: input.now })
      .where(and(eq(orders.id, input.orderId), eq(orders.version, input.version), eq(orders.status, "pending_approval")))
      .returning({ status: orders.status, version: orders.version, contactEmail: orders.contactEmail, locale: orders.locale });
    if (!changed) return refusal(tx, input);
    await appendOrderEvent(tx, {
      orderId: input.orderId,
      actor: { type: "admin", adminId: input.adminId },
      type: "approved",
      fromStatus: "pending_approval",
      toStatus: to,
      at: input.now,
    });
    if (changed.contactEmail) {
      await tx.insert(emailOutbox).values({
        template: "order_confirmed",
        toEmail: changed.contactEmail,
        locale: changed.locale,
        payload: { orderId: input.orderId },
        orderId: input.orderId,
        dedupeKey: `order:${input.orderId}:order_confirmed:v${changed.version}`,
      });
    }
    return { ok: true, order: { status: changed.status, version: changed.version } };
  });
}
