// Order reads for the admin app (contracts.md `admin/orders`, `admin/order`). Lists are
// keyset-paginated on the gap-free order number (oldest first for the review queue), which is unique and
// increases with creation, so a cursor never skips or repeats a row.
import { and, asc, eq, getTableName, gt, inArray, sql } from "drizzle-orm";
import { type LocalizedText, type OrderItemOption, type TimeWindow, orderItem, orders } from "~/db/schema";
import type { OrderStatus } from "~/domain/status";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

/** Tab "review" of the Orders screen (contracts.md): orders waiting for an admin decision. */
export const REVIEW_STATUSES = ["pending_approval", "quote_needed"] as const satisfies readonly OrderStatus[];

export interface AdminOrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  source: "website" | "custom_request" | "manual";
  fulfilment: "delivery" | "pickup";
  fulfilOn: string;
  window: TimeWindow;
  contactName: string;
  totalRs: number;
  paid: boolean;
  version: number;
}

const summaryColumns = {
  id: orders.id,
  number: orders.number,
  status: orders.status,
  source: orders.source,
  fulfilment: orders.fulfilment,
  fulfilOn: orders.fulfilOn,
  window: orders.timeWindow,
  contactName: orders.contactName,
  totalRs: orders.totalRs,
  paid: orders.paid,
  version: orders.version,
} as const;

/** One page of the review tab, oldest first (the longest wait first), after the order number `after` (exclusive). */
export async function listReviewOrders(db: Executor, page: { after: number | null; limit: number }): Promise<{ rows: AdminOrderRow[]; more: boolean }> {
  const inTab = inArray(orders.status, [...REVIEW_STATUSES]);
  const rows = await db
    .select(summaryColumns)
    .from(orders)
    .where(page.after === null ? inTab : and(inTab, gt(orders.number, page.after)))
    .orderBy(asc(orders.number))
    .limit(page.limit + 1);
  return { rows: rows.slice(0, page.limit), more: rows.length > page.limit };
}

export interface AdminOrderItem {
  name: LocalizedText;
  quantity: number;
  unitPriceRs: number;
  lineTotalRs: number;
  options: { label: LocalizedText }[];
  cakeMessage: string | null;
}

/** Items of several orders at once (list previews), in their order. */
export async function itemsOfOrders(db: Executor, orderIds: string[]): Promise<Map<string, AdminOrderItem[]>> {
  const byOrder = new Map<string, AdminOrderItem[]>();
  if (orderIds.length === 0) return byOrder;
  const rows = await db
    .select({
      orderId: orderItem.orderId,
      nameEn: orderItem.nameEn,
      nameFr: orderItem.nameFr,
      quantity: orderItem.quantity,
      unitPriceRs: orderItem.unitBasePriceRs,
      lineTotalRs: orderItem.lineTotalRs,
      options: orderItem.options,
      cakeMessage: orderItem.cakeMessage,
    })
    .from(orderItem)
    .where(inArray(orderItem.orderId, orderIds))
    .orderBy(asc(orderItem.orderId), asc(orderItem.sortOrder));
  for (const row of rows) {
    const items = byOrder.get(row.orderId) ?? [];
    items.push({
      name: row.nameFr ? { en: row.nameEn, fr: row.nameFr } : { en: row.nameEn },
      quantity: row.quantity,
      unitPriceRs: row.unitPriceRs,
      lineTotalRs: row.lineTotalRs,
      options: row.options.flatMap((option) => (option.choice ? [{ label: option.choice }] : [])),
      cakeMessage: row.cakeMessage,
    });
    byOrder.set(row.orderId, items);
  }
  return byOrder;
}

export interface AdminOrder extends AdminOrderRow {
  contactPhone: string;
  contactEmail: string | null;
  address: string | null;
  landmark: string | null;
  itemsTotalRs: number;
  deliveryFeeRs: number;
  customerNote: string | null;
  locale: Locale;
  createdAt: Date;
  items: AdminOrderItem[];
}

type ItemJson = { nameEn: string; nameFr: string | null; quantity: number; unitPriceRs: number; lineTotalRs: number; options: OrderItemOption[]; cakeMessage: string | null };

/** The order's items in their order, aggregated in the same statement (one round trip, ADR-0003 amendment 3). */
const itemsJson = sql<ItemJson[] | string>`coalesce((
  select json_agg(json_build_object('nameEn', i.name_en, 'nameFr', i.name_fr, 'quantity', i.quantity, 'unitPriceRs', i.unit_base_price_rs,
    'lineTotalRs', i.line_total_rs, 'options', i.options, 'cakeMessage', i.cake_message) order by i.sort_order)
  from ${orderItem} i where i.order_id = ${sql.raw(`"${getTableName(orders)}"."id"`)}
), '[]'::json)`;

/** The full order for the admin order screen, with its items, in one query. */
export async function findAdminOrder(db: Executor, id: string): Promise<AdminOrder | undefined> {
  const [row] = await db
    .select({
      ...summaryColumns,
      contactPhone: orders.contactPhone,
      contactEmail: orders.contactEmail,
      address: orders.address,
      landmark: orders.landmark,
      itemsTotalRs: orders.itemsTotalRs,
      deliveryFeeRs: orders.deliveryFeeRs,
      customerNote: orders.customerNote,
      locale: orders.locale,
      createdAt: orders.createdAt,
      items: itemsJson,
    })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) return undefined;
  const { items, ...order } = row;
  const parsed = typeof items === "string" ? (JSON.parse(items) as ItemJson[]) : items;
  return {
    ...order,
    items: parsed.map((item) => ({
      name: item.nameFr ? { en: item.nameEn, fr: item.nameFr } : { en: item.nameEn },
      quantity: item.quantity,
      unitPriceRs: item.unitPriceRs,
      lineTotalRs: item.lineTotalRs,
      options: item.options.flatMap((option) => (option.choice ? [{ label: option.choice }] : [])),
      cakeMessage: item.cakeMessage,
    })),
  };
}
