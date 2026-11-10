// `placeOrder` pipeline (checkout spec, order is normative). Built in S-013: steps 1
// (parse), 4 (product problems), 5 (date today or later + window in the list), 6
// (server prices vs displayed total), 7 (one transaction) and 9 (caller redirects).
// S-014 adds step 2 (idempotency: a known key returns the original order, also when a
// race is lost on the unique index), bound to the submitter's email (threat-model G-21). Later: step 3 rate limit + Turnstile and the full
// assertOrderable rules (E-05), step 8 sending after commit (E-10).
import { eq, sql } from "drizzle-orm";
import { counter, emailOutbox, orderItem, orders } from "~/db/schema";
import type { TimeWindow } from "~/db/schema";
import type { BasketLine } from "~/domain/basket";
import { formatOrderNumber, newTrackingToken } from "~/domain/order-number";
import { type CheckoutTotals, type PricedLine, checkoutTotals, priceLines } from "~/domain/pricing";
import { todayMU } from "~/domain/time";
import type { Locale } from "~/lib/locale";
import { type PlaceOrderInput, parsePlaceOrder } from "~/server/contracts/site";
import { Uuid } from "~/server/contracts/shared";
import type { Database, Transaction } from "~/server/db.server";
import { type ProductRecord, findProductsByIds } from "~/server/repos/catalogue.server";
import { resolveGuestCustomer } from "~/server/repos/customers.server";
import { appendOrderEvent } from "~/server/repos/order-events.server";
import { type PlacedOrderRef, findOrderByIdempotencyKey } from "~/server/repos/orders.server";
import { type CheckoutSettings, getCheckoutSettings } from "~/server/repos/settings.server";

export interface PlaceOrderContext {
  db: Database;
  now: Date;
  /** The page locale; stored on the order and used for its emails. */
  locale: Locale;
  basket: BasketLine[];
}

/** A placed order; `replayed` when the key already belonged to it (nothing new was written). */
export type PlacedOrder = PlacedOrderRef & { ok: true; orderNumber: string; replayed: boolean };

export type PlaceOrderResult =
  | PlacedOrder
  | { ok: false; code: "VALIDATION_FAILED"; fields: string[] }
  /** The key belongs to an order placed under another email: nothing about it is revealed (G-21). */
  | { ok: false; code: "VALIDATION_FAILED"; fields: []; keyReused: true }
  | { ok: false; code: "PRODUCT_UNAVAILABLE"; lineIds: string[] }
  | { ok: false; code: "DATE_UNAVAILABLE"; reason: "too_soon" }
  | ({ ok: false; code: "PRICE_CHANGED"; lines: PricedLine[] } & CheckoutTotals);

interface Placement {
  input: PlaceOrderInput;
  window: TimeWindow;
  lines: PricedLine[];
  totals: CheckoutTotals;
  products: Map<string, ProductRecord>;
}

/** Step 1 plus the window check, so every invalid field is named at once (AC2). */
function validate(form: Record<string, unknown>, basket: BasketLine[], settings: CheckoutSettings) {
  const parsed = parsePlaceOrder(form);
  const fields = new Set(parsed.ok ? [] : parsed.fields);
  if (basket.length === 0) fields.add("basket");
  const fulfilment = form.fulfilment === "delivery" || form.fulfilment === "pickup" ? form.fulfilment : undefined;
  const windowId = fulfilment ? form[`windowId.${fulfilment}`] : undefined;
  const window = fulfilment ? settings.windows[fulfilment].find((w) => w.id === windowId) : undefined;
  if (fulfilment && !window) fields.add("windowId");
  if (!parsed.ok || !window || fields.size > 0) return { ok: false as const, fields: [...fields] };
  return { ok: true as const, input: parsed.data, window };
}

