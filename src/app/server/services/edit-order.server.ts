// `admin/order-edit` save (FR-053, FR-054, S-122, S-123). The order is read, the lines priced on
// the server (a kept item keeps the price it was ordered at, FR-017; a catalogue line is priced
// now from the menu, with its live promotion; a free-text line as entered), then the order, its
// items, the `edited` event and "Your order was updated" (only when the date and/or the total
// changed, and only to an email) are written in ONE transaction guarded by `version`: a stale
// page, or a customer who cancelled meanwhile, gets ORDER_CHANGED and nothing is written.
import { and, asc, eq, sql } from "drizzle-orm";
import { type TimeWindow, emailOutbox, orderEvent, orderItem, orders } from "~/db/schema";
import { type AdminDateWarning, adminDateWarnings, noticeDaysFor } from "~/domain/availability";
import { livePromo } from "~/domain/live-promo";
import type { Menu } from "~/domain/menu";
import { priceBasketFromMenu } from "~/domain/menu-pricing";
import { type EditSnapshot, editChange, editTotals, needsUpdatedEmail, storedOption } from "~/domain/order-edit";
import { normalizePhone } from "~/domain/phone";
import type { OrderStatus } from "~/domain/status";
import { todayMU } from "~/domain/time";
import type { AvailabilityRules } from "~/domain/availability";
import type { EditLine, OrderEditInput } from "~/server/contracts/order-edit";
import type { Database } from "~/server/db.server";

const NOT_EDITABLE = new Set<OrderStatus>(["completed", "declined", "cancelled", "closed"]);

export interface EditOrderInput {
  orderId: string;
  adminId: string;
  now: Date;
  input: OrderEditInput;
  menu: Menu;
  windows: { delivery: TimeWindow[]; pickup: TimeWindow[] };
  availability: AvailabilityRules;
}

export type EditRefusal =
  | { ok: false; code: "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION" }
  | { ok: false; code: "PRODUCT_UNAVAILABLE"; names: string[] }
  | { ok: false; code: "VALIDATION_FAILED"; fields: Record<string, string> };

export type EditOrderResult = { ok: true; order: { status: OrderStatus; version: number }; warnings: AdminDateWarning[]; emailed: boolean } | EditRefusal;

type ItemRow = typeof orderItem.$inferSelect;
type NewItem = Omit<typeof orderItem.$inferInsert, "orderId" | "sortOrder">;

interface PricedEdit {
  items: NewItem[];
  noticeDays: (number | null | undefined)[];
}

class Refused extends Error {
  constructor(readonly result: EditRefusal) {
    super(result.code);
  }
}

const invalid = (field: string, problem = "invalid") => new Refused({ ok: false, code: "VALIDATION_FAILED", fields: { [field]: problem } });

function keptItem(line: { itemId: string; quantity: number }, existing: Map<string, ItemRow>): NewItem {
  const row = existing.get(line.itemId);
  if (!row) throw invalid("lines");
  const unit = row.lineTotalRs / row.quantity;
  // The same id: the item is the same one, only its quantity changed.
  const { orderId: _order, sortOrder: _sort, ...kept } = row;
  return { ...kept, quantity: line.quantity, lineTotalRs: unit * line.quantity };
}

function freeTextItem(line: { freeText: { name: string; priceRs: number; quantity: number } }): NewItem {
  const { name, priceRs, quantity } = line.freeText;
  return { productId: null, nameEn: name, nameFr: name, originalBasePriceRs: priceRs, unitBasePriceRs: priceRs, options: [], quantity, lineTotalRs: priceRs * quantity };
}

