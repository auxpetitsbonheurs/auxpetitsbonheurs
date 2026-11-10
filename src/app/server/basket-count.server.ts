// Basket count for the header (S-007). The basket lives in the HttpOnly cookie
// `apb_basket` (architecture: data). PROVISIONAL line shape `{ productId, quantity }`;
// S-011 owns the cookie format and replaces this reader with the full basket parser.
// Invalid lines are dropped, an unparseable cookie is an empty basket (S-011 AC6).
import { z } from "zod";
import { readCookie } from "~/lib/cookies";

export const BASKET_COOKIE = "apb_basket";
const MAX_LINES = 10;

const line = z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(50) });

function parseLines(raw: string): unknown[] {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(value) ? value.slice(0, MAX_LINES) : [];
  } catch {
    return [];
  }
}

/** Number of items (sum of line quantities) in the visitor's basket. */
export function readBasketCount(request: Request): number {
  const raw = readCookie(request, BASKET_COOKIE);
  if (!raw) return 0;
  return parseLines(raw).reduce<number>((sum, item) => {
    const parsed = line.safeParse(item);
    return parsed.success ? sum + parsed.data.quantity : sum;
  }, 0);
}
