// `admin/availability` addBlock / removeBlock (S-057, FR-059, FR-066): blocked days and ranges
// with a private reason. A block never touches an order (data-model `blocked_date`): adding
// one lists the active orders already booked in its range as a warning. Customers' date
// choices honour blocks in the availability domain (E-05).
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { blockedDate, orders, settings } from "~/db/schema";
import type { BlockInput } from "~/server/contracts/settings";
import type { Database, Executor } from "~/server/db.server";
import { type OrderBrief, activeOrders, briefColumns, briefs } from "./save-availability.server";

export interface BlockView {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
}

const blockColumns = {
  id: blockedDate.id,
  startsOn: sql<string>`to_char(${blockedDate.startsOn}, 'YYYY-MM-DD')`,
  endsOn: sql<string>`to_char(${blockedDate.endsOn}, 'YYYY-MM-DD')`,
  reason: blockedDate.reason,
};

/** Every block, earliest first (overlapping blocks are all kept and listed; AC6). */
export async function listBlocks(db: Executor): Promise<BlockView[]> {
  return db.select(blockColumns).from(blockedDate).orderBy(asc(blockedDate.startsOn), asc(blockedDate.endsOn), asc(blockedDate.createdAt));
}

async function numberPrefix(db: Executor): Promise<string> {
  const [row] = await db.select({ prefix: settings.orderNumberPrefix }).from(settings).where(eq(settings.id, 1));
  return row?.prefix ?? "";
}

/** Adds the block, then lists the active orders already booked in its range (warning only; AC2). */
export async function addBlock(db: Database, input: BlockInput, context: { adminId: string; now: Date }): Promise<{ ok: true; block: BlockView; existingOrders: OrderBrief[] }> {
  const [block] = await db
    .insert(blockedDate)
    .values({ ...input, createdBy: context.adminId, createdAt: context.now })
    .returning(blockColumns);
  const rows = await db
    .select(briefColumns)
    .from(orders)
    .where(and(activeOrders, gte(orders.fulfilOn, input.startsOn), lte(orders.fulfilOn, input.endsOn)))
    .orderBy(asc(orders.fulfilOn), asc(orders.number))
    .limit(100);
  console.log(JSON.stringify({ level: "info", event: "date_blocked", actorRole: "owner", existing: rows.length }));
  return { ok: true, block: block!, existingOrders: briefs(rows, rows.some((r) => r.numberPrefix === null) ? await numberPrefix(db) : "") };
}

export async function removeBlock(db: Database, id: string): Promise<{ ok: true; id: string } | { ok: false; code: "NOT_FOUND" }> {
  const removed = await db.delete(blockedDate).where(eq(blockedDate.id, id)).returning({ id: blockedDate.id });
  return removed.length > 0 ? { ok: true, id } : { ok: false, code: "NOT_FOUND" };
}