/** Catalogue lines priced now from the menu (S-122 AC7: hidden refused, sold out accepted for admins). */
function catalogueItems(lines: Extract<EditLine, { productId: string }>[], menu: Menu, now: Date): NewItem[] {
  if (lines.length === 0) return [];
  const priced = priceBasketFromMenu(lines, menu, todayMU(now), now.getTime());
  const missing = priced.filter((line) => line.problem === "hidden").map((line) => line.name.en || line.productId);
  if (missing.length > 0) throw new Refused({ ok: false, code: "PRODUCT_UNAVAILABLE", names: missing });
  if (priced.some((line) => line.problem === "options_changed")) throw invalid("lines", "options");
  const products = new Map(menu.products.map((p) => [p.id, p]));
  return priced.map((line) => {
    const product = products.get(line.productId)!;
    const promo = livePromo(product, now.getTime());
    return {
      productId: line.productId,
      nameEn: line.name.en,
      nameFr: line.name.fr ?? null,
      originalBasePriceRs: product.basePriceRs,
      unitBasePriceRs: promo?.salePriceRs ?? product.basePriceRs,
      promotionId: promo?.promotionId ?? null,
      options: line.options.map(storedOption),
      cakeMessage: line.cakeMessage,
      quantity: line.quantity,
      lineTotalRs: line.unitPriceRs * line.quantity,
    };
  });
}

/** Every line priced, in the posted order. */
function priceLines(lines: EditLine[], existing: Map<string, ItemRow>, menu: Menu, now: Date): PricedEdit {
  const catalogue = lines.filter((line): line is Extract<EditLine, { productId: string }> => "productId" in line);
  const pricedCatalogue = catalogueItems(catalogue, menu, now);
  const products = new Map(menu.products.map((p) => [p.id, p]));
  let next = 0;
  const items = lines.map((line) => ("itemId" in line ? keptItem(line, existing) : "freeText" in line ? freeTextItem(line) : pricedCatalogue[next++]!));
  const noticeDays = items.filter((item) => item.productId).map((item) => products.get(item.productId!)?.noticeDays);
  return { items, noticeDays };
}

const itemWords = (items: readonly { quantity: number; nameEn: string }[]) => items.map((item) => `${item.quantity} × ${item.nameEn}`);

type OrderRow = typeof orders.$inferSelect;

function snapshotOf(order: OrderRow, items: readonly { quantity: number; nameEn: string }[]): EditSnapshot {
  return {
    fulfilOn: order.fulfilOn,
    windowId: order.timeWindow.id,
    fulfilment: order.fulfilment,
    address: order.address,
    landmark: order.landmark,
    deliveryFeeRs: order.deliveryFeeRs,
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    contactEmail: order.contactEmail,
    customerNote: order.customerNote,
    totalRs: order.totalRs,
    totalOverridden: order.totalOverridden,
    items: itemWords(items),
  };
}

/** The window snapshot: the posted id among Settings' windows, or the order's own if unchanged (a renamed window stays). */
function windowFor(order: OrderRow, input: OrderEditInput, windows: EditOrderInput["windows"]): TimeWindow {
  if (input.windowId === order.timeWindow.id && input.fulfilment === order.fulfilment) return order.timeWindow;
  const found = windows[input.fulfilment].find((w) => w.id === input.windowId);
  if (!found) throw invalid("windowId");
  return found;
}

async function load(db: Database, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItem).where(eq(orderItem.orderId, orderId)).orderBy(asc(orderItem.sortOrder));
  return { order, items };
}

function refuseState(order: OrderRow, version: number): void {
  if (order.version !== version) throw new Refused({ ok: false, code: "ORDER_CHANGED" });
  if (NOT_EDITABLE.has(order.status)) throw new Refused({ ok: false, code: "INVALID_TRANSITION" });
}

export async function editOrder(db: Database, edit: EditOrderInput): Promise<EditOrderResult> {
  try {
    return await run(db, edit);
  } catch (error) {
    if (error instanceof Refused) return error.result;
    throw error;
  }
}

