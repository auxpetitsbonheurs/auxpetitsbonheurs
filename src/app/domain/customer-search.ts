// Customer search (S-175, FR-065): one query box for name, email or phone. A query that looks
// like a phone number also matches on digits only, so "5712 3456" finds +23057123456 (FR-021).

export const CUSTOMER_SEARCH_MAX = 80;

/** Phone-looking: digits with spaces, dashes, dots, brackets and a leading + only. */
const PHONE_LIKE = /^\+?[\d\s\-.()]+$/;
const MIN_PHONE_DIGITS = 3;

export type CustomerSearch = { ok: true; text: string; digits: string | null } | { ok: false; code: "VALIDATION_FAILED" };

export function parseCustomerSearch(raw: string | null | undefined): CustomerSearch {
  const text = (raw ?? "").trim();
  if (text.length > CUSTOMER_SEARCH_MAX) return { ok: false, code: "VALIDATION_FAILED" };
  const digits = text.replace(/\D/g, "");
  return { ok: true, text, digits: PHONE_LIKE.test(text) && digits.length >= MIN_PHONE_DIGITS ? digits : null };
}

/** The text with LIKE wildcards escaped (escape character `\`), so `%`, `_` match literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
