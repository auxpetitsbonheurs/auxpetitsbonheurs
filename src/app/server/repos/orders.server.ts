// Order lookups for the token pages (confirmation S-015, tracking S-016). Every lookup uses
// the unique tracking-token index and answers in ONE statement (ADR-0003 amendment 3): the
// order, its items, the Settings values the page shows and, for the confirmation, the names
// of the lines left out are aggregated in the same query. Checkout's replay lookup lives in
// the place_order procedure (drizzle/0004).
import { sql } from "drizzle-orm";
import type { LocalizedText, OrderItemOption, TimeWindow } from "~/db/schema";
import type { PaymentSettings } from "~/domain/payment";
import type { OrderSource, OrderStatus } from "~/domain/status";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";
import { orderOptionLabels } from "~/server/order-options.server";
import type { Localized } from "./catalogue.server";

export interface PlacedOrderRef {
  orderId: string;
  number: number;
  trackingToken: string;
  locale: Locale;
}

const json = <T>(value: T | string): T => (typeof value === "string" ? (JSON.parse(value) as T) : value);

export interface OrderConfirmation {
  ref: PlacedOrderRef;
  orderNumberPrefix: string;
  status: OrderStatus;
  totalRs: number;
  createdAt: Date;
  /** Payment Settings shown with the order (read with it, never cached). */
  payment: PaymentSettings;
  /** The products named by `leftOutIds` that still exist, in no particular order. */
  leftOut: { id: string; name: Localized }[];
  /** A custom cake request (E-08): the page says a quote will follow, not an order to approve. */
  isRequest: boolean;
  /** A workshop registration (E-15): "Registration received", the bakery accepts it, then payment. */
  isWorkshop: boolean;
}

/**
 * The order behind a tracking token, its number prefix (stored at placement) and the names of the
 * left-out products (ids from the cookie, already checked as UUIDs). Callers check the token
 * format first.
 */
export async function findOrderConfirmation(db: Executor, token: string, leftOutIds: readonly string[]): Promise<OrderConfirmation | undefined> {
  const { rows } = (await db.execute(sql`
    select o.id as "orderId", o.number, o.tracking_token as "trackingToken", o.locale, coalesce(o.number_prefix, s.order_number_prefix) as "orderNumberPrefix",
      o.status, o.total_rs as "totalRs", coalesce(o.awaiting_payment_since, o.created_at) as "createdAt", s.juice_name as "juiceName", s.juice_number as "juiceNumber", s.payment_whatsapp as "paymentWhatsapp",
      o.source = 'custom_request' as "isRequest", o.source::text = 'workshop' as "isWorkshop",
      coalesce((
        select json_agg(json_build_object('id', p.id, 'name', json_build_object('en', p.name_en, 'fr', p.name_fr)))
        from product p where p.id in (select value::uuid from json_array_elements_text(${JSON.stringify(leftOutIds)}::json))
      ), '[]'::json) as "leftOut"
    from orders o cross join settings s
    where o.tracking_token = ${token} and s.id = 1
    limit 1
  `)) as unknown as {
    rows: (PlacedOrderRef & PaymentSettings & { orderNumberPrefix: string; isRequest: boolean; isWorkshop: boolean; status: OrderStatus; totalRs: number; createdAt: Date | string; leftOut: OrderConfirmation["leftOut"] | string })[];
  };
  const row = rows[0];
  if (!row) return undefined;
  const { orderNumberPrefix, leftOut, isRequest, isWorkshop, status, totalRs, createdAt, juiceName, juiceNumber, paymentWhatsapp, ...ref } = row;
  return { ref, orderNumberPrefix, isRequest, isWorkshop, status, totalRs, createdAt: new Date(createdAt), payment: { juiceName, juiceNumber, paymentWhatsapp }, leftOut: json(leftOut) };
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
  source: OrderSource;
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
  createdAt: Date;
  /** `unpaid` for the 24 h cancel (S-280). */
  cancelReason: string | null;
  declineReason: string | null;
  refundDueRs: number | null;
  refundedAt: Date | null;
  items: TrackedItem[];
  /** Settings shown with the order (read with it, never cached). */
  orderNumberPrefix: string;
  payment: PaymentSettings;
  /** The public contact WhatsApp (as in the footer). */
  contactWhatsapp: string | null;
}

