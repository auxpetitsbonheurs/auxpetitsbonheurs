// `admin/availability` (S-056, S-057, FR-066, FR-059): the Owner's notice days, closed
// weekdays and time windows (one versioned write on the Settings row) and blocked dates.
// Nothing here touches an order: closing a weekday or blocking dates only lists the active
// orders already booked then, as a warning (blocks: blocked-dates.server.ts). Orders keep their window snapshot, so a renamed
// or removed window changes nothing on them.
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { orders, settings } from "~/db/schema";
import { formatOrderNumber } from "~/domain/order-number";
import { ACTIVE_STATUSES, type OrderStatus } from "~/domain/status";
import type { AvailabilityInput } from "~/server/contracts/settings";
import type { Database, Executor } from "~/server/db.server";
import { siteSettingsCache } from "~/server/repos/settings.server";

/** An order shown in a warning (`affectedOrders`, `existingOrders`). */
export interface OrderBrief {
  id: string;
  number: string;
  status: OrderStatus;
  fulfilOn: string;
  contactName: string;
}

export const briefColumns = {
  id: orders.id,
  number: orders.number,
  numberPrefix: orders.numberPrefix,
  status: orders.status,
  fulfilOn: sql<string>`to_char(${orders.fulfilOn}, 'YYYY-MM-DD')`,
  contactName: orders.contactName,
};

type BriefRow = { id: string; number: number; numberPrefix: string | null; status: OrderStatus; fulfilOn: string; contactName: string };

export function briefs(rows: BriefRow[], fallbackPrefix: string): OrderBrief[] {
  return rows.map(({ numberPrefix, number, ...row }) => ({ ...row, number: formatOrderNumber(numberPrefix ?? fallbackPrefix, number) }));
}

export const activeOrders = inArray(orders.status, [...ACTIVE_STATUSES]);

export type SaveRulesResult = { ok: true; version: number; affectedOrders: OrderBrief[] } | { ok: false; code: "SETTINGS_CHANGED" };

/** Active orders from `today` on whose date falls on one of `weekdays` (ISO 1..7). */
async function ordersOnWeekdays(db: Executor, weekdays: number[], today: string, prefix: string): Promise<OrderBrief[]> {
  if (weekdays.length === 0) return [];
  const rows = await db
    .select(briefColumns)
    .from(orders)
    .where(and(activeOrders, gte(orders.fulfilOn, today), inArray(sql<number>`extract(isodow from ${orders.fulfilOn})::int`, weekdays)))
    .orderBy(asc(orders.fulfilOn), asc(orders.number))
    .limit(100);
  return briefs(rows, prefix);
}

export async function saveAvailabilityRules(db: Database, version: number, input: AvailabilityInput, context: { adminId: string; now: Date; today: string }): Promise<SaveRulesResult> {
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ version: settings.version, closedWeekdays: settings.closedWeekdays, prefix: settings.orderNumberPrefix })
      .from(settings)
      .where(eq(settings.id, 1))
      .for("update");
    if (!row || row.version !== version) return null;
    await tx
      .update(settings)
      .set({ ...input, version: row.version + 1, updatedAt: context.now, updatedBy: context.adminId })
      .where(eq(settings.id, 1));
    const newlyClosed = input.closedWeekdays.filter((day) => !row.closedWeekdays.includes(day));
    return { version: row.version + 1, affectedOrders: await ordersOnWeekdays(tx, newlyClosed, context.today, row.prefix) };
  });
  if (!saved) return { ok: false, code: "SETTINGS_CHANGED" };
  siteSettingsCache.clear();
  console.log(JSON.stringify({ level: "info", event: "availability_saved", actorRole: "owner", affected: saved.affectedOrders.length }));
  return { ok: true, ...saved };
}
