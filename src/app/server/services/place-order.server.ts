// `placeOrder` pipeline (checkout spec, order is normative). Built in S-013: steps 1
// (parse), 4 (product problems), 5 (date today or later + window in the list), 6
// (server prices vs displayed total), 7 (one transaction) and 9 (caller redirects).
// Later: step 2 idempotency (S-014), step 3 rate limit + Turnstile and the full
// assertOrderable rules (E-05), step 8 sending after commit (E-10).
import { eq, sql } from "drizzle-orm";
import { counter, emailOutbox, orderEvent, orderItem, orders } from "~/db/schema";
import type { TimeWindow } from "~/db/schema";
import type { BasketLine } from "~/domain/basket";
import { formatOrderNumber, newTrackingToken } from "~/domain/order-number";
import { type CheckoutTotals, type PricedLine, checkoutTotals, priceLines } from "~/domain/pricing";
import { todayMU } from "~/domain/time";
import type { Locale } from "~/lib/locale";
import { type PlaceOrderInput, parsePlaceOrder } from "~/server/contracts/site";
import type { Database, Transaction } from "~/server/db.server";
import { type ProductRecord, findProductsByIds } from "~/server/repos/catalogue.server";
import { resolveGuestCustomer } from "~/server/repos/customers.server";
import { type CheckoutSettings, getCheckoutSettings } from "~/server/repos/settings.server";

export interface PlaceOrderContext {
  db: Database;
  now: Date;
  /** The page locale; stored on the order and used for its emails. */
  locale: Locale;
  basket: BasketLine[];
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; number: number; orderNumber: string; trackingToken: string }
  | { ok: false; code: "VALIDATION_FAILED"; fields: string[] }
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

  const placed = await insertOrder(ctx, { input, window, lines, totals, products });
  return { ok: true, ...placed, orderNumber: formatOrderNumber(settings.orderNumberPrefix, placed.number) };
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
    await tx.insert(orderEvent).values({ orderId, actorType: "customer", type: "created", toStatus: "pending_approval" });
    await tx.insert(emailOutbox).values({
      template: "order_received",
      toEmail: input.contact.email,
      locale: ctx.locale,
      payload: { orderId },
      orderId,
      dedupeKey: `order:${orderId}:received`,
    });
    return { orderId, number, trackingToken };
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
