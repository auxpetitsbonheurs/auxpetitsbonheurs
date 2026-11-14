// `admin/order-new` create (FR-055..057, E-07 S-131..S-135): a phone, WhatsApp or walk-in order,
// saved straight as Approved with source manual. Lines are priced on the server exactly like an
// edit (`edit-order.server` priceLines: menu price with its live promotion, free text as typed,
// hidden products refused); dates and sold-out products only warn (owner Q8, Q9).
//
// Payment (Juice state model, 2026-11-13): a manual order never enters `awaiting_payment`, so the
// 24 h unpaid auto-cancel and its 12 h reminder (which only look at that status) never touch it.
// Paid on creation sets paid/paid_at/paid_by and logs "Marked paid"; unpaid stays Approved and
// unpaid, counted in Today's Unpaid tile and the Sales unpaid list, and marked paid later with
// the order screen's Mark paid flag (`setPaid`). A paid one that is cancelled owes its refund like
// any other (cancel sets refund_due_rs).
//
// One transaction: customer (reused by email then phone, else created without an account), the
// counter, order, items, events `created` (+ `marked_paid`) and the confirmation email (only with
// an email and a date not in the past). The idempotency key replays the first order.
import { eq, inArray, sql } from "drizzle-orm";
import { type TimeWindow, counter, customer, emailOutbox, orderEvent, orderItem, orders, product } from "~/db/schema";
import type { AvailabilityRules } from "~/domain/availability";
import { noticeDaysFor } from "~/domain/availability";
import { type ManualWarning, manualDateProblem, manualOrderWarnings, sendsConfirmation } from "~/domain/manual-order";
import type { Menu } from "~/domain/menu";
import { newTrackingToken } from "~/domain/order-number";
import { normalizePhone } from "~/domain/phone";
import { isInSeason } from "~/domain/season";
import { todayMU } from "~/domain/time";
import type { ManualOrderInput } from "~/server/contracts/order-new";
import type { Database, Transaction } from "~/server/db.server";
import { findMatchingCustomer } from "~/server/repos/customer-match.server";
import { type PricedEdit, Refused, priceLines } from "./edit-order.server";

export interface CreateManualOrderInput {
  adminId: string;
  now: Date;
  input: ManualOrderInput;
  menu: Menu;
  windows: { delivery: TimeWindow[]; pickup: TimeWindow[] };
  availability: AvailabilityRules;
}

export type CreateManualOrderResult =
  | { ok: true; orderId: string; replayed: boolean; warnings: ManualWarning[]; emailed: boolean; customerMatched: boolean }
  | { ok: false; code: "PRODUCT_UNAVAILABLE"; names: string[] }
  | { ok: false; code: "VALIDATION_FAILED"; fields: Record<string, string> };

const invalid = (field: string, problem = "invalid") => new Refused({ ok: false, code: "VALIDATION_FAILED", fields: { [field]: problem } });

async function replayOf(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.idempotencyKey, key)).limit(1);
  return row?.id ?? null;
}

/** Seasonal products outside their window on the order date are refused like hidden ones (S-131 AC8); sold out only warns. */
function productChecks(input: ManualOrderInput, menu: Menu): { outOfSeason: string[]; soldOut: boolean } {
  const products = new Map(menu.products.map((p) => [p.id, p]));
  const chosen = input.lines.flatMap((line) => ("productId" in line ? [products.get(line.productId)] : [])).filter((p) => p !== undefined);
  return {
    outOfSeason: chosen.filter((p) => !isInSeason(p.season ?? null, input.date)).map((p) => p.name.en),
    soldOut: chosen.some((p) => p.status === "sold_out"),
  };
}

/** Products no longer on the menu (hidden or deleted since the form loaded), by name (S-131 AC8). */
async function missingProducts(db: Database, input: ManualOrderInput, menu: Menu): Promise<string[]> {
  const onMenu = new Set(menu.products.map((p) => p.id));
  const missing = [...new Set(input.lines.flatMap((line) => ("productId" in line && !onMenu.has(line.productId) ? [line.productId] : [])))];
  if (missing.length === 0) return [];
  const found = await db.select({ id: product.id, name: product.nameEn }).from(product).where(inArray(product.id, missing));
  const names = new Map(found.map((row) => [row.id, row.name]));
  return missing.map((id) => names.get(id) ?? id);
}

function windowOf(input: ManualOrderInput, windows: CreateManualOrderInput["windows"]): TimeWindow {
  const found = windows[input.fulfilment].find((w) => w.id === input.windowId);
  if (!found) throw invalid("windowId");
  return found;
}

export async function createManualOrder(db: Database, plan: CreateManualOrderInput): Promise<CreateManualOrderResult> {
  const replay = await replayOf(db, plan.input.idempotencyKey);
  if (replay) return { ok: true, orderId: replay, replayed: true, warnings: [], emailed: false, customerMatched: true };
  try {
    return await run(db, plan);
  } catch (error) {
    if (error instanceof Refused) return error.result as CreateManualOrderResult;
    if (isKeyRace(error)) {
      const winner = await replayOf(db, plan.input.idempotencyKey);
      if (winner) return { ok: true, orderId: winner, replayed: true, warnings: [], emailed: false, customerMatched: true };
    }
    throw error;
  }
}

