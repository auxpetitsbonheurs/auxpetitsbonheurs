// The order activity log (FR-045, NFR-013): the ONLY writer and reader of `order_event`.
// Append-only by construction: there is no update or delete here, and callers pass
// their transaction so the event commits or rolls back with the change it records.
// The actor's name is read by join on `admin`, whose rows are never deleted (FR-043).
import { asc, eq } from "drizzle-orm";
import { admin, orderEvent } from "~/db/schema";
import type { OrderStatus } from "~/domain/status";
import type { Executor } from "~/server/db.server";

export type EventActor = { type: "admin"; adminId: string } | { type: "customer" } | { type: "system" };

export interface NewOrderEvent {
  orderId: string;
  actor: EventActor;
  type: string;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  details?: Record<string, unknown> | null;
  /** The action's time (request clock); the database default when absent. */
  at?: Date;
}

export async function appendOrderEvent(db: Executor, event: NewOrderEvent): Promise<void> {
  await db.insert(orderEvent).values({
    orderId: event.orderId,
    actorType: event.actor.type,
    actorAdminId: event.actor.type === "admin" ? event.actor.adminId : null,
    type: event.type,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus ?? null,
    details: event.details ?? null,
    ...(event.at ? { createdAt: event.at } : {}),
  });
}

/** contracts.md `OrderEventView`. */
export interface OrderEventView {
  at: string;
  actor: { type: "admin" | "customer" | "system"; name: string | null };
  type: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  details: Record<string, unknown> | null;
}

/** The log of one order, oldest first. */
export async function listOrderEvents(db: Executor, orderId: string): Promise<OrderEventView[]> {
  const rows = await db
    .select({
      at: orderEvent.createdAt,
      actorType: orderEvent.actorType,
      actorName: admin.name,
      type: orderEvent.type,
      fromStatus: orderEvent.fromStatus,
      toStatus: orderEvent.toStatus,
      details: orderEvent.details,
    })
    .from(orderEvent)
    .leftJoin(admin, eq(admin.id, orderEvent.actorAdminId))
    .where(eq(orderEvent.orderId, orderId))
    .orderBy(asc(orderEvent.createdAt), asc(orderEvent.id));
  return rows.map((row) => ({
    at: row.at.toISOString(),
    actor: { type: row.actorType, name: row.actorType === "admin" ? row.actorName : null },
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    details: row.details,
  }));
}
