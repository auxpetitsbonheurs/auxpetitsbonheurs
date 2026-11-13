// Admin order search (FR-049, S-112): one text box for a name, a phone or an order number.
// Pure: the repository turns the result into parameterised SQL (never string-built).

export const ORDER_QUERY_MAX = 80;

export interface OrderQuery {
  /** Folded text for a name match (lower case, no accents). */
  text: string;
  /** Phone digits without the Mauritius 230 prefix, when the text looks like a phone (≥ 4 digits). */
  digits: string | null;
  /** The order number, from "42", "APB-0042" or "#42". */
  number: number | null;
}

/** Lower case without accents ("Hélène" → "helene"); the SQL side folds the column the same way. */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Accented letters the SQL `translate()` folds, in the same order as `ACCENT_FOLDED`. */
export const ACCENTED = "àáâãäåèéêëìíîïòóôõöùúûüýÿçñœæÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÇÑ";
export const ACCENT_FOLDED = "aaaaaaeeeeiiiiooooouuuuyycnoaAAAAAAEEEEIIIIOOOOOUUUUYYCN";

function phoneDigits(raw: string): string | null {
  if (!/^[\d\s+().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 8 && digits.startsWith("230")) digits = digits.slice(3);
  return digits.length >= 4 ? digits : null;
}

function orderNumber(raw: string): number | null {
  const match = /^(?:[a-z]{1,8}-?|#)?0*(\d{1,9})$/i.exec(raw);
  return match ? Number(match[1]) : null;
}

/** The search to run, or null for the tab default (empty query, AC6). */
export function parseOrderQuery(raw: string | null | undefined): OrderQuery | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  return { text: foldText(trimmed), digits: phoneDigits(trimmed), number: orderNumber(trimmed) };
}

/** A LIKE pattern matching `value` anywhere, with %, _ and \ taken literally (ESCAPE '\'). */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
