// Finding the returning customer of a manual order (FR-057, admin-manual-orders spec "Customer
// matching"): email first (any case), then phone in any format. Pure; the repository runs the
// lookups. A typed email is never written onto a matched customer (threat-model G-02).
import { normalizePhone } from "./phone";

/**
 * The digit strings a stored phone may equal for `raw`: the E.164 digits, and for a Mauritius
 * number also the 8-digit local form (older rows were stored as typed). Empty when not a phone.
 */
export function phoneKeys(raw: string): string[] {
  const e164 = normalizePhone(raw);
  if (!e164) return [];
  const digits = e164.slice(1);
  return digits.startsWith("230") ? [digits, digits.slice(3)] : [digits];
}

export interface Match<C> {
  customer: C | null;
  /** Email and phone matched different customers: the email match is used, with a notice (AC5). */
  conflict: boolean;
}

export function chooseMatch<C extends { id: string }>(byEmail: C | null, byPhone: C | null): Match<C> {
  if (byEmail) return { customer: byEmail, conflict: byPhone !== null && byPhone.id !== byEmail.id };
  return { customer: byPhone, conflict: false };
}
