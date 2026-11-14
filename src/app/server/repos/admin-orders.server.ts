// Order reads for the admin app (contracts.md `admin/orders`, `admin/order`). Lists are
// keyset-paginated on the gap-free order number (oldest first for the review queue), which is unique and
// increases with creation, so a cursor never skips or repeats a row.
import { and, asc, count, desc, eq, getTableName, gt, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { type LocalizedText, type OrderItemOption, type TimeWindow, customRequest, orderItem, orders } from "~/db/schema";
import type { OrderStatus } from "~/domain/status";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";
import { orderOptionLabels } from "~/server/order-options.server";

/** Tab "review" of the Orders screen (contracts.md): orders waiting for an admin decision. */
export const REVIEW_STATUSES = ["pending_approval", "quote_needed"] as const satisfies readonly OrderStatus[];

export interface AdminOrderRow {
  id: string;
  number: number;
  /** Prefix stored at placement (S-058 AC6); null only for a row the trigger never saw. */
  numberPrefix: string | null;
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

export const summaryColumns = {
  id: orders.id,
  number: orders.number,
  numberPrefix: orders.numberPrefix,
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

/** How many orders wait for review (S-034, `admin/layout` `badges.toReview`): uncapped; one count on `orders (status, fulfil_on)`. */
export async function countReviewOrders(db: Executor): Promise<number> {
  const [row] = await db.select({ n: count() }).from(orders).where(inArray(orders.status, [...REVIEW_STATUSES]));
  return Number(row?.n ?? 0);
}

/** A row of the Payment tab (S-279): when it was placed (the deadline runs from it) and any refund due. */
export interface PaymentOrderRow extends AdminOrderRow {
  createdAt: Date;
  refundDueRs: number | null;
}

export interface PaymentLists {
  /** Awaiting their Juice payment, oldest first (the nearest deadline first). */
  awaiting: PaymentOrderRow[];
  /** Refused after payment, refund not sent yet (S-281). */
  refunds: PaymentOrderRow[];
  /** Cancelled by the 24 h job in the last 7 days, newest first (S-280 AC5). */
  cancelled: PaymentOrderRow[];
}

/**
 * When the payment clock started: creation, or for an accepted quote the moment it began to wait
 * for its payment (E-08, migration 0016). The deadline and time-left badges count from it.
 */
const paymentClock = sql<Date>`coalesce(${orders.awaitingPaymentSince}, ${orders.createdAt})`.mapWith(orders.createdAt);

const paymentColumns = { ...summaryColumns, createdAt: paymentClock, refundDueRs: orders.refundDueRs } as const;
const LIST_CAP = 100;
const WEEK_MS = 7 * 24 * 3_600_000;

/** The three lists of the Payment tab, each capped (a bakery has a handful at a time). */
export async function listPaymentOrders(db: Executor, now: Date): Promise<PaymentLists> {
  const awaiting = await db.select(paymentColumns).from(orders).where(eq(orders.status, "awaiting_payment")).orderBy(asc(orders.number)).limit(LIST_CAP);
  const refunds = await db
    .select(paymentColumns)
    .from(orders)
    // Refused (S-281) or cancelled by an admin (E-06 S-119) after payment.
    .where(and(inArray(orders.status, ["declined", "cancelled"]), isNotNull(orders.refundDueRs), isNull(orders.refundedAt)))
    .orderBy(asc(orders.number))
    .limit(LIST_CAP);
  const cancelled = await db
    .select(paymentColumns)
    .from(orders)
    .where(and(eq(orders.status, "cancelled"), eq(orders.cancelReason, "unpaid"), gte(orders.updatedAt, new Date(now.getTime() - WEEK_MS))))
    .orderBy(desc(orders.updatedAt))
    .limit(20);
  return { awaiting, refunds, cancelled };
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
      // Base plus options (S-092): the stored line total over the quantity.
      unitPriceRs: row.lineTotalRs / row.quantity,
      lineTotalRs: row.lineTotalRs,
      options: orderOptionLabels(row.options),
      cakeMessage: row.cakeMessage,
    });
    byOrder.set(row.orderId, items);
  }
  return byOrder;
}

