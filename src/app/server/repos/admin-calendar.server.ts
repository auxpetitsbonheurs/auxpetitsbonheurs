// Calendar and prep list reads (FR-058, FR-060; contracts.md `admin/calendar`, `admin/prep`).
// Counts and lists use the *active* group (incl. pending), the prep list the *confirmed* one,
// so the two can differ by design (S-139 notes). Dates are Mauritius calendar dates.
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { blockedDate, orderItem, orders, product } from "~/db/schema";
import type { CalendarBlock } from "~/domain/calendar";
import { PREP_STATUSES, type PrepItem } from "~/domain/prep-list";
import { ACTIVE_STATUSES } from "~/domain/status";
import type { Executor } from "~/server/db.server";
import { type AdminOrderRow, summaryColumns } from "./admin-orders.server";

export interface DayCount {
  date: string;
  delivery: number;
  pickup: number;
}

const activeOrders = inArray(orders.status, [...ACTIVE_STATUSES]);
const inRange = (from: string, to: string) => and(gte(orders.fulfilOn, from), lte(orders.fulfilOn, to));

/** Active orders per day and fulfilment from `from` to `to` (both included), one statement. */
export async function countDays(db: Executor, from: string, to: string): Promise<DayCount[]> {
  return db
    .select({
      date: sql<string>`to_char(${orders.fulfilOn}, 'YYYY-MM-DD')`,
      delivery: sql<number>`count(*) filter (where ${orders.fulfilment} = 'delivery')`.mapWith(Number),
      pickup: sql<number>`count(*) filter (where ${orders.fulfilment} = 'pickup')`.mapWith(Number),
    })
    .from(orders)
    .where(and(activeOrders, inRange(from, to)))
    .groupBy(orders.fulfilOn);
}

/** Active orders in the range by date, window start, number (S-137 AC1); `limit` caps a busy range. */
export async function listCalendarOrders(db: Executor, from: string, to: string, limit = 500): Promise<AdminOrderRow[]> {
  return db
    .select(summaryColumns)
    .from(orders)
    .where(and(activeOrders, inRange(from, to)))
    .orderBy(asc(orders.fulfilOn), asc(sql`(${orders.timeWindow}->>'start')`), asc(orders.number))
    .limit(limit);
}

/** Blocks overlapping the range, with their private reason (admins only). */
export async function blocksBetween(db: Executor, from: string, to: string): Promise<CalendarBlock[]> {
  return db
    .select({
      startsOn: sql<string>`to_char(${blockedDate.startsOn}, 'YYYY-MM-DD')`,
      endsOn: sql<string>`to_char(${blockedDate.endsOn}, 'YYYY-MM-DD')`,
      reason: blockedDate.reason,
    })
    .from(blockedDate)
    .where(and(lte(blockedDate.startsOn, to), gte(blockedDate.endsOn, from)))
    .orderBy(asc(blockedDate.startsOn), asc(blockedDate.createdAt));
}

/** The items to make on `date` (confirmed orders only), with their product's menu position; no customer fields. */
export async function prepItems(db: Executor, date: string): Promise<PrepItem[]> {
  const rows = await db
    .select({
      orderId: orderItem.orderId,
      productId: orderItem.productId,
      productSort: product.sortOrder,
      nameEn: orderItem.nameEn,
      nameFr: orderItem.nameFr,
      options: orderItem.options,
      cakeMessage: orderItem.cakeMessage,
      quantity: orderItem.quantity,
    })
    .from(orderItem)
    .innerJoin(orders, eq(orders.id, orderItem.orderId))
    .leftJoin(product, eq(product.id, orderItem.productId))
    .where(and(eq(orders.fulfilOn, date), inArray(orders.status, [...PREP_STATUSES])))
    .orderBy(asc(orders.number), asc(orderItem.sortOrder));
  return rows.map(({ nameEn, nameFr, ...row }) => ({ ...row, name: { en: nameEn, fr: nameFr } }));
}
