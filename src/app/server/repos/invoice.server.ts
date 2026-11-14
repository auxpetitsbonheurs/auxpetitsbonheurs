// Invoice reads and the numbering (S-127). An order takes its number the first time an invoice
// is generated, in one statement: the order row is locked first and must still have no number,
// then the Settings counter is taken and bumped, then the order is stamped with it and the day.
// A second request for the same order waits on the row lock, sees the number and takes none.
// Neither the order's nor Settings' `version` moves: an open order page or Settings form stays valid.
import { sql } from "drizzle-orm";
import type { LocalizedText, OrderItemOption } from "~/db/schema";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export interface InvoiceStamp {
  number: number;
  date: string;
}

type StampRow = { number: number | string | null; date: string | null };

async function readStamp(db: Executor, orderId: string): Promise<InvoiceStamp | null> {
  const { rows } = (await db.execute(sql`
    select invoice_number as number, to_char(invoice_date, 'YYYY-MM-DD') as date from orders where id = ${orderId}::uuid
  `)) as unknown as { rows: StampRow[] };
  const row = rows[0];
  return row?.number != null && row.date ? { number: Number(row.number), date: row.date } : null;
}

/**
 * The order's invoice number and date, taking the next number on the first call (`today` is the
 * Mauritius date). The counter never goes below the highest number already used, so a number typed
 * too low in Settings can never be issued twice. Null when the order does not exist.
 */
export async function assignInvoiceNumber(db: Executor, orderId: string, today: string): Promise<InvoiceStamp | null> {
  const { rows } = (await db.execute(sql`
    with target as (
      select id from orders where id = ${orderId}::uuid and invoice_number is null for update
    ), taken as (
      update settings set next_invoice_number = greatest(next_invoice_number, (select coalesce(max(invoice_number), 0) + 1 from orders)) + 1
      where id = 1 and exists (select 1 from target)
      returning next_invoice_number - 1 as number
    ), stamped as (
      update orders o set invoice_number = taken.number, invoice_date = ${today}::date
      from taken, target where o.id = target.id
      returning o.invoice_number as number, to_char(o.invoice_date, 'YYYY-MM-DD') as date
    )
    select number, date from stamped
  `)) as unknown as { rows: StampRow[] };
  const row = rows[0];
  if (row?.number != null && row.date) return { number: Number(row.number), date: row.date };
  // Already numbered (or numbered by a request that held the lock): a fresh read sees it.
  return readStamp(db, orderId);
}

export interface InvoiceOrderLine {
  nameEn: string;
  nameFr: string | null;
  quantity: number;
  originalBasePriceRs: number;
  unitBasePriceRs: number;
  lineTotalRs: number;
  promotionTitleEn: string | null;
  options: OrderItemOption[];
  cakeMessage: string | null;
}

export interface InvoiceOrder {
  id: string;
  source: "website" | "custom_request" | "manual";
  locale: Locale;
  contactName: string;
  fulfilment: "delivery" | "pickup";
  address: string | null;
  fulfilOn: string;
  deliveryFeeRs: number;
  totalRs: number;
  paid: boolean;
  lines: InvoiceOrderLine[];
  request: { occasion: string | null; theme: string | null; servings: number | null } | null;
}

type OrderRow = Omit<InvoiceOrder, "lines" | "request"> & { lines: InvoiceOrderLine[] | string; request: InvoiceOrder["request"] | string };

const parsed = <T>(value: T | string): T => (typeof value === "string" ? (JSON.parse(value) as T) : value);

/** The order with its lines (prices as stored, FR-012) and request fields, in one query. */
export async function readInvoiceOrder(db: Executor, orderId: string): Promise<InvoiceOrder | null> {
  const { rows } = (await db.execute(sql`
    select o.id, o.source, o.locale, o.contact_name as "contactName", o.fulfilment, o.address,
      to_char(o.fulfil_on, 'YYYY-MM-DD') as "fulfilOn", o.delivery_fee_rs as "deliveryFeeRs", o.total_rs as "totalRs", o.paid,
      coalesce((
        select json_agg(json_build_object('nameEn', i.name_en, 'nameFr', i.name_fr, 'quantity', i.quantity,
          'originalBasePriceRs', i.original_base_price_rs, 'unitBasePriceRs', i.unit_base_price_rs, 'lineTotalRs', i.line_total_rs,
          'promotionTitleEn', i.promotion_title_en, 'options', i.options, 'cakeMessage', i.cake_message) order by i.sort_order)
        from order_item i where i.order_id = o.id
      ), '[]'::json) as lines,
      (select json_build_object('occasion', r.occasion, 'theme', r.theme, 'servings', r.servings) from custom_request r where r.order_id = o.id) as request
    from orders o where o.id = ${orderId}::uuid
  `)) as unknown as { rows: OrderRow[] };
  const row = rows[0];
  if (!row) return null;
  return { ...row, deliveryFeeRs: Number(row.deliveryFeeRs), totalRs: Number(row.totalRs), lines: parsed(row.lines), request: row.request === null ? null : parsed(row.request) };
}

export interface InvoiceSettings {
  legalName: string | null;
  brn: string | null;
  address: string | null;
  phone: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  juiceNumber: string | null;
  terms: LocalizedText | null;
  thankYou: LocalizedText | null;
}

/** The Settings values an invoice prints, read fresh (never the display cache). */
export async function readInvoiceSettings(db: Executor): Promise<InvoiceSettings> {
  const { rows } = (await db.execute(sql`
    select invoice_legal_name as "legalName", invoice_brn as brn, invoice_address as address, invoice_phone as phone,
      bank_name as "bankName", bank_account_name as "accountName", bank_account_number as "accountNumber",
      juice_number as "juiceNumber", invoice_payment_terms as terms, invoice_thank_you as "thankYou"
    from settings where id = 1
  `)) as unknown as { rows: (Omit<InvoiceSettings, "terms" | "thankYou"> & { terms: LocalizedText | string | null; thankYou: LocalizedText | string | null })[] };
  const row = rows[0];
  if (!row) throw new Error("settings row 1 is missing (run the migrations)");
  return { ...row, terms: row.terms === null ? null : parsed(row.terms), thankYou: row.thankYou === null ? null : parsed(row.thankYou) };
}
