// One fetcher for every status and paid action of the order screen, shared by the header and
// the action bar through its key. While a request is in flight (and while the page reloads its
// data after it), the screen shows the expected result at once: the target status from
// `allowed` and the new paid flag (optimistic, UX first). A refusal leaves the loader data as it
// was, so the optimistic view simply disappears and the conflict Alert explains why.
import { useFetcher } from "react-router";
import type { AdminAllowed } from "~/domain/order-transitions";
import type { OrderStatus } from "~/domain/status";

export const ORDER_ACTION_KEY = "order-action";

export type StatusIntent = "approve" | "markPaid" | "undoPaid" | "decline" | "declineRequest" | "markRefunded" | "advance" | "revert" | "cancel" | "setPaid";

export type OrderActionAnswer =
  | { ok: true; intent: StatusIntent | "saveNote"; order?: { status: OrderStatus; version: number; paid?: boolean } }
  | { ok: false; intent?: string | null; error: { code: string; message: string; fields?: Record<string, string> } };

interface OrderView {
  status: OrderStatus;
  paid: boolean;
}

const FIXED_TARGET: Partial<Record<StatusIntent, OrderStatus>> = {
  approve: "awaiting_payment",
  markPaid: "approved",
  undoPaid: "awaiting_payment",
  decline: "declined",
  declineRequest: "declined",
  cancel: "cancelled",
};

/** The status an intent leads to, from the same `allowed` the server computed. */
export function expectedStatus(intent: string, current: OrderStatus, allowed: AdminAllowed): OrderStatus {
  if (intent === "advance") return allowed.advance ?? current;
  if (intent === "revert") return allowed.revert ?? current;
  return FIXED_TARGET[intent as StatusIntent] ?? current;
}

function expectedPaid(intent: string | null, formPaid: FormDataEntryValue | null | undefined, current: boolean): boolean {
  if (intent === "setPaid") return formPaid === "true";
  if (intent === "markPaid") return true;
  if (intent === "undoPaid") return false;
  return current;
}

export function useOrderAction(order: OrderView, allowed: AdminAllowed) {
  const fetcher = useFetcher<OrderActionAnswer>({ key: ORDER_ACTION_KEY });
  const intent = fetcher.formData?.get("intent");
  const pending = fetcher.state !== "idle" && typeof intent === "string" ? (intent as StatusIntent) : null;
  const optimistic: OrderView = {
    status: pending ? expectedStatus(pending, order.status, allowed) : order.status,
    paid: expectedPaid(pending, fetcher.formData?.get("paid"), order.paid),
  };
  return { fetcher, pending, optimistic };
}
