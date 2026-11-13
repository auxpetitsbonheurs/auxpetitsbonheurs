// Phone normalisation to E.164 (checkout spec "Phone normalisation", FR-021).
// Mauritius (+230) is the default country for local 7- and 8-digit numbers.

const SEPARATORS = /[\s\-.()]/g;

/** wa.me wants the E.164 number as digits only, without "+" (S-204 AC6). */
export function whatsappDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** The E.164 form of `raw` (e.g. "+23057123456"), or null when it is not a phone number. */
export function normalizePhone(raw: string): string | null {
  let value = raw.replace(SEPARATORS, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (value.startsWith("+")) {
    const digits = value.slice(1);
    return /^\d{8,15}$/.test(digits) ? value : null;
  }
  if (!/^\d+$/.test(value)) return null;
  if (value.startsWith("230") && (value.length === 10 || value.length === 11)) return `+${value}`;
  if (value.length === 7 || value.length === 8) return `+230${value}`;
  return null;
}
