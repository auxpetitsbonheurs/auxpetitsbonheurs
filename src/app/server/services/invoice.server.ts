// The invoice document of an order (S-127): numbers it on first use, then builds everything the
// PDF and the print view draw, in the order's language (EN or FR), from the order as stored and
// the Owner's invoice Settings. Website, manual and custom-cake orders all have an `orders` row.
import { type InvoiceDocument, type InvoiceLabels, type InvoiceLine, eventDateParts, invoiceFileName, invoiceRows, invoiceTotals, textLines } from "~/domain/invoice";
import { todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";
import { orderOptionLabels } from "~/server/order-options.server";
import { type InvoiceOrder, type InvoiceSettings, assignInvoiceNumber, readInvoiceOrder, readInvoiceSettings } from "~/server/repos/invoice.server";

const LABEL_KEYS = [
  "invoiceNo", "date", "billTo", "eventDate", "instructions", "quantity", "description", "unitPrice", "total", "subtotal", "adjustment",
  "downpayment", "paid", "totalDue", "paidStamp", "paymentDetails", "bank", "accountName", "accountNumber", "juice", "paymentTerms", "brn", "phone",
] as const satisfies readonly (keyof InvoiceLabels)[];

export function invoiceLabels(locale: Locale): InvoiceLabels {
  return Object.fromEntries(LABEL_KEYS.map((key) => [key, translate(`admin.invoiceDoc.${key}`, locale)])) as unknown as InvoiceLabels;
}

/** Order lines with their options and message as detail lines; a custom request is one "Custom cake" line. */
function orderLines(order: InvoiceOrder, locale: Locale): { rows: InvoiceLine[]; discountRs: number; promotion: string | null } {
  if (order.lines.length === 0) {
    const r = order.request;
    const details = r ? [r.occasion, r.theme, r.servings ? translate("admin.invoiceDoc.servings", locale, { count: r.servings }) : null].filter((d): d is string => Boolean(d)) : [];
    const totalRs = Math.max(0, order.totalRs - order.deliveryFeeRs);
    const name = translate(order.source === "custom_request" ? "admin.invoiceDoc.customCake" : "admin.invoiceDoc.order", locale);
    return { rows: [{ quantity: 1, description: name, details, unitRs: totalRs, totalRs }], discountRs: 0, promotion: null };
  }
  const { rows, discountRs } = invoiceRows(
    order.lines.map((line) => ({
      name: localized(line.nameFr ? { en: line.nameEn, fr: line.nameFr } : { en: line.nameEn }, locale),
      details: [
        ...orderOptionLabels(line.options).map((option) => localized(option.label, locale)),
        ...(line.cakeMessage ? [translate("admin.invoiceDoc.message", locale, { text: line.cakeMessage })] : []),
      ],
      quantity: line.quantity,
      originalBasePriceRs: line.originalBasePriceRs,
      unitBasePriceRs: line.unitBasePriceRs,
      lineTotalRs: line.lineTotalRs,
    })),
  );
  const titles = [...new Set(order.lines.filter((l) => l.promotionTitleEn && l.originalBasePriceRs > l.unitBasePriceRs).map((l) => l.promotionTitleEn))];
  return { rows, discountRs, promotion: titles.length > 0 ? titles.join(", ") : null };
}

function deliveryRow(order: InvoiceOrder, locale: Locale): InvoiceLine[] {
  if (order.deliveryFeeRs <= 0) return [];
  return [{ quantity: null, description: translate("admin.invoiceDoc.delivery", locale), details: [], unitRs: order.deliveryFeeRs, totalRs: order.deliveryFeeRs }];
}

const blankToNull = (value: string | null) => (value && value.trim() !== "" ? value.trim() : null);

function businessOf(settings: InvoiceSettings, locale: Locale): Pick<InvoiceDocument, "business" | "payment" | "terms" | "thankYou"> {
  return {
    business: { legalName: blankToNull(settings.legalName), brn: blankToNull(settings.brn), address: textLines(settings.address), phone: blankToNull(settings.phone) },
    payment: { bankName: blankToNull(settings.bankName), accountName: blankToNull(settings.accountName), accountNumber: blankToNull(settings.accountNumber), juiceNumber: blankToNull(settings.juiceNumber) },
    terms: settings.terms ? textLines(localized(settings.terms, locale)) : [],
    thankYou: settings.thankYou ? blankToNull(localized(settings.thankYou, locale)) : null,
  };
}

/** The document, numbering the order on first use; null when the order does not exist. */
export async function invoiceDocument(db: Executor, orderId: string, now: Date): Promise<InvoiceDocument | null> {
  const order = await readInvoiceOrder(db, orderId);
  if (!order) return null;
  const [stamp, settings] = await Promise.all([assignInvoiceNumber(db, orderId, todayMU(now)), readInvoiceSettings(db)]);
  if (!stamp) return null;
  const locale = order.locale;
  const { rows, discountRs, promotion } = orderLines(order, locale);
  const lines = [...rows, ...deliveryRow(order, locale)];
  const fulfilment = translate(`admin.invoiceDoc.${order.fulfilment}`, locale);
  return {
    number: stamp.number,
    date: stamp.date,
    locale,
    fileName: invoiceFileName(stamp.number),
    labels: invoiceLabels(locale),
    billTo: order.contactName,
    eventDate: eventDateParts(order.fulfilOn, locale),
    instructions: order.fulfilment === "delivery" ? [fulfilment, ...textLines(order.address)] : [fulfilment],
    lines,
    discountLabel: discountRs > 0 ? translate("admin.invoiceDoc.discount", locale, { title: promotion ?? "" }).replace(/[:\s]+$/, "") : null,
    totals: invoiceTotals({ lines, discountRs, totalRs: order.totalRs, paid: order.paid }),
    ...businessOf(settings, locale),
  };
}
