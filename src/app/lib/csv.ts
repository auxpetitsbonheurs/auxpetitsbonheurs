// CSV for Excel (S-179; contracts.md `admin/sales-csv`): UTF-8 with BOM so accents open
// correctly, comma separator, CRLF rows, RFC 4180 quoting, and formula-injection guarding:
// text that a spreadsheet would run as a formula is prefixed with an apostrophe.

/** Byte order mark: Excel reads the file as UTF-8 only with it (S-179 AC2). */
export const CSV_BOM = "\uFEFF";

export type CsvValue = string | number | boolean | null | undefined;

/** Leading characters spreadsheets treat as a formula (OWASP CSV injection), tab and CR included. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** One cell: numbers as written, booleans yes/no, text guarded then quoted when needed. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** One record, CRLF-terminated. */
export function csvRow(values: readonly CsvValue[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}
