// Customer totals (FR-065; spec admin-sales-customers "Definitions"; owner decision 5):
// computed on every read from the orders, never stored, so they cannot drift.
import { ACTIVE_STATUSES, type OrderStatus } from "./status";

/** Order count: every order not declined, cancelled or closed. */
export const COUNTED_STATUSES: ReadonlySet<OrderStatus> = ACTIVE_STATUSES;

/** Total spent: Completed orders only, the same rule as Sales revenue. */
export const SPENT_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["completed"]);

export function customerTotals(orders: readonly { status: OrderStatus; totalRs: number }[]): { orderCount: number; totalSpentRs: number } {
  let orderCount = 0;
  let totalSpentRs = 0;
  for (const order of orders) {
    if (COUNTED_STATUSES.has(order.status)) orderCount += 1;
    if (SPENT_STATUSES.has(order.status)) totalSpentRs += order.totalRs;
  }
  return { orderCount, totalSpentRs };
}

/**
 * The name the retention job gives an anonymised customer (data-model.md "Retention"). There is
 * no flag column yet: the erasure spec that adds the job may add one, and this check follows it.
 */
export const DELETED_CUSTOMER_NAME = "Deleted customer";

export function isAnonymised(customer: { name: string }): boolean {
  return customer.name === DELETED_CUSTOMER_NAME;
}
