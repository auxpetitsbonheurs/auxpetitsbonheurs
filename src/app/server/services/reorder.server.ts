// Reorder (E-11 S-214; contracts.md `account/orders` reorder): the signed-in customer's own past
// order goes back into the basket at today's prices; what cannot be ordered today is skipped with
// its reason and shown on the basket once (a short-lived flash cookie, `reorderSkipped`).
import { type BasketLine, BASKET_MAX_LINES } from "~/domain/basket";
import { priceBasketFromMenu } from "~/domain/menu-pricing";
import { type Skipped, reorderInto } from "~/domain/reorder";
import { readCookie } from "~/lib/cookies";
import type { GuardArgs } from "~/server/auth.server";
import { newLineId, readBasket } from "~/server/basket.server";
import { clockContext } from "~/server/clock.server";
import type { CustomerAccount } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { loadMenu } from "~/server/menu.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findReorderItems } from "~/server/repos/customer-accounts.server";

export const REORDER_FLASH = "apb_reorder";
const FLASH_ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";

export interface ReorderFlash {
  added: number;
  skipped: Skipped[];
}

/** The note for the basket: only names and reason codes (no personal data), one minute, read once. */
export function reorderFlashCookie(flash: ReorderFlash): string {
  return `${REORDER_FLASH}=${encodeURIComponent(JSON.stringify(flash))}; ${FLASH_ATTRIBUTES}; Max-Age=60`;
}

export const clearReorderFlash = `${REORDER_FLASH}=; ${FLASH_ATTRIBUTES}; Max-Age=0`;

const REASONS = new Set(["sold_out", "hidden", "out_of_season", "option_removed", "free_text", "basket_full"]);

/** The flash on this request, validated (it is client-held input), or null. */
export function readReorderFlash(request: Request): ReorderFlash | null {
  const raw = readCookie(request, REORDER_FLASH);
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as ReorderFlash;
    const skipped = (Array.isArray(value.skipped) ? value.skipped : [])
      .filter((s) => s && REASONS.has(s.reason) && typeof s.name?.en === "string")
      .slice(0, 50)
      .map((s) => ({ reason: s.reason, name: { en: String(s.name.en).slice(0, 120), fr: String(s.name.fr ?? s.name.en).slice(0, 120) } }));
    return { added: Math.max(0, Math.min(BASKET_MAX_LINES, Number(value.added) || 0)), skipped };
  } catch {
    return null;
  }
}

/** The new basket and the note; null when the order is not the customer's own (NOT_FOUND). */
export async function reorder(args: GuardArgs, customer: CustomerAccount, orderId: string): Promise<({ lines: BasketLine[] } & ReorderFlash) | null> {
  const db = args.context.get(requestDbContext).db;
  const items = await findReorderItems(db, customer.id, customer.authEmail, orderId);
  if (!items) return null;
  const clock = args.context.get(clockContext);
  const now = clock.now();
  const menu = await loadMenu({ db, supabaseUrl: args.context.get(publicConfigContext).supabaseUrl, now, fixedClock: clock.fixed });
  const problemOf = (line: Omit<BasketLine, "lineId">) => {
    const [priced] = priceBasketFromMenu([{ ...line, lineId: "check" }], menu.data, menu.data.today, now.getTime());
    return priced ? priced.problem : "hidden";
  };
  return reorderInto(readBasket(args.request), items, problemOf, newLineId);
}
