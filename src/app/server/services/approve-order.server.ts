// `admin/order` approve (FR-052, FR-054; approve-then-pay 2026-11-14): pending_approval ->
// awaiting_payment with the activity-log event (actor = the admin, FR-045), the payment clock
// started (`awaiting_payment_since = now`, the reminder re-armed) and the payment_instructions
// email in the outbox (order locale; sending is E-10). Payment received then confirms the order.
// It is the `approve` row of the shared transition table, run by `transitionOrder` in one
// statement. Reused by other approve-then-pay flows through `approve-then-pay.server`.
import type { Database } from "~/server/db.server";
import { type TransitionOrderResult, transitionOrder } from "./transition-order.server";

export interface ApproveOrderInput {
  orderId: string;
  /** The version the admin's page loaded. */
  version: number;
  adminId: string;
  now: Date;
}

export type ApproveOrderResult = TransitionOrderResult;

export function approveOrder(db: Database, input: ApproveOrderInput): Promise<ApproveOrderResult> {
  return transitionOrder(db, { ...input, action: "approve" });
}
