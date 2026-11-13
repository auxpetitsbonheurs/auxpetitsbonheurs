// The Orders screen's list tabs (FR-049, S-111, S-112): one keyset-paged query per tab with the
// search and filters, all as bound parameters (never string-built), and the five tab counts in
// one statement. Sort keys (the cursor carries the last row's): review = number ascending (the
// longest wait first); upcoming = date, window start, number ascending; completed = date then
// number descending; closed = number descending (newest first).
import { type SQL, and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { orders } from "~/db/schema";
import { type ListTab, ORDER_TABS, type OrderTab, TAB_STATUSES } from "~/domain/order-tabs";
import { ACCENTED, ACCENT_FOLDED, likePattern, parseOrderQuery } from "~/domain/order-search";
import type { ListCursor, OrderListFilters } from "~/server/contracts/orders-list";
import type { Executor } from "~/server/db.server";
import { type AdminOrderRow, summaryColumns } from "./admin-orders.server";

const windowStart = sql<string>`(${orders.timeWindow}->>'start')`;

/** Name (accent- and case-insensitive), phone digits, or order number (S-112 AC1, AC2, AC7). */
function searchCondition(q: string | null): SQL | undefined {
  const query = parseOrderQuery(q);
  if (!query) return undefined;
  const folded = sql`lower(translate(${orders.contactName}, ${ACCENTED}, ${ACCENT_FOLDED}))`;
  const matches: SQL[] = [sql`${folded} like ${likePattern(query.text)} escape '\\'`];
  if (query.digits) matches.push(sql`regexp_replace(${orders.contactPhone}, '\\D', '', 'g') like ${likePattern(query.digits)} escape '\\'`);
  if (query.number !== null) matches.push(eq(orders.number, query.number));
  return or(...matches);
}

function filterConditions(filters: OrderListFilters): (SQL | undefined)[] {
  return [
    searchCondition(filters.q),
    filters.fulfilment ? eq(orders.fulfilment, filters.fulfilment) : undefined,
    filters.paid === null ? undefined : eq(orders.paid, filters.paid),
    filters.from ? gte(orders.fulfilOn, filters.from) : undefined,
    filters.to ? lte(orders.fulfilOn, filters.to) : undefined,
  ];
}

function afterCursor(tab: ListTab, cursor: ListCursor | null): SQL | undefined {
  if (!cursor) return undefined;
  switch (tab) {
    case "review":
      return sql`${orders.number} > ${cursor.n}`;
    case "upcoming":
      return sql`(${orders.fulfilOn}, ${windowStart}, ${orders.number}) > (${cursor.d ?? "0001-01-01"}::date, ${cursor.w ?? ""}, ${cursor.n})`;
    case "completed":
      return sql`(${orders.fulfilOn}, ${orders.number}) < (${cursor.d ?? "9999-12-31"}::date, ${cursor.n})`;
    case "closed":
      return sql`${orders.number} < ${cursor.n}`;
  }
}

const ORDER_BY: Record<ListTab, SQL[]> = {
  review: [asc(orders.number)],
  upcoming: [asc(orders.fulfilOn), asc(windowStart), asc(orders.number)],
  completed: [desc(orders.fulfilOn), desc(orders.number)],
  closed: [desc(orders.number)],
};

/** The cursor that continues after `row` in `tab`. */
export function cursorAfter(tab: ListTab, row: AdminOrderRow): ListCursor {
  if (tab === "upcoming") return { d: row.fulfilOn, w: row.window.start, n: row.number };
  if (tab === "completed") return { d: row.fulfilOn, n: row.number };
  return { n: row.number };
}

export interface ListPage {
  tab: ListTab;
  filters: OrderListFilters;
  after: ListCursor | null;
  limit: number;
}

/** One page of a list tab (`limit` rows) and whether more follow. */
export async function listTabOrders(db: Executor, page: ListPage): Promise<{ rows: AdminOrderRow[]; more: boolean }> {
  const where = and(inArray(orders.status, [...TAB_STATUSES[page.tab]]), afterCursor(page.tab, page.after), ...filterConditions(page.filters));
  const rows = await db
    .select(summaryColumns)
    .from(orders)
    .where(where)
    .orderBy(...ORDER_BY[page.tab])
    .limit(page.limit + 1);
  return { rows: rows.slice(0, page.limit), more: rows.length > page.limit };
}

export type TabCounts = Record<OrderTab, number>;

/** Every tab's total in one statement (S-111 AC2); a status no tab knows counts under Upcoming, as `tabOf` lists it. */
export async function countTabs(db: Executor): Promise<TabCounts> {
  const known = ORDER_TABS.flatMap((tab) => TAB_STATUSES[tab]);
  const [row] = await db
    .select({
      review: sql<number>`count(*) filter (where ${inArray(orders.status, [...TAB_STATUSES.review])})`.mapWith(Number),
      payment: sql<number>`count(*) filter (where ${inArray(orders.status, [...TAB_STATUSES.payment])})`.mapWith(Number),
      upcoming: sql<number>`count(*) filter (where ${inArray(orders.status, [...TAB_STATUSES.upcoming])} or not ${inArray(orders.status, known)})`.mapWith(Number),
      completed: sql<number>`count(*) filter (where ${inArray(orders.status, [...TAB_STATUSES.completed])})`.mapWith(Number),
      closed: sql<number>`count(*) filter (where ${inArray(orders.status, [...TAB_STATUSES.closed])})`.mapWith(Number),
    })
    .from(orders);
  return row ?? { review: 0, payment: 0, upcoming: 0, completed: 0, closed: 0 };
}
