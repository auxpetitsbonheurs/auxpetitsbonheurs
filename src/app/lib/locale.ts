/** Ground rules from the build brief: Mauritius time zone, whole-rupee prices. */
export const BAKERY_TIME_ZONE = "Indian/Mauritius";
export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const RUPEE_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** Formats a whole-rupee amount as "Rs 1,250". */
export function formatRupees(amount: number): string {
  return `Rs ${RUPEE_FORMAT.format(Math.round(amount))}`;
}