async function run(db: Database, edit: EditOrderInput): Promise<EditOrderResult> {
  const { input, now } = edit;
  const loaded = await load(db, edit.orderId);
  if (!loaded) return { ok: false, code: "NOT_FOUND" };
  const { order, items: before } = loaded;
  refuseState(order, input.version);
  const phone = normalizePhone(input.contact.phone);
  if (!phone) throw invalid("contact.phone");
  const priced = priceLines(input.lines, new Map(before.map((row) => [row.id, row])), edit.menu, now);
  const totals = editTotals(priced.items.map((item) => item.lineTotalRs), input.fulfilment, input.deliveryFeeRs, input.overrideTotalRs);
  const window = windowFor(order, input, edit.windows);
  const address = input.fulfilment === "delivery" ? (input.address ?? null) : null;
  const after: EditSnapshot = {
    fulfilOn: input.date,
    windowId: window.id,
    fulfilment: input.fulfilment,
    address,
    landmark: input.fulfilment === "delivery" ? input.landmark || null : null,
    deliveryFeeRs: totals.deliveryFeeRs,
    contactName: input.contact.name,
    contactPhone: phone,
    contactEmail: input.contact.email ?? null,
    customerNote: input.contact.note || null,
    totalRs: totals.totalRs,
    totalOverridden: totals.totalOverridden,
    items: itemWords(priced.items),
  };
  const change = editChange(snapshotOf(order, before), after);
  const emailed = needsUpdatedEmail(change, after.contactEmail);
  const version = await write(db, { edit, order, after, window, totals, items: priced.items, change, emailed });
  const notice = noticeDaysFor(priced.noticeDays.map((noticeDays) => ({ noticeDays })), edit.availability.defaultNoticeDays);
  const warnings = change.dateChanged ? adminDateWarnings(input.date, { ...edit.availability, today: todayMU(now) }, notice) : [];
  return { ok: true, order: { status: order.status, version }, warnings, emailed };
}

interface WritePlan {
  edit: EditOrderInput;
  order: OrderRow;
  after: EditSnapshot;
  window: TimeWindow;
  totals: ReturnType<typeof editTotals>;
  items: NewItem[];
  change: ReturnType<typeof editChange>;
  emailed: boolean;
}

/** Order, items, event and email in one transaction; zero rows on the versioned update rolls everything back. */
async function write(db: Database, plan: WritePlan): Promise<number> {
  const { edit, order, after, totals } = plan;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(orders)
      .set({
        fulfilOn: after.fulfilOn,
        timeWindow: plan.window,
        fulfilment: after.fulfilment,
        address: after.address,
        landmark: after.landmark,
        deliveryFeeRs: totals.deliveryFeeRs,
        itemsTotalRs: totals.itemsTotalRs,
        totalRs: totals.totalRs,
        totalOverridden: totals.totalOverridden,
        contactName: after.contactName,
        contactPhone: after.contactPhone,
        contactEmail: after.contactEmail,
        customerNote: after.customerNote,
        version: sql`${orders.version} + 1`,
        updatedAt: edit.now,
      })
      .where(and(eq(orders.id, order.id), eq(orders.version, edit.input.version), sql`${orders.status} not in ('completed', 'declined', 'cancelled', 'closed')`))
      .returning({ version: orders.version });
    if (!updated) throw new Refused({ ok: false, code: "ORDER_CHANGED" });
    await tx.delete(orderItem).where(eq(orderItem.orderId, order.id));
    await tx.insert(orderItem).values(plan.items.map((item, index) => ({ ...item, orderId: order.id, sortOrder: index })));
    await tx.insert(orderEvent).values({
      orderId: order.id,
      actorType: "admin",
      actorAdminId: edit.adminId,
      type: "edited",
      details: { diff: plan.change.diff, oldTotalRs: plan.change.oldTotalRs, newTotalRs: plan.change.newTotalRs, overridden: totals.totalOverridden },
      createdAt: edit.now,
    });
    if (plan.emailed) {
      await tx.insert(emailOutbox).values({
        template: "order_updated",
        toEmail: after.contactEmail!,
        locale: order.locale,
        payload: { orderId: order.id, dateChanged: plan.change.dateChanged, totalChanged: plan.change.totalChanged },
        orderId: order.id,
        dedupeKey: `order:${order.id}:order_updated:v${updated.version}`,
      });
    }
    return updated.version;
  });
}
