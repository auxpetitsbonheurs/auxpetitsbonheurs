// `admin/calendar` blockDay / unblockDay (S-138, FR-059): single-day blocks from the calendar on
// the same `blocked_date` table as the Owner's Availability blocks (S-057), so the customer
// date picker and the checkout re-check honour them at once. A block never touches an order.
// Ranges (starts_on < ends_on) belong to Availability: no one reopens one day of a range here.
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { blockedDate } from "~/db/schema";
import type { Database } from "~/server/db.server";
import { type AdminOrderRow } from "~/server/repos/admin-orders.server";
import { listCalendarOrders } from "~/server/repos/admin-calendar.server";
import { siteSettingsCache } from "~/server/repos/settings.server";

export interface BlockActor {
  adminId: string;
  role: "owner" | "admin";
  today: string;
}

export type BlockDayResult = { ok: true; existingOrders: AdminOrderRow[]; created: boolean } | { ok: false; code: "VALIDATION_FAILED"; field: "date" };

export type UnblockDayResult = { ok: true } | { ok: false; code: "VALIDATION_FAILED"; field: "date" } | { ok: false; code: "NOT_FOUND" } | { ok: false; code: "FORBIDDEN"; reason: "range_block" };

const covering = (date: string) => and(lte(blockedDate.startsOn, date), gte(blockedDate.endsOn, date));

/**
 * Blocks `date` (today or later; AC6). Already blocked by anything: ok, nothing written (AC7,
 * two admins). The insert is guarded in one statement so a race leaves at most one new row.
 */
export async function blockDay(db: Database, input: { date: string; reason: string | null }, actor: BlockActor): Promise<BlockDayResult> {
  if (input.date < actor.today) return { ok: false, code: "VALIDATION_FAILED", field: "date" };
  const inserted = (await db.execute(sql`
    insert into ${blockedDate} (starts_on, ends_on, reason, created_by)
    select ${input.date}::date, ${input.date}::date, ${input.reason}, ${actor.adminId}::uuid
    where not exists (select 1 from ${blockedDate} where starts_on <= ${input.date}::date and ends_on >= ${input.date}::date)
    returning id`)) as unknown as { rows: { id: string }[] };
  const created = inserted.rows.length > 0;
  const existingOrders = await listCalendarOrders(db, input.date, input.date, 100);
  if (created) {
    // The customer date picker reads blocks with the cached Settings: this isolate sees it at once.
    siteSettingsCache.clear();
    console.log(JSON.stringify({ level: "info", event: "calendar_day_blocked", date: input.date, hadOrders: existingOrders.length, actorRole: actor.role }));
  }
  return { ok: true, existingOrders, created };
}

/** Reopens a single-day block (AC4; today allowed, past not). A day inside any range is refused for everyone (AC5). */
export async function unblockDay(db: Database, date: string, actor: BlockActor): Promise<UnblockDayResult> {
  if (date < actor.today) return { ok: false, code: "VALIDATION_FAILED", field: "date" };
  const blocks = await db.select({ id: blockedDate.id, startsOn: blockedDate.startsOn, endsOn: blockedDate.endsOn }).from(blockedDate).where(covering(date));
  if (blocks.length === 0) return { ok: false, code: "NOT_FOUND" };
  if (blocks.some((block) => block.startsOn !== block.endsOn)) return { ok: false, code: "FORBIDDEN", reason: "range_block" };
  await db.delete(blockedDate).where(and(eq(blockedDate.startsOn, date), eq(blockedDate.endsOn, date)));
  siteSettingsCache.clear();
  console.log(JSON.stringify({ level: "info", event: "calendar_day_unblocked", date, actorRole: actor.role }));
  return { ok: true };
}
