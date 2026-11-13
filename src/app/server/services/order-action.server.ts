// `admin/order` actions after parsing and authentication (contracts.md `admin/order`): picks the
// service for the intent (E-06 transitions and flags; the Juice payment services for Payment
// received, its Undo, Refuse and Refunded) and writes the spec's log lines (admin-orders
// "Analytics Events"): `order_action`, `order_conflict`, `order_invalid_transition`, with ids only.
import type { OrderAction } from "~/server/contracts/admin";
import type { Database } from "~/server/db.server";
import { declineOrder, markPaid, markRefunded, undoPaid } from "./order-payment.server";
import { saveAdminNote, setPaid } from "./order-flags.server";
import { transitionOrder } from "./transition-order.server";

export interface OrderActionContext {
  orderId: string;
  adminId: string;
  now: Date;
}

type Refusal = "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION";

export type OrderActionResult =
  | { ok: true; order: { status: string; version: number; paid?: boolean } }
  | { ok: true; note: true }
  | { ok: false; code: Refusal };

export interface OrderLogLine {
  level: "info" | "warn";
  event: "order_action" | "order_conflict" | "order_invalid_transition";
  action: string;
  orderId: string;
  adminId: string;
  to?: string;
}

/** The log line of a status or paid action, or null for a note (not logged, like its event). */
export function orderLogLine(input: OrderAction, context: OrderActionContext, result: OrderActionResult): OrderLogLine | null {
  if (input.intent === "saveNote") return null;
  const base = { action: input.intent, orderId: context.orderId, adminId: context.adminId };
  if (result.ok) return "order" in result ? { level: "info", event: "order_action", ...base, to: result.order.status } : null;
  if (result.code === "ORDER_CHANGED") return { level: "warn", event: "order_conflict", ...base };
  if (result.code === "INVALID_TRANSITION") return { level: "warn", event: "order_invalid_transition", ...base };
  return null;
}

async function dispatch(db: Database, input: OrderAction, context: OrderActionContext): Promise<OrderActionResult> {
  if (input.intent === "saveNote") {
    return (await saveAdminNote(db, context.orderId, input.adminNote)) ? { ok: true, note: true } : { ok: false, code: "NOT_FOUND" };
  }
  const base = { ...context, version: input.version };
  switch (input.intent) {
    case "setPaid":
      return setPaid(db, { ...base, paid: input.paid });
    case "markPaid":
      return markPaid(db, base);
    case "undoPaid":
      return undoPaid(db, base);
    case "markRefunded":
      return markRefunded(db, base);
    case "decline":
      return declineOrder(db, { ...base, reason: input.reason });
    case "cancel":
    case "declineRequest":
      return transitionOrder(db, { ...base, action: input.intent, reason: input.reason });
    default:
      return transitionOrder(db, { ...base, action: input.intent });
  }
}

export async function runOrderAction(db: Database, input: OrderAction, context: OrderActionContext): Promise<OrderActionResult> {
  const result = await dispatch(db, input, context);
  const line = orderLogLine(input, context, result);
  if (line) console[line.level === "warn" ? "warn" : "log"](JSON.stringify(line));
  return result;
}
