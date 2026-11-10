// Order lookups shared by checkout (idempotent replay, S-014) and the token pages
// (confirmation S-015, tracking S-016). Every lookup uses a unique index.
import { eq } from "drizzle-orm";
import { orders } from "~/db/schema";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export interface PlacedOrderRef {
  orderId: string;
  number: number;
  trackingToken: string;
  locale: Locale;
}

const placedRef = {
  orderId: orders.id,
  number: orders.number,
  trackingToken: orders.trackingToken,
  locale: orders.locale,
} as const;

/** The order a checkout form render already created, if any (FR-023). */
export async function findOrderByIdempotencyKey(db: Executor, key: string): Promise<PlacedOrderRef | undefined> {
  const [row] = await db.select(placedRef).from(orders).where(eq(orders.idempotencyKey, key)).limit(1);
  return row;
}

/** The order behind a tracking token (unique index); callers check the format first. */
export async function findOrderRefByToken(db: Executor, token: string): Promise<PlacedOrderRef | undefined> {
  const [row] = await db.select(placedRef).from(orders).where(eq(orders.trackingToken, token)).limit(1);
  return row;
}
