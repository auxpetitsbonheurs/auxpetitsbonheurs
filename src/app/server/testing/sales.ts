// Direct order rows for the sales and customers tests (E-09): many orders in any status,
// date and amount without going through checkout. PGlite only.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { customer, orderItem, orders } from "~/db/schema";
import type { TestDatabase } from "~/db/testing/pglite";
import { DELETED_CUSTOMER_NAME } from "~/domain/customer-totals";
import type { OrderSource, OrderStatus } from "~/domain/status";

type Db = TestDatabase["db"];

export interface TestCustomer {
  name?: string;
  phone?: string;
  email?: string | null;
  locale?: "en" | "fr";
  adminNote?: string | null;
  /** Already anonymised (PRV-02): the "Deleted customer" placeholders and `anonymised_at`. */
  anonymised?: boolean;
}

export async function insertTestCustomer(db: Db, values: TestCustomer = {}): Promise<string> {
  const [row] = await db
    .insert(customer)
    .values({
      name: values.name ?? (values.anonymised ? DELETED_CUSTOMER_NAME : "Anna Rault"),
      phone: values.phone ?? (values.anonymised ? DELETED_CUSTOMER_NAME : "+23057123456"),
      email: values.email === undefined ? `${randomUUID().slice(0, 8)}@example.com` : values.email,
      locale: values.locale ?? "en",
      adminNote: values.adminNote ?? null,
      anonymisedAt: values.anonymised ? new Date("2026-01-01T00:00:00Z") : null,
    })
    .returning({ id: customer.id });
  return row!.id;
}

export interface TestItem {
  productId?: string | null;
  name?: string;
  quantity?: number;
  lineTotalRs?: number;
}

export interface TestSaleOrder {
  customerId: string;
  status?: OrderStatus;
  source?: OrderSource;
  fulfilment?: "delivery" | "pickup";
  fulfilOn?: string;
  totalRs?: number;
  deliveryFeeRs?: number;
  paid?: boolean;
  contactName?: string;
  items?: TestItem[];
  createdAt?: Date;
}

const WINDOW = { id: "morning", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } };

/** Inserts one order (pickup, completed, Rs 1,000 on 12 Nov 2026 unless told otherwise); returns its id and number. */
export async function insertTestOrder(db: Db, values: TestSaleOrder): Promise<{ id: string; number: number }> {
  const [{ next }] = (await db.execute(sql`select coalesce(max(number), 0) + 1 as next from orders`)).rows as [{ next: number }];
  const fulfilment = values.fulfilment ?? "pickup";
  const totalRs = values.totalRs ?? 1000;
  const deliveryFeeRs = values.deliveryFeeRs ?? 0;
  const [row] = await db
    .insert(orders)
    .values({
      number: Number(next),
      numberPrefix: "APB-",
      source: values.source ?? "website",
      status: values.status ?? "completed",
      customerId: values.customerId,
      contactName: values.contactName ?? "Anna Rault",
      contactPhone: "+23057123456",
      contactEmail: "anna@example.com",
      fulfilment,
      address: fulfilment === "delivery" ? "12 Royal Road, Rose Hill" : null,
      fulfilOn: values.fulfilOn ?? "2026-11-12",
      timeWindow: WINDOW,
      itemsTotalRs: totalRs - deliveryFeeRs,
      deliveryFeeRs,
      totalRs,
      paid: values.paid ?? false,
      paidAt: values.paid ? new Date("2026-11-10T08:00:00Z") : null,
      locale: "en",
      trackingToken: randomUUID(),
      ...(values.createdAt ? { createdAt: values.createdAt } : {}),
    })
    .returning({ id: orders.id, number: orders.number });
  const items = values.items ?? [];
  if (items.length > 0) {
    await db.insert(orderItem).values(
      items.map((item, i) => {
        const quantity = item.quantity ?? 1;
        const lineTotalRs = item.lineTotalRs ?? 0;
        return {
          orderId: row!.id,
          productId: item.productId ?? null,
          nameEn: item.name ?? "Item",
          originalBasePriceRs: Math.round(lineTotalRs / quantity),
          unitBasePriceRs: Math.round(lineTotalRs / quantity),
          quantity,
          lineTotalRs,
          sortOrder: i,
        };
      }),
    );
  }
  return row!;
}
