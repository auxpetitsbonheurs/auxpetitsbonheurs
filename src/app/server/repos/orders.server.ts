// Order lookups shared by checkout (idempotent replay, S-014) and the token pages
// (confirmation S-015, tracking S-016). Every lookup uses a unique index.
import { asc, eq } from "drizzle-orm";
import { type LocalizedText, type TimeWindow, orderItem, orders } from "~/db/schema";
import type { OrderStatus } from "~/domain/status";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export interface PlacedOrderRef {
  orderId: string;
  number: number;
  trackingToken: string;
  locale: Locale;
}

const placedRef = {
  orderId: orders.id,
  number: orders.number,
  trackingToken: orders.trackingToken,
  locale: orders.locale,
} as const;

/** The order a checkout form render already created, if any (FR-023). */
export async function findOrderByIdempotencyKey(db: Executor, key: string): Promise<PlacedOrderRef | undefined> {
  const [row] = await db.select(placedRef).from(orders).where(eq(orders.idempotencyKey, key)).limit(1);
  return row;
}

/** The order behind a tracking token (unique index); callers check the format first. */
export async function findOrderRefByToken(db: Executor, token: string): Promise<PlacedOrderRef | undefined> {
  const [row] = await db.select(placedRef).from(orders).where(eq(orders.trackingToken, token)).limit(1);
  return row;
}

export interface TrackedItem {
  name: LocalizedText;
  quantity: number;
  lineTotalRs: number;
  options: { label: LocalizedText }[];
  cakeMessage: string | null;
}

/** What the tracking page shows: the order's own snapshot, never contact details or other orders. */
export interface TrackedOrder {
  id: string;
  number: number;
  locale: Locale;
  status: OrderStatus;
  fulfilment: "delivery" | "pickup";
  fulfilOn: string;
  window: TimeWindow;
  address: string | null;
  landmark: string | null;
  itemsTotalRs: number;
  deliveryFeeRs: number;
  totalRs: number;
  paid: boolean;
  version: number;
  items: TrackedItem[];
}

/**
 * The order behind a tracking token with its items. A miss costs exactly one indexed
 * select whether the token is wrong or unknown (same timing class, threat-model C1).
 */
export async function findTrackedOrder(db: Executor, token: string): Promise<TrackedOrder | undefined> {
  const [order] = await db
    .select({
      id: orders.id,
      number: orders.number,
      locale: orders.locale,
      status: orders.status,
      fulfilment: orders.fulfilment,
      fulfilOn: orders.fulfilOn,
      window: orders.timeWindow,
      address: orders.address,
      landmark: orders.landmark,
      itemsTotalRs: orders.itemsTotalRs,
      deliveryFeeRs: orders.deliveryFeeRs,
      totalRs: orders.totalRs,
      paid: orders.paid,
      version: orders.version,
    })
    .from(orders)
    .where(eq(orders.trackingToken, token))
    .limit(1);
  if (!order) return undefined;
  const rows = await db
    .select({
      nameEn: orderItem.nameEn,
      nameFr: orderItem.nameFr,
      quantity: orderItem.quantity,
      lineTotalRs: orderItem.lineTotalRs,
      options: orderItem.options,
      cakeMessage: orderItem.cakeMessage,
    })
    .from(orderItem)
    .where(eq(orderItem.orderId, order.id))
    .orderBy(asc(orderItem.sortOrder));
  const items = rows.map((row) => ({
    name: row.nameFr ? { en: row.nameEn, fr: row.nameFr } : { en: row.nameEn },
    quantity: row.quantity,
    lineTotalRs: row.lineTotalRs,
    options: row.options.flatMap((option) => (option.choice ? [{ label: option.choice }] : [])),
    cakeMessage: row.cakeMessage,
  }));
  return { ...order, items };
}