export async function placeOrder(form: Record<string, unknown>, ctx: PlaceOrderContext): Promise<PlaceOrderResult> {
  const settings = await getCheckoutSettings(ctx.db);
  const placed = (ref: PlacedOrderRef, replayed: boolean): PlacedOrder => ({
    ok: true,
    ...ref,
    orderNumber: formatOrderNumber(settings.orderNumberPrefix, ref.number),
    replayed,
  });
  // Step 2 runs on the key and email alone, before the rest is validated: a replay after
  // success posts with an emptied basket (cookie cleared) or a changed payload, and the
  // key wins, but only for the submitter who placed the order (G-21).
  const key = Uuid.safeParse(form.idempotencyKey);
  const existing = key.success ? await findOrderByIdempotencyKey(ctx.db, key.data) : undefined;
  if (existing) return replayFor(form, existing, placed);

  const valid = validate(form, ctx.basket, settings);
  if (!valid.ok) return { ok: false, code: "VALIDATION_FAILED", fields: valid.fields };
  const { input, window } = valid;

  const products = await findProductsByIds(ctx.db, ctx.basket.map((l) => l.productId));
  const lines = priceLines(ctx.basket, products);
  const unavailable = lines.filter((l) => l.problem !== null).map((l) => l.lineId);
  if (unavailable.length > 0) return { ok: false, code: "PRODUCT_UNAVAILABLE", lineIds: unavailable };

  if (input.date < todayMU(ctx.now)) return { ok: false, code: "DATE_UNAVAILABLE", reason: "too_soon" };

  const totals = checkoutTotals(lines, input.fulfilment, settings.deliveryFeeRs);
  if (input.displayedTotalRs !== totals.totalRs) return { ok: false, code: "PRICE_CHANGED", lines, ...totals };

  try {
    return placed(await insertOrder(ctx, { input, window, lines, totals, products }), false);
  } catch (error) {
    // Lost race: both requests passed the lookup; ours rolled back (no number consumed).
    if (!isUniqueViolation(error, "orders_idempotency_key_unique")) throw error;
    const winner = await findOrderByIdempotencyKey(ctx.db, input.idempotencyKey);
    if (!winner) throw error;
    return replayFor(form, winner, placed);
  }
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

const KEY_REUSED = { ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true } as const;

/** The original order only when the posted email is the order's (normalised); else a neutral refusal. */
function replayFor(
  form: Record<string, unknown>,
  existing: { ref: PlacedOrderRef; contactEmail: string | null },
  placed: (ref: PlacedOrderRef, replayed: boolean) => PlacedOrder,
): PlaceOrderResult {
  const posted = typeof form["contact.email"] === "string" ? normaliseEmail(form["contact.email"]) : "";
  const stored = existing.contactEmail === null ? null : normaliseEmail(existing.contactEmail);
  return posted !== "" && posted === stored ? placed(existing.ref, true) : { ...KEY_REUSED, fields: [] };
}

/** True when `error` (or a cause it wraps, e.g. DrizzleQueryError) is a 23505 on `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    const pg = current as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    // PGlite names the field `constraint`, postgres.js `constraint_name`.
    if (pg.code === "23505" && (pg.constraint === constraint || pg.constraint_name === constraint)) return true;
    current = pg.cause;
  }
  return false;
}

/** Step 7: customer, number, order, items, event and outbox row commit or roll back together. */
async function insertOrder(ctx: PlaceOrderContext, placement: Placement) {
  const { input } = placement;
  return ctx.db.transaction(async (tx) => {
    const customerId = await resolveGuestCustomer(tx, input.contact, ctx.locale);
    const number = await nextOrderNumber(tx);
    const trackingToken = newTrackingToken();
    const [order] = await tx
      .insert(orders)
      .values({ ...orderRow(ctx, placement), number, customerId, trackingToken })
      .returning({ id: orders.id });
    const orderId = order!.id;
    await tx.insert(orderItem).values(itemRows(orderId, placement));
    await appendOrderEvent(tx, { orderId, actor: { type: "customer" }, type: "created", toStatus: "pending_approval" });
    await tx.insert(emailOutbox).values({
      template: "order_received",
      toEmail: input.contact.email,
      locale: ctx.locale,
      payload: { orderId },
      orderId,
      dedupeKey: `order:${orderId}:received`,
    });
    return { orderId, number, trackingToken, locale: ctx.locale };
  });
}

/** Gap-free: the increment is rolled back with the transaction (NFR-013). */
async function nextOrderNumber(tx: Transaction): Promise<number> {
  const [row] = await tx
    .update(counter)
    .set({ value: sql`${counter.value} + 1` })
    .where(eq(counter.name, "order_number"))
    .returning({ value: counter.value });
  if (!row) throw new Error("counter 'order_number' is missing (run the migrations)");
  return row.value;
}

function orderRow(ctx: PlaceOrderContext, { input, window, totals }: Placement) {
  const delivery = input.fulfilment === "delivery" ? input : undefined;
  return {
    source: "website" as const,
    status: "pending_approval" as const,
    contactName: input.contact.name,
    contactPhone: input.contact.phone,
    contactEmail: input.contact.email,
    fulfilment: input.fulfilment,
    address: delivery?.address ?? null,
    landmark: delivery?.landmark ?? null,
    fulfilOn: input.date,
    timeWindow: window,
    itemsTotalRs: totals.itemsTotalRs,
    deliveryFeeRs: totals.deliveryFeeRs,
    totalRs: totals.totalRs,
    customerNote: input.contact.note ?? null,
    locale: ctx.locale,
    idempotencyKey: input.idempotencyKey,
    policiesAcceptedAt: ctx.now,
  };
}

/** Names and prices are copied at placement and never recomputed (FR-012, FR-017). */
function itemRows(orderId: string, { lines, products }: Placement) {
  return lines.map((line, index) => ({
    orderId,
    productId: line.productId,
    nameEn: line.name.en,
    nameFr: products.get(line.productId)?.name.fr ?? null,
    originalBasePriceRs: line.originalUnitPriceRs,
    unitBasePriceRs: line.unitPriceRs,
    promotionId: line.promotionId,
    cakeMessage: line.cakeMessage,
    quantity: line.quantity,
    lineTotalRs: line.lineTotalRs,
    sortOrder: index,
  }));
}
