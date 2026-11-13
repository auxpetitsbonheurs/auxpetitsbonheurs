// Owner Settings rules (S-058, S-059, FR-067). Pure: shared by the Settings form (limits,
// hints) and the save (contracts.md `SettingsInput`).

export const DELIVERY_FEE_MAX_RS = 100_000;
export const PICKUP_ADDRESS_MAX = 300;
export const URL_MAX = 500;
/** A phone (S-277), at most 20 characters like the other phones. */
export const JUICE_NUMBER_MAX = 20;
export const QUOTE_VALIDITY_MIN = 1;
export const QUOTE_VALIDITY_MAX = 60;
export const CAKE_MESSAGE_MIN = 10;
export const CAKE_MESSAGE_MAX = 200;
export const HERO_TAGLINE_MAX = 200;
/** About, FAQ, policies and privacy note, per language (S-059 AC2). */
export const CONTENT_TEXT_MAX = 10_000;
export const FEATURED_MAX = 6;
/** One to five capital letters and an optional dash ("APB-"). */
export const ORDER_PREFIX_PATTERN = /^[A-Z]{1,5}-?$/;
/** "HH:mm", 24-hour (Mauritius time). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Text in English and (optionally) French; blank French falls back to English on French pages. */
export interface LocalizedValue {
  en: string;
  fr?: string;
}

const KEYWORDS = { en: ["cancellation", "storage"], fr: ["annulation", "conservation"] } as const;

/**
 * True when the policies text lost the cancellation or storage entry (S-059 AC4, FR-010).
 * Spec decision: a case-insensitive keyword check on each language that has text; English
 * is always checked. A warning only: the save goes ahead.
 */
export function policiesMissingEntries(policies: LocalizedValue | null): boolean {
  const en = (policies?.en ?? "").toLowerCase();
  const fr = (policies?.fr ?? "").trim().toLowerCase();
  if (!KEYWORDS.en.every((word) => en.includes(word))) return true;
  return fr !== "" && !KEYWORDS.fr.every((word) => fr.includes(word));
}
