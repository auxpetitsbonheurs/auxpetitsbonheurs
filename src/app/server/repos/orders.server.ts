// Order lookups for the token pages (confirmation S-015, tracking S-016). Every lookup uses
// the unique tracking-token index and answers in ONE statement (ADR-0003 amendment 3): the
// order, its items, the Settings values the page shows and, for the confirmation, the names
// of the lines left out are aggregated in the same query. Checkout's replay lookup lives in
// the place_order procedure (drizzle/0004).
import { sql } from "drizzle-orm";
import type { LocalizedText, OrderItemOption, TimeWindow } from "~/db/schema";
import type { OrderStatus } from "~/domain/status";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";
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
  /** The products named by `leftOutIds` that still exist, in no particular order. */
  leftOut: { id: string; name: Localized }[];
}

/**
 * The order behind a tracking token, its number prefix (stored at placement) and the names of the
 * left-out products (ids from the cookie, already checked as UUIDs). Callers check the token
 * format first.
 */
export async function findOrderConfirmation(db: Executor, token: string, leftOutIds: readonly string[]): Promise<OrderConfirmation | undefined> {
  const { rows } = (await db.execute(sql`
    select o.id as "orderId", o.number, o.tracking_token as "trackingToken", o.locale, coalesce(o.number_prefix, s.order_number_prefix) as "orderNumberPrefix",
      coalesce((
        select json_agg(json_build_object('id', p.id, 'name', json_build_object('en', p.name_en, 'fr', p.name_fr)))
        from product p where p.id in (select value::uuid from json_array_elements_text(${JSON.stringify(leftOutIds)}::json))
      ), '[]'::json) as "leftOut"
    from orders o cross join settings s
    where o.tracking_token = ${token} and s.id = 1
    limit 1
  `)) as unknown as { rows: (PlacedOrderRef & { orderNumberPrefix: string; leftOut: OrderConfirmation["leftOut"] | string })[] };
  const row = rows[0];
  if (!row) return undefined;
  const { orderNumberPrefix, leftOut, ...ref } = row;
  return { ref, orderNumberPrefix, leftOut: json(leftOut) };
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
  /** Settings shown with the order (read with it, never cached). */
  orderNumberPrefix: string;
  juiceNumber: string | null;
}

interface TrackedRow extends Omit<TrackedOrder, "items" | "window" | "fulfilOn"> {
  fulfilOn: string | Date;
  window: TimeWindow | string;
  items: { nameEn: string; nameFr: string | null; quantity: number; lineTotalRs: number; options: OrderItemOption[]; cakeMessage: string | null }[] | string;
}

const isoDate = (value: string | Date) => (typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10));

/**
 * The order behind a tracking token with its items and the Settings it is shown with. A miss
 * costs exactly one indexed select whether the token is wrong or unknown (same timing class,
 * threat-model C1).
 */
export async function findTrackedOrder(db: Executor, token: string): Promise<TrackedOrder | undefined> {
  const { rows } = (await db.execute(sql`
    select o.id, o.number, o.locale, o.status, o.fulfilment, to_char(o.fulfil_on, 'YYYY-MM-DD') as "fulfilOn", o.time_window as "window",
      o.address, o.landmark, o.items_total_rs as "itemsTotalRs", o.delivery_fee_rs as "deliveryFeeRs", o.total_rs as "totalRs",
      o.paid, o.version, coalesce(o.number_prefix, s.order_number_prefix) as "orderNumberPrefix", s.juice_number as "juiceNumber",
      coalesce((
        select json_agg(json_build_object('nameEn', i.name_en, 'nameFr', i.name_fr, 'quantity', i.quantity, 'lineTotalRs', i.line_total_rs,
          'options', i.options, 'cakeMessage', i.cake_message) order by i.sort_order)
        from order_item i where i.order_id = o.id
      ), '[]'::json) as items
    from orders o cross join settings s
    where o.tracking_token = ${token} and s.id = 1
    limit 1
  `)) as unknown as { rows: TrackedRow[] };
  const row = rows[0];
  if (!row) return undefined;
  const items = json(row.items).map((item) => ({
    name: item.nameFr ? { en: item.nameEn, fr: item.nameFr } : { en: item.nameEn },
    quantity: item.quantity,
    lineTotalRs: item.lineTotalRs,
    options: item.options.flatMap((option) => (option.choice ? [{ label: option.choice }] : [])),
    cakeMessage: item.cakeMessage,
  }));
  return { ...row, fulfilOn: isoDate(row.fulfilOn), window: json(row.window), items };
}
