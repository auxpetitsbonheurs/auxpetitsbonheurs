// `admin/order` approve (FR-052, FR-054): pending_approval -> approved with the activity-log
// event (actor = the admin, FR-045) and the order_confirmed email in the outbox (order locale;
// sending is E-10, after the response through afterResponse). Since S-115 it is the `approve`
// row of the shared transition table, run by `transitionOrder` in one statement.
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