export interface AdminOrder extends AdminOrderRow {
  contactPhone: string;
  /** For the tracking link in WhatsApp messages (E-10 S-201); never shown in the admin UI. */
  trackingToken: string;
  contactEmail: string | null;
  address: string | null;
  landmark: string | null;
  itemsTotalRs: number;
  deliveryFeeRs: number;
  customerNote: string | null;
  locale: Locale;
  createdAt: Date;
  /** Start of the Juice payment clock (creation, or an accepted quote's acceptance). */
  paymentFrom: Date;
  paidAt: Date | null;
  cancelReason: string | null;
  declineReason: string | null;
  refundDueRs: number | null;
  refundedAt: Date | null;
  items: AdminOrderItem[];
  /** "Total set by hand" (S-113 AC5). */
  totalOverridden: boolean;
  /** Private note (S-114): admins only, never on the tracking page or in an email. */
  adminNote: string | null;
  /** The request fields of a custom request (S-113 AC8), else null. */
  customRequest: AdminCustomRequest | null;
}

export interface AdminCustomRequest {
  occasion: string | null;
  servings: number | null;
  flavours: string | null;
  theme: string | null;
  cakeText: string | null;
  budgetRs: number | null;
  details: string | null;
  quoteAmountRs: number | null;
  quoteNote: string | null;
  quoteExpiresOn: string | null;
}

type ItemJson = { nameEn: string; nameFr: string | null; quantity: number; unitPriceRs: number; lineTotalRs: number; options: OrderItemOption[]; cakeMessage: string | null };

/** The order's items in their order, aggregated in the same statement (one round trip, ADR-0003 amendment 3). */
const itemsJson = sql<ItemJson[] | string>`coalesce((
  select json_agg(json_build_object('nameEn', i.name_en, 'nameFr', i.name_fr, 'quantity', i.quantity, 'unitPriceRs', i.unit_base_price_rs,
    'lineTotalRs', i.line_total_rs, 'options', i.options, 'cakeMessage', i.cake_message) order by i.sort_order)
  from ${orderItem} i where i.order_id = ${sql.raw(`"${getTableName(orders)}"."id"`)}
), '[]'::json)`;

const requestJson = sql<AdminCustomRequest | string | null>`(
  select json_build_object('occasion', r.occasion, 'servings', r.servings, 'flavours', r.flavours, 'theme', r.theme, 'cakeText', r.cake_text,
    'budgetRs', r.budget_rs, 'details', r.details, 'quoteAmountRs', r.quote_amount_rs, 'quoteNote', r.quote_note, 'quoteExpiresOn', r.quote_expires_on)
  from ${customRequest} r where r.order_id = ${sql.raw(`"${getTableName(orders)}"."id"`)}
)`;

/** The full order for the admin order screen, with its items, in one query. */
export async function findAdminOrder(db: Executor, id: string): Promise<AdminOrder | undefined> {
  const [row] = await db
    .select({
      ...summaryColumns,
      contactPhone: orders.contactPhone,
      trackingToken: orders.trackingToken,
      contactEmail: orders.contactEmail,
      address: orders.address,
      landmark: orders.landmark,
      itemsTotalRs: orders.itemsTotalRs,
      deliveryFeeRs: orders.deliveryFeeRs,
      customerNote: orders.customerNote,
      locale: orders.locale,
      createdAt: orders.createdAt,
      paymentFrom: paymentClock,
      paidAt: orders.paidAt,
      cancelReason: orders.cancelReason,
      declineReason: orders.declineReason,
      refundDueRs: orders.refundDueRs,
      refundedAt: orders.refundedAt,
      totalOverridden: orders.totalOverridden,
      adminNote: orders.adminNote,
      items: itemsJson,
      customRequest: requestJson,
    })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) return undefined;
  const { items, customRequest: request, ...order } = row;
  const parsed = typeof items === "string" ? (JSON.parse(items) as ItemJson[]) : items;
  return {
    ...order,
    customRequest: typeof request === "string" ? (JSON.parse(request) as AdminCustomRequest) : request,
    items: parsed.map((item) => ({
      name: item.nameFr ? { en: item.nameEn, fr: item.nameFr } : { en: item.nameEn },
      quantity: item.quantity,
      unitPriceRs: item.lineTotalRs / item.quantity,
      lineTotalRs: item.lineTotalRs,
      options: orderOptionLabels(item.options),
      cakeMessage: item.cakeMessage,
    })),
  };
}
