// The `apb_basket` cookie format, shared by the server (app/server/basket.server.ts) and the
// browser basket store (app/lib/basket-store.ts) since ADR-0004: URL-encoded JSON lines
// `{ lineId, productId, options, cakeMessage?, quantity }`, never prices, at most 10 lines,
// the whole Set-Cookie string at most 4000 bytes, 30 days. Not HttpOnly (the browser writes
// it); the server treats it as untrusted and re-validates every line with its zod schema.
import { BASKET_MAX_LINES, type BasketLine, LINE_MAX_QUANTITY, LINE_MIN_QUANTITY, type OptionPick } from "./basket";
import { DomainError } from "./errors";

export const BASKET_COOKIE = "apb_basket";
export const BASKET_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Browsers keep cookies up to 4096 bytes including name and attributes. */
export const BASKET_COOKIE_MAX_BYTES = 4000;
export const BASKET_COOKIE_ATTRIBUTES = "Path=/; SameSite=Lax; Secure";

/** The same pattern zod's `z.uuid()` uses (contracts.md `Uuid`). */
const UUID = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const shortText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

/** `z.coerce.number().int().min(min).max(max)`: the number, or undefined when invalid. */
function coercedInt(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

function optionPick(value: unknown): OptionPick | undefined {
  if (!isObject(value) || !isUuid(value.groupId)) return undefined;
  const choiceIds = value.choiceIds ?? [];
  if (!Array.isArray(choiceIds) || choiceIds.length > 20 || !choiceIds.every(isUuid)) return undefined;
  if (value.text !== undefined && !shortText(value.text, 200)) return undefined;
  const quantity = value.quantity === undefined ? undefined : coercedInt(value.quantity, 0, 99);
  if (value.quantity !== undefined && quantity === undefined) return undefined;
  return {
    groupId: value.groupId,
    choiceIds,
    ...(value.text !== undefined ? { text: value.text as string } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
  };
}

/**
 * One cookie line, checked like the server's zod `BasketLine` (unknown keys dropped), or
 * undefined. Kept dependency-free so the browser bundle does not carry zod; a unit test
 * holds it to the zod schema on a corpus of valid and tampered lines.
 */
export function basketLineFrom(value: unknown): BasketLine | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.lineId !== "string" || value.lineId.length < 1 || value.lineId.length > 16) return undefined;
  if (!isUuid(value.productId) || !Array.isArray(value.options) || value.options.length > 20) return undefined;
  const options = value.options.map(optionPick);
  if (options.some((o) => o === undefined)) return undefined;
  if (value.cakeMessage !== undefined && !shortText(value.cakeMessage, 200)) return undefined;
  const quantity = coercedInt(value.quantity, LINE_MIN_QUANTITY, LINE_MAX_QUANTITY);
  if (quantity === undefined) return undefined;
  return {
    lineId: value.lineId,
    productId: value.productId,
    options: options as OptionPick[],
    ...(value.cakeMessage !== undefined ? { cakeMessage: value.cakeMessage as string } : {}),
    quantity,
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return undefined;
  }
}

/**
 * The lines in a raw (URL-encoded) cookie value: invalid lines dropped, duplicate line ids
 * dropped, at most 10; an unparseable value is an empty basket (S-011 AC6).
 */
export function decodeBasket(raw: string | undefined, lineFrom: (value: unknown) => BasketLine | undefined = basketLineFrom): BasketLine[] {
  const value = raw ? parseJson(raw) : undefined;
  if (!Array.isArray(value)) return [];
  const lines: BasketLine[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const line = lineFrom(item);
    if (!line || seen.has(line.lineId)) continue;
    seen.add(line.lineId);
    lines.push(line);
    if (lines.length === BASKET_MAX_LINES) break;
  }
  return lines;
}

export function clearBasketCookie(): string {
  return `${BASKET_COOKIE}=; Max-Age=0; ${BASKET_COOKIE_ATTRIBUTES}`;
}

/** Set-Cookie (or document.cookie) string storing `lines`; BASKET_FULL when it would not fit. */
export function basketCookie(lines: readonly BasketLine[]): string {
  if (lines.length === 0) return clearBasketCookie();
  const header = `${BASKET_COOKIE}=${encodeURIComponent(JSON.stringify(lines))}; Max-Age=${BASKET_MAX_AGE_SECONDS}; ${BASKET_COOKIE_ATTRIBUTES}`;
  if (header.length > BASKET_COOKIE_MAX_BYTES) {
    throw new DomainError("BASKET_FULL", "The basket would not fit in its cookie");
  }
  return header;
}

/** The raw value of the basket cookie in a `Cookie` header or `document.cookie` string. */
export function basketCookieValue(cookieHeader: string | null | undefined): string | undefined {
  for (const part of (cookieHeader ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === BASKET_COOKIE) return part.slice(at + 1).trim();
  }
  return undefined;
}

/** A short random line id (12 base64url characters). */
export function newLineId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_");
}