interface TrackedRow extends Omit<TrackedOrder, "items" | "window" | "fulfilOn" | "payment" | "createdAt" | "refundedAt">, PaymentSettings {
  createdAt: Date | string;
  refundedAt: Date | string | null;
  fulfilOn: string | Date;
  window: TimeWindow | string;
  items: { nameEn: string; nameFr: string | null; quantity: number; lineTotalRs: number; options: OrderItemOption[]; cakeMessage: string | null }[] | string;
}

const isoDate = (value: string | Date) => (typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10));

/** A rate-limit bucket counted in the same statement as the lookup (RL-track, S-094 AC4). */
export interface CountedBucket {
  key: string;
  windowStart: Date;
}

export interface TrackedLookup {
  order: TrackedOrder | undefined;
  /** This request's count in its rate-limit bucket (this request included). */
  attempts: number;
}

/**
 * The order behind a tracking token with its items and the Settings it is shown with, and this
 * request counted in its rate-limit bucket, in ONE statement. A miss costs exactly the same
 * statement whether the token is wrong or unknown (same timing class, threat-model C1). Never
 * selects the admin note or contact details (S-094 AC6).
 */
export async function findTrackedOrder(db: Executor, token: string, bucket: CountedBucket): Promise<TrackedLookup> {
  const { rows } = (await db.execute(sql`
    with counted as (
      insert into rate_limit_bucket (key, window_start, count) values (${bucket.key}, ${bucket.windowStart.toISOString()}::timestamptz, 1)
      on conflict (key, window_start) do update set count = rate_limit_bucket.count + 1
      returning count
    ), found as (
      select o.id, o.number, o.locale, o.source, o.status, o.fulfilment, to_char(o.fulfil_on, 'YYYY-MM-DD') as "fulfilOn", o.time_window as "window",
        o.address, o.landmark, o.items_total_rs as "itemsTotalRs", o.delivery_fee_rs as "deliveryFeeRs", o.total_rs as "totalRs",
        o.paid, o.version, coalesce(o.awaiting_payment_since, o.created_at) as "createdAt", o.cancel_reason as "cancelReason", o.decline_reason as "declineReason",
        o.refund_due_rs as "refundDueRs", o.refunded_at as "refundedAt", coalesce(o.number_prefix, s.order_number_prefix) as "orderNumberPrefix",
        s.juice_name as "juiceName", s.juice_number as "juiceNumber", s.payment_whatsapp as "paymentWhatsapp", s.contact_whatsapp as "contactWhatsapp",
        coalesce((
          select json_agg(json_build_object('nameEn', i.name_en, 'nameFr', i.name_fr, 'quantity', i.quantity, 'lineTotalRs', i.line_total_rs,
            'options', i.options, 'cakeMessage', i.cake_message) order by i.sort_order)
          from order_item i where i.order_id = o.id
        ), '[]'::json) as items
      from orders o cross join settings s
      where o.tracking_token = ${token} and s.id = 1
      limit 1
    )
    select c.count as "attempts", f.* from counted c left join found f on true
  `)) as unknown as { rows: (Omit<TrackedRow, "id"> & { id: string | null; attempts: number })[] };
  const { attempts, ...found } = rows[0]!;
  if (found.id === null) return { order: undefined, attempts };
  const row = { ...found, id: found.id };
  const items = json(row.items).map((item) => ({
    name: item.nameFr ? { en: item.nameEn, fr: item.nameFr } : { en: item.nameEn },
    quantity: item.quantity,
    lineTotalRs: item.lineTotalRs,
    options: orderOptionLabels(item.options),
    cakeMessage: item.cakeMessage,
  }));
  const { juiceName, juiceNumber, paymentWhatsapp, ...rest } = row;
  const order = {
    ...rest,
    fulfilOn: isoDate(row.fulfilOn),
    window: json(row.window),
    createdAt: new Date(row.createdAt),
    refundedAt: row.refundedAt === null ? null : new Date(row.refundedAt),
    payment: { juiceName, juiceNumber, paymentWhatsapp },
    items,
  };
  return { order, attempts };
}
