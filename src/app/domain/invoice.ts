// Invoices (S-127): pure rules shared by the server (numbering, the document's data), the
// lazily loaded PDF builder and the print view. Money is whole rupees; dates are Mauritius dates.
import type { Locale } from "~/lib/locale";

/** The first number when nothing was ever issued here: the client's last paper invoice was 1107. */
export const FIRST_INVOICE_NUMBER = 1108;
export const INVOICE_NUMBER_MAX = 99_999_999;
export const INVOICE_TEXT_MAX = 120;
export const INVOICE_ADDRESS_MAX = 300;
export const INVOICE_TERMS_MAX = 1_000;
export const INVOICE_THANKS_MAX = 200;
/** Bank account number: digits and single spaces, 6 to 30 characters ("000 000 000 000"). */
export const BANK_ACCOUNT_PATTERN = /^\d(?:\d| (?=\d)){5,29}$/;
/** Business Registration Number: letters and digits, e.g. "C00000000". */
export const BRN_PATTERN = /^[A-Za-z0-9]{1,20}$/;

/** `Invoice-1108.pdf`, the same in both languages (the Owner finds it by number). */
export const invoiceFileName = (number: number) => `Invoice-${number}.pdf`;

/** "05/11/2026" from "2026-11-05" (the invoice date, as on the paper template). */
export function formatInvoiceDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** "st", "nd", "rd" or "th" for an English day of the month (11th, 12th, 13th, 21st, 22nd). */
export function ordinalSuffix(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
}

const MONTHS: Record<Locale, readonly string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
};

/** The event date in parts, the suffix set raised: "5" "th" "November 2026" (EN), "1" "er" "décembre 2026" (FR). */
export interface DateParts {
  day: string;
  suffix: string;
  rest: string;
}

export function eventDateParts(date: string, locale: Locale): DateParts {
  const [year = "", month = "1", day = "1"] = date.split("-");
  const d = Number(day);
  const suffix = locale === "en" ? ordinalSuffix(d) : d === 1 ? "er" : "";
  return { day: String(d), suffix, rest: `${MONTHS[locale][Number(month) - 1] ?? ""} ${year}` };
}

export const eventDateText = (parts: DateParts) => `${parts.day}${parts.suffix} ${parts.rest}`;

/** One row of the items table: an order line or the delivery fee. */
export interface InvoiceLine {
  /** Null for the delivery row (no quantity, as on the template). */
  quantity: number | null;
  description: string;
  /** Size, options and the cake message, one per printed line. */
  details: string[];
  unitRs: number;
  totalRs: number;
}

export interface InvoiceTotals {
  /** Every row at its price before promotions (order lines and delivery). */
  subtotalRs: number;
  /** Promotion savings, shown as a minus line; 0 = none. */
  discountRs: number;
  /** A total set by hand (S-122 override) differs from the rows: the difference, signed; 0 = none. */
  adjustmentRs: number;
  totalRs: number;
  /** Already paid: the whole total once the order is marked paid (full payment by Juice, no deposit). */
  paidRs: number;
  /** The balance: 0 when paid. */
  dueRs: number;
}

/** Totals that always add up: subtotal − discount + adjustment = total; total − paid = due. */
export function invoiceTotals(input: { lines: readonly InvoiceLine[]; discountRs: number; totalRs: number; paid: boolean }): InvoiceTotals {
  const subtotalRs = input.lines.reduce((sum, line) => sum + line.totalRs, 0);
  const adjustmentRs = input.totalRs - (subtotalRs - input.discountRs);
  const paidRs = input.paid ? input.totalRs : 0;
  return { subtotalRs, discountRs: input.discountRs, adjustmentRs, totalRs: input.totalRs, paidRs, dueRs: input.totalRs - paidRs };
}

/** A stored order line as the invoice reads it (FR-012 snapshot: prices never recomputed). */
export interface StoredLine {
  name: string;
  details: string[];
  quantity: number;
  originalBasePriceRs: number;
  unitBasePriceRs: number;
  lineTotalRs: number;
}

/**
 * Rows at the price before any promotion, and the promotion savings to show as one line: the
 * stored line total plus what the sale took off the base price, per unit.
 */
export function invoiceRows(lines: readonly StoredLine[]): { rows: InvoiceLine[]; discountRs: number } {
  let discountRs = 0;
  const rows = lines.map((line) => {
    const saved = Math.max(0, line.originalBasePriceRs - line.unitBasePriceRs) * line.quantity;
    discountRs += saved;
    const totalRs = line.lineTotalRs + saved;
    return { quantity: line.quantity, description: line.name, details: line.details, unitRs: Math.round(totalRs / line.quantity), totalRs };
  });
  return { rows, discountRs };
}

/** The document's text in the order's language, resolved on the server (`admin.invoiceDoc.*`). */
export interface InvoiceLabels {
  invoiceNo: string;
  date: string;
  billTo: string;
  eventDate: string;
  instructions: string;
  quantity: string;
  description: string;
  unitPrice: string;
  total: string;
  subtotal: string;
  adjustment: string;
  downpayment: string;
  paid: string;
  totalDue: string;
  paidStamp: string;
  paymentDetails: string;
  bank: string;
  accountName: string;
  accountNumber: string;
  juice: string;
  paymentTerms: string;
  brn: string;
  phone: string;
}

/** Everything the PDF and the print view draw: built on the server, sent as JSON. */
export interface InvoiceDocument {
  number: number;
  /** YYYY-MM-DD, the day the first invoice was generated (Mauritius). */
  date: string;
  locale: Locale;
  fileName: string;
  labels: InvoiceLabels;
  business: { legalName: string | null; brn: string | null; address: string[]; phone: string | null };
  billTo: string;
  eventDate: DateParts;
  /** "Delivery" or "Pickup", then the delivery address lines. */
  instructions: string[];
  lines: InvoiceLine[];
  /** "Promotion: Mother's Day" when there are savings, else null. */
  discountLabel: string | null;
  totals: InvoiceTotals;
  payment: { bankName: string | null; accountName: string | null; accountNumber: string | null; juiceNumber: string | null };
  terms: string[];
  thankYou: string | null;
}

/** The Invoice section of Settings as the Owner edits it (terms and thank-you line in EN/FR). */
export interface OwnerInvoiceSettings {
  legalName: string | null;
  brn: string | null;
  address: string | null;
  phone: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  paymentTerms: { en: string; fr?: string } | null;
  thankYou: { en: string; fr?: string } | null;
  nextNumber: number;
}

/** Non-empty lines of a free text (address, terms), trimmed. */
export const textLines = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
