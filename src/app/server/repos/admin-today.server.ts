// The Today screen's reads (FR-048, S-120): the tile counts in one statement and the active
// orders of two Mauritius dates (today, tomorrow) by window start then number.
import { and, asc, inArray, sql } from "drizzle-orm";
import { orders } from "~/db/schema";
import { ACTIVE_STATUSES, type OrderStatus } from "~/domain/status";
import type { Executor } from "~/server/db.server";
import { type AdminOrderRow, REVIEW_STATUSES, summaryColumns } from "./admin-orders.server";

/** Confirmed and not yet paid (FR-048 Unpaid tile): approved through completed. */
export const UNPAID_STATUSES = ["approved", "in_preparation", "ready_for_pickup", "out_for_delivery", "completed"] as const satisfies readonly OrderStatus[];

export interface TodayCounts {
  toReview: number;
  quotesToSend: number;
  awaitingPayment: number;
  unpaid: number;
}

export async function countToday(db: Executor): Promise<TodayCounts> {
  const [row] = await db
    .select({
      toReview: sql<number>`count(*) filter (where ${inArray(orders.status, [...REVIEW_STATUSES])})`.mapWith(Number),
      quotesToSend: sql<number>`count(*) filter (where ${orders.status} = 'quote_needed')`.mapWith(Number),
      awaitingPayment: sql<number>`count(*) filter (where ${orders.status} = 'awaiting_payment')`.mapWith(Number),
      unpaid: sql<number>`count(*) filter (where not ${orders.paid} and ${inArray(orders.status, [...UNPAID_STATUSES])})`.mapWith(Number),
    })
    .from(orders);
  return row ?? { toReview: 0, quotesToSend: 0, awaitingPayment: 0, unpaid: 0 };
}

/** Active orders on these dates, by date, window start, number (S-120 AC2, AC4). */
export async function listDayOrders(db: Executor, dates: string[]): Promise<AdminOrderRow[]> {
  return db
    .select(summaryColumns)
    .from(orders)
    .where(and(inArray(orders.fulfilOn, dates), inArray(orders.status, [...ACTIVE_STATUSES])))
    .orderBy(asc(orders.fulfilOn), asc(sql`(${orders.timeWindow}->>'start')`), asc(orders.number));
}
