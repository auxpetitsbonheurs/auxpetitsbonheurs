// Places a real order through the basket action for route tests (S-015, S-016).
import { randomUUID } from "node:crypto";
import { insertProduct } from "~/db/testing/catalogue";
import type { TestDatabase } from "~/db/testing/pglite";
import { action as basketAction } from "~/routes/site/basket";
import { basketCookie } from "~/server/basket.server";
import { cookieFrom, routeArgs } from "./route-context";

export interface PlacedTestOrder {
  /** The confirmation path the action redirected to. */
  path: string;
  token: string;
  /** The `apb_confirmed` cookie the action set, as `name=value` (AC48). */
  confirmationCookie: string;
}

export const DELIVERY_ORDER = {
  fulfilment: "delivery",
  address: "12 Royal Road, Rose Hill",
  landmark: "Opposite the church",
  "windowId.delivery": "morning",
  displayedTotalRs: "1900",
} as const;

/**
 * Placed on Thu 2026-11-05 (Mauritius): with the default notice of 3 days every date from
 * Mon 9 Nov is orderable (S-083), so tests keep their Nov 12-16 dates.
 */
export const TEST_ORDER_PLACED_AT = "2026-11-05T08:00:00Z";

/** A pickup order of one sample cake for aisha@example.com unless `overrides` say otherwise. */
export async function placeTestOrder(
  database: TestDatabase,
  options: { basketPath?: string; quantity?: number; overrides?: Record<string, string>; extraLines?: string[]; now?: string } = {},
): Promise<PlacedTestOrder> {
  const productId = await insertProduct(database.db, { slug: `cake-${randomUUID().slice(0, 8)}` });
  const extra = (options.extraLines ?? []).map((id, i) => ({ lineId: `x${i}`, productId: id, options: [], quantity: 1 }));
  const cookie = cookieFrom(basketCookie([{ lineId: "a", productId, options: [], quantity: options.quantity ?? 1 }, ...extra]));
  const form = {
    intent: "placeOrder",
    idempotencyKey: randomUUID(),
    displayedTotalRs: String(850 * (options.quantity ?? 1)),
    fulfilment: "pickup",
    date: "2026-11-12",
    "windowId.pickup": "morning",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
    ...options.overrides,
  };
  const now = options.now ?? TEST_ORDER_PLACED_AT;
  const response: unknown = await basketAction(routeArgs(database, { path: options.basketPath ?? "/basket", cookie, form, now }) as never);
  const path = response instanceof Response ? response.headers.get("Location") : null;
  const token = path ? /\/order\/([^/]+)\/confirmed$/.exec(path)?.[1] : undefined;
  if (!path || !token) throw new Error(`placing the test order was refused: ${JSON.stringify((response as { data?: unknown }).data)}`);
  const confirmed = (response as Response).headers.getSetCookie().find((c) => c.startsWith("apb_confirmed="));
  return { path, token, confirmationCookie: confirmed ? cookieFrom(confirmed) : "" };
}
