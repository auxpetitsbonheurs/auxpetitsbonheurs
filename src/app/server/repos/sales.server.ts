// Sales figures (contracts.md `admin/sales`, `admin/sales-csv`; FR-068, FR-069). Aggregated in
// Postgres on `orders (status, fulfil_on)` and `order_item (order_id)`; the rules that turn the
// groups into figures live in `domain/sales` so the page and the CSV always agree. Nothing is
// stored: figures follow the orders on every load.
import { and, asc, between, count, eq, gt, inArray, isNotNull, sql, sum } from "drizzle-orm";
import { orderItem, orders, product, settings } from "~/db/schema";
import {
  type ProductSales,
  REVENUE_STATUSES,
  type SalesGroup,
  type SalesSummary,
  type TopProduct,
  UNPAID_LIST_CAP,
  UNPAID_STATUSES,
  summarise,
  topProducts,
} from "~/domain/sales";
import type { OrderStatus } from "~/domain/status";
import { localized } from "~/i18n/localized";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export interface DateRange {
  from: string;
  to: string;
}

const REVENUE = [...REVENUE_STATUSES];
const UNPAID = [...UNPAID_STATUSES];

const inRevenue = (range: DateRange) => and(inArray(orders.status, REVENUE), between(orders.fulfilOn, range.from, range.to));

/** The order number as shown: the prefix stored at placement, else today's Settings prefix (S-058 AC6). */
const shownNumber = sql<string>`coalesce(${orders.numberPrefix}, (select ${settings.orderNumberPrefix} from ${settings} limit 1), '') || lpad(${orders.number}::text, 4, '0')`;

async function salesGroups(db: Executor, range: DateRange): Promise<SalesGroup[]> {
  const rows = await db
    .select({ fulfilment: orders.fulfilment, source: orders.source, orderCount: count(), revenueRs: sum(orders.totalRs) })
    .from(orders)
    .where(inRevenue(range))
    .groupBy(orders.fulfilment, orders.source);
  return rows.map((row) => ({ ...row, orderCount: Number(row.orderCount), revenueRs: Number(row.revenueRs ?? 0) }));
}

async function productSales(db: Executor, range: DateRange, locale: Locale): Promise<ProductSales[]> {
  const rows = await db
    .select({
      productId: orderItem.productId,
      nameEn: product.nameEn,
      nameFr: product.nameFr,
      quantity: sum(orderItem.quantity),
      revenueRs: sum(orderItem.lineTotalRs),
    })
    .from(orderItem)
    .innerJoin(orders, eq(orders.id, orderItem.orderId))
    // Free-text manual items (no product) are never ranked (S-172 AC3): left out here.
    .innerJoin(product, eq(product.id, orderItem.productId))
    .where(and(inRevenue(range), isNotNull(orderItem.productId)))
    .groupBy(orderItem.productId, product.nameEn, product.nameFr);
  return rows.map((row) => ({
    productId: row.productId,
    name: localized({ en: row.nameEn, fr: row.nameFr }, locale),
    quantity: Number(row.quantity ?? 0),
    revenueRs: Number(row.revenueRs ?? 0),
  }));
}

export interface UnpaidOrder {
  id: string;
  /** "APB-0012". */
  number: string;
  contactName: string;
  status: OrderStatus;
  fulfilOn: string;
  totalRs: number;
}

/** Confirmed, unpaid orders in range, oldest date first; the first 200 plus the count and total of all (S-173). */
async function unpaidOrders(db: Executor, range: DateRange): Promise<{ rows: UnpaidOrder[]; count: number; totalRs: number }> {
  const rows = await db
    .select({
      id: orders.id,
      number: shownNumber,
      contactName: orders.contactName,
      status: orders.status,
      fulfilOn: orders.fulfilOn,
      totalRs: orders.totalRs,
      all: sql<number>`count(*) over ()`,
      allTotal: sql<number>`sum(${orders.totalRs}) over ()`,
    })
    .from(orders)
    .where(and(inArray(orders.status, UNPAID), eq(orders.paid, false), between(orders.fulfilOn, range.from, range.to)))
    .orderBy(asc(orders.fulfilOn), asc(orders.number))
    .limit(UNPAID_LIST_CAP);
  const first = rows[0];
  return {
    rows: rows.map(({ all: _all, allTotal: _allTotal, ...row }) => row),
    count: Number(first?.all ?? 0),
    totalRs: Number(first?.allTotal ?? 0),
  };
}

/** One page of every unpaid order in range by number, after `after` (exclusive): the CSV Unpaid section, uncapped. */
export async function unpaidOrdersPage(db: Executor, range: DateRange, after: number | null, limit: number): Promise<(UnpaidOrder & { sequence: number })[]> {
  const where = and(inArray(orders.status, UNPAID), eq(orders.paid, false), between(orders.fulfilOn, range.from, range.to));
  return db
    .select({ id: orders.id, sequence: orders.number, number: shownNumber, contactName: orders.contactName, status: orders.status, fulfilOn: orders.fulfilOn, totalRs: orders.totalRs })
    .from(orders)
    .where(after === null ? where : and(where, gt(orders.number, after)))
    .orderBy(asc(orders.number))
    .limit(limit);
}

/** Orders waiting for their Juice payment (any date): the page links to the Payment tab that owns them. */
export async function countAwaitingPayment(db: Executor): Promise<number> {
  const [row] = await db.select({ n: count() }).from(orders).where(eq(orders.status, "awaiting_payment"));
  return Number(row?.n ?? 0);
}

export interface SalesReport extends SalesSummary {
  top5: TopProduct[];
  unpaid: UnpaidOrder[];
  /** All unpaid rows in range, also those past the 200 shown. */
  unpaidCount: number;
  unpaidTotalRs: number;
}

/** Every figure of the Sales summary for `range` (MU dates, both included), product names in `locale`. */
export async function salesReport(db: Executor, range: DateRange, locale: Locale): Promise<SalesReport> {
  const summary = summarise(await salesGroups(db, range));
  const top5 = topProducts(await productSales(db, range, locale));
  const unpaid = await unpaidOrders(db, range);
  return { ...summary, top5, unpaid: unpaid.rows, unpaidCount: unpaid.count, unpaidTotalRs: unpaid.totalRs };
}

export interface CompletedOrderRow {
  number: number;
  numberPrefix: string | null;
  fulfilOn: string;
  source: "website" | "custom_request" | "manual";
  fulfilment: "delivery" | "pickup";
  itemsTotalRs: number;
  deliveryFeeRs: number;
  totalRs: number;
  paid: boolean;
}

/** One page of the CSV Orders section: completed orders in range by number, after `after` (exclusive). */
export function completedOrdersPage(db: Executor, range: DateRange, after: number | null, limit: number): Promise<CompletedOrderRow[]> {
  return db
    .select({
      number: orders.number,
      numberPrefix: orders.numberPrefix,
      fulfilOn: orders.fulfilOn,
      source: orders.source,
      fulfilment: orders.fulfilment,
      itemsTotalRs: orders.itemsTotalRs,
      deliveryFeeRs: orders.deliveryFeeRs,
      totalRs: orders.totalRs,
      paid: orders.paid,
    })
    .from(orders)
    .where(after === null ? inRevenue(range) : and(inRevenue(range), gt(orders.number, after)))
    .orderBy(asc(orders.number))
    .limit(limit);
}