const isKeyRace = (error: unknown) => /orders_idempotency_key/.test(String((error as { constraint?: string; cause?: { constraint?: string } })?.constraint ?? (error as { cause?: { constraint?: string } })?.cause?.constraint ?? ""));

async function run(db: Database, plan: CreateManualOrderInput): Promise<CreateManualOrderResult> {
  const { input, now } = plan;
  const today = todayMU(now);
  const dateProblem = manualDateProblem(input.date, today);
  if (dateProblem) throw invalid("date", dateProblem);
  const phone = normalizePhone(input.contact.phone);
  if (!phone) throw invalid("contact.phone");
  const window = windowOf(input, plan.windows);
  const checks = productChecks(input, plan.menu);
  const unavailable = [...(await missingProducts(db, input, plan.menu)), ...checks.outOfSeason];
  if (unavailable.length > 0) throw new Refused({ ok: false, code: "PRODUCT_UNAVAILABLE", names: unavailable });
  const priced = priceLines(input.lines, new Map(), plan.menu, now);
  const notice = noticeDaysFor(priced.noticeDays.map((noticeDays) => ({ noticeDays })), plan.availability.defaultNoticeDays);
  const warnings = manualOrderWarnings({ date: input.date, today, rules: plan.availability, noticeDays: notice, soldOut: checks.soldOut });
  const email = input.contact.email ?? null;
  const emailed = sendsConfirmation(email, input.date, today);
  const match = await findMatchingCustomer(db, { phone, email: email ?? undefined });
  const orderId = await db.transaction((tx) => write(tx, { plan, phone, window, priced, emailed, customerId: match.customer?.id ?? null, warnings }));
  console.log(JSON.stringify({ level: "info", event: "manual_order_created", items: priced.items.length, fulfilment: input.fulfilment, paid: input.paid, customerMatched: match.customer !== null, emailEntered: email !== null, warnings }));
  return { ok: true, orderId, replayed: false, warnings, emailed, customerMatched: match.customer !== null };
}

interface WritePlan {
  plan: CreateManualOrderInput;
  phone: string;
  window: TimeWindow;
  priced: PricedEdit;
  emailed: boolean;
  customerId: string | null;
  warnings: ManualWarning[];
}

/** A new customer without an account (AC3); a race on the email reuses the row that won. Never touches an existing row (G-02). */
async function customerFor(tx: Transaction, w: WritePlan): Promise<string> {
  if (w.customerId) return w.customerId;
  const { contact, locale } = w.plan.input;
  const email = contact.email?.toLowerCase() ?? null;
  const [created] = await tx.insert(customer).values({ name: contact.name, phone: w.phone, email, locale }).onConflictDoNothing().returning({ id: customer.id });
  if (created) return created.id;
  const [existing] = await tx.select({ id: customer.id }).from(customer).where(sql`lower(${customer.email}) = ${email}`).limit(1);
  if (!existing) throw new Error("customer insert conflicted but no row matches the email");
  return existing.id;
}

async function write(tx: Transaction, w: WritePlan): Promise<string> {
  const { input, now, adminId } = w.plan;
  const customerId = await customerFor(tx, w);
  const [next] = await tx.update(counter).set({ value: sql`${counter.value} + 1` }).where(eq(counter.name, "order_number")).returning({ value: counter.value });
  if (!next) throw new Error("counter 'order_number' is missing (run the migrations)");
  const itemsTotalRs = w.priced.items.reduce((sum, item) => sum + item.lineTotalRs, 0);
  const deliveryFeeRs = input.fulfilment === "pickup" ? 0 : input.deliveryFeeRs;
  const [order] = await tx
    .insert(orders)
    .values({
      number: next.value,
      source: "manual",
      status: "approved",
      customerId,
      contactName: input.contact.name,
      contactPhone: w.phone,
      contactEmail: input.contact.email ?? null,
      fulfilment: input.fulfilment,
      address: input.fulfilment === "delivery" ? (input.address ?? null) : null,
      landmark: input.fulfilment === "delivery" ? input.landmark || null : null,
      fulfilOn: input.date,
      timeWindow: w.window,
      itemsTotalRs,
      deliveryFeeRs,
      totalRs: itemsTotalRs + deliveryFeeRs,
      paid: input.paid,
      paidAt: input.paid ? now : null,
      paidBy: input.paid ? adminId : null,
      customerNote: input.contact.note || null,
      adminNote: input.adminNote || null,
      locale: input.locale,
      trackingToken: newTrackingToken(),
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: orders.id });
  const orderId = order!.id;
  await tx.insert(orderItem).values(w.priced.items.map((item, index) => ({ ...item, orderId, sortOrder: index })));
  await tx.insert(orderEvent).values([
    { orderId, actorType: "admin" as const, actorAdminId: adminId, type: "created", toStatus: "approved" as const, details: { source: "manual", ...(w.warnings.length > 0 ? { warnings: w.warnings } : {}) }, createdAt: now },
    ...(input.paid ? [{ orderId, actorType: "admin" as const, actorAdminId: adminId, type: "marked_paid", details: { paid: true }, createdAt: now }] : []),
  ]);
  if (w.emailed) {
    await tx.insert(emailOutbox).values({ template: "order_confirmed", toEmail: input.contact.email!, locale: input.locale, payload: { orderId }, orderId, dedupeKey: `order:${orderId}:order_confirmed` });
  }
  return orderId;
}
