// "Cost to make" and "Cost to run" (S-318, contracts.md "Costs and profit"): what an admin types
// is turned into whole rupees here, so the order page, the workshop page and the server agree.

/** Highest cost an admin may enter, in rupees (S-318 AC3). */
export const COST_MAX_RS = 1_000_000;

export type CostParse = { ok: true; costRs: number | null } | { ok: false };

/**
 * "" (or spaces) clears the cost (null); otherwise whole rupees 0..1,000,000. Spaces and commas
 * used as thousands separators are accepted ("1,500", "1 500"); decimals, signs and letters are not.
 */
export function parseCostRs(text: string): CostParse {
  const compact = text.trim().replace(/[\s,]/g, "");
  if (compact === "") return { ok: true, costRs: null };
  if (!/^\d{1,7}$/.test(compact)) return { ok: false };
  const costRs = Number(compact);
  return costRs <= COST_MAX_RS ? { ok: true, costRs } : { ok: false };
}
