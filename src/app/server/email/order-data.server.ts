// Loads what the order emails show, for many outbox rows in four queries (CPU stays low on the
// cron tick). Reads only the order's own data: no admin note, nothing of another customer.
import { count, eq, inArray } from "drizzle-orm";
import { customRequest, customRequestPhoto, orderItem, orders, settings } from "~/db/schema";
import { formatOrderNumber } from "~/domain/order-number";
import type { Executor } from "~/server/db.server";
import type { OrderEmailData } from "./templates/order-emails";

export type LoadedOrder = Pick<OrderEmailData, "order" | "items" | "request" | "shop">;

/** The order data for each id; ids that no longer exist are absent from the map. */
export async function loadOrderEmailData(db: Executor, orderIds: readonly string[]): Promise<Map<string, LoadedOrder>> {
  const found = new Map<string, LoadedOrder>();
  if (orderIds.length === 0) return found;
  const ids = [...new Set(orderIds)];
  const [rows, lines, requests, photos, [shop]] = await Promise.all([
    db.select().from(orders).where(inArray(orders.id, ids)),
    db.select().from(orderItem).where(inArray(orderItem.orderId, ids)).orderBy(orderItem.sortOrder),
    db.select().from(customRequest).where(inArray(customRequest.orderId, ids)),
    db.select({ orderId: customRequestPhoto.orderId, n: count() }).from(customRequestPhoto).where(inArray(customRequestPhoto.orderId, ids)).groupBy(customRequestPhoto.orderId),
    db.select().from(settings).where(eq(settings.id, 1)).limit(1),
  ]);
  for (const order of rows) {
    const request = requests.find((candidate) => candidate.orderId === order.id);
    found.set(order.id, {
      order: {
        number: formatOrderNumber(order.numberPrefix ?? shop?.orderNumberPrefix ?? "APB-", order.number),
        contactName: order.contactName,
        status: order.status,
        fulfilment: order.fulfilment,
        address: order.address,
        landmark: order.landmark,
        fulfilOn: order.fulfilOn,
        window: order.timeWindow,
        deliveryFeeRs: order.deliveryFeeRs,
        totalRs: order.totalRs,
        paid: order.paid,
        refundDueRs: order.refundDueRs,
        declineReason: order.declineReason,
        trackingToken: order.trackingToken,
        // The Juice deadline counts from here: an accepted quote waits from its acceptance (E-08).
        createdAt: order.awaitingPaymentSince ?? order.createdAt,
      },
      items: lines
        .filter((line) => line.orderId === order.id)
        .map((line) => ({ nameEn: line.nameEn, nameFr: line.nameFr, quantity: line.quantity, lineTotalRs: line.lineTotalRs, options: line.options, cakeMessage: line.cakeMessage })),
      request: request
        ? {
            occasion: request.occasion,
            servings: request.servings,
            theme: request.theme,
            photoCount: photos.find((photo) => photo.orderId === order.id)?.n ?? 0,
            quoteAmountRs: request.quoteAmountRs,
            quoteNote: request.quoteNote,
            quoteExpiresOn: request.quoteExpiresOn,
          }
        : null,
      shop: {
        pickupAddress: shop?.pickupAddress ?? null,
        pickupMapUrl: shop?.pickupMapUrl ?? null,
        juiceName: shop?.juiceName ?? null,
        juiceNumber: shop?.juiceNumber ?? null,
        paymentWhatsapp: shop?.paymentWhatsapp ?? null,
        instagramUrl: shop?.instagramUrl ?? null,
      },
    });
  }
  return found;
}
