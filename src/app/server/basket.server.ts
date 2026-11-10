// The basket lives in the HttpOnly cookie `apb_basket` (architecture: data; checkout
// spec "Basket storage"): JSON lines `{ lineId, productId, options, cakeMessage?,
// quantity }`, never prices, under 4 kB, at most 10 lines. Invalid lines are dropped,
// an unparseable cookie is an empty basket (S-011 AC6).
import { BASKET_MAX_LINES, type BasketLine, basketItemCount } from "~/domain/basket";
import { DomainError } from "~/domain/errors";
import { readCookie } from "~/lib/cookies";
import { BasketLine as BasketLineSchema } from "./contracts/shared";

export const BASKET_COOKIE = "apb_basket";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
/** Browsers keep cookies up to 4096 bytes including name and attributes. */
const MAX_HEADER_BYTES = 4000;
const ATTRIBUTES = "Path=/; SameSite=Lax; Secure; HttpOnly";

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return undefined;
  }
}

/** The visitor's basket lines (valid ones only, unique line ids, at most 10). */
export function readBasket(request: Request): BasketLine[] {
  const raw = readCookie(request, BASKET_COOKIE);
  const value = raw ? parseJson(raw) : undefined;
  if (!Array.isArray(value)) return [];
  const lines: BasketLine[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const parsed = BasketLineSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.lineId)) continue;
    seen.add(parsed.data.lineId);
    lines.push(parsed.data);
    if (lines.length === BASKET_MAX_LINES) break;
  }
  return lines;
}

/** Number of items (sum of line quantities) for the header basket link. */
export function readBasketCount(request: Request): number {
  return basketItemCount(readBasket(request));
}

export function clearBasketCookie(): string {
  return `${BASKET_COOKIE}=; Max-Age=0; ${ATTRIBUTES}`;
}

/** Set-Cookie header storing `lines`; BASKET_FULL when it would not fit in a cookie. */
export function basketCookie(lines: readonly BasketLine[]): string {
  if (lines.length === 0) return clearBasketCookie();
  const header = `${BASKET_COOKIE}=${encodeURIComponent(JSON.stringify(lines))}; Max-Age=${THIRTY_DAYS_SECONDS}; ${ATTRIBUTES}`;
  if (header.length > MAX_HEADER_BYTES) {
    throw new DomainError("BASKET_FULL", "The basket would not fit in its cookie");
  }
  return header;
}

/** A short random line id (12 base64url characters). */
export function newLineId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_");
}
