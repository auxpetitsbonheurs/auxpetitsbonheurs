// `placeOrder` pipeline (checkout spec, order is normative). Built in S-013: steps 1
// (parse), 4 (product problems: unavailable lines are left out, ADR-0004), 5 (window in the list; S-083/S-084: the
// date by domain/availability.ts, the same module as the date picker), 6
// (server prices vs displayed total), 7 (one transaction) and 9 (caller redirects).
// S-014 adds step 2 (idempotency: a known key returns the original order, also when a
// race is lost on the unique index), bound to the submitter's email (threat-model G-21). Later: step 3 rate limit + Turnstile and the full
// assertOrderable rules (E-05), step 8 sending after commit (E-10, through afterResponse).
//
// One database round trip (ADR-0003 amendment 3): everything the database decides (replay,
// Settings, products, the checked write) is one CALL of the `place_order` procedure
// (drizzle/0004, 0009 date rules, 0010 options: S-081/S-092). The checks that need no database (form, date) run here first and decide
// whether the procedure may write; every refusal is then worked out here from the snapshot
// the procedure returns, with the same domain rules as before, so the page sees the same
// codes, fields, lines and totals.
import { sql } from "drizzle-orm";
import type { TimeWindow } from "~/db/schema";
import { type AvailabilityCtx, type AvailabilityRules, type DateRange, type DayReason, dayStatus, noticeDaysFor } from "~/domain/availability";
import type { BasketLine } from "~/domain/basket";
import { formatOrderNumber, newTrackingToken } from "~/domain/order-number";
import { type CheckoutTotals, type LocalizedName, type PricedLine, type PricingGroup, type ProductPricing, cleanText, graphemeLength, priceBasket } from "~/domain/pricing";
import type { PaymentSettings } from "~/domain/payment";
import { type PromotionRule, bestPromotion } from "~/domain/promotions";
import { todayMU } from "~/domain/time";
import type { Locale } from "~/lib/locale";
import { type PlaceOrderInput, parsePlaceOrder } from "~/server/contracts/site";
import { Uuid } from "~/server/contracts/shared";
import type { Database } from "~/server/db.server";
import type { PlacedOrderRef } from "~/server/repos/orders.server";

export interface PlaceOrderContext {
  db: Database;
  now: Date;
  /** The page locale; stored on the order and used for its emails. */
  locale: Locale;
  basket: BasketLine[];
}

/**
 * A placed order; `replayed` when the key already belonged to it (nothing new was written).
 * `leftOut`: product ids of the sold-out, hidden or deleted lines left out of a new order
 * (UX audit H1), so the confirmation page can name them; empty for a replay.
 * `leftOutNames`: the names of those that still exist (a deleted product has none), in the
 * same order, so the confirmation can render without reading them back (checkout AC48).
 */
export type PlacedOrder = PlacedOrderRef & {
  ok: true;
  orderNumber: string;
  replayed: boolean;
  leftOut: string[];
  leftOutNames: LocalizedName[];
  /**
   * A new order only: what its Juice payment instructions need (S-278 AC2), from the same
   * Settings snapshot the order was placed with, so the confirmation renders without a read.
   */
  payment?: PlacedPayment;
};

export interface PlacedPayment extends PaymentSettings {
  totalRs: number;
}

export type PlaceOrderResult =
  | PlacedOrder
  /** `windows`: the fresh lists when the window was refused, so the page shows them (S-088 AC4). */
  | { ok: false; code: "VALIDATION_FAILED"; fields: string[]; windows?: { delivery: TimeWindow[]; pickup: TimeWindow[] } }
  /** The key belongs to an order placed under another email: nothing about it is revealed (G-21). */
  | { ok: false; code: "VALIDATION_FAILED"; fields: []; keyReused: true }
  /** `availability`: the fresh public rules, so the picker re-renders with the new statuses (S-087 AC5). */
  | { ok: false; code: "DATE_UNAVAILABLE"; reason: DayReason; availability: AvailabilityRules }
  | ({ ok: false; code: "PRICE_CHANGED"; lines: PricedLine[] } & CheckoutTotals);

/** The Settings values the procedure returns (only what checkout decides with). */
interface SnapshotSettings {
  deliveryFeeRs: number;
  deliveryWindows: TimeWindow[];
  pickupWindows: TimeWindow[];
  orderNumberPrefix: string;
  /** Juice payment details (migration 0013); shown only on the order's own pages. */
  juiceName?: string | null;
  juiceNumber?: string | null;
  paymentWhatsapp?: string | null;
  defaultNoticeDays: number;
  closedWeekdays: number[];
  /** Ranges only (never the private reason) that touch the 90-day horizon (drizzle/0009). */
  blocked: DateRange[];
  /** Settings cake message limit (S-067); a text group without its own limit uses it too. */
  cakeMessageMax: number;
}

interface SnapshotProduct {
  id: string;
  status: ProductPricing["status"];
  nameEn: string;
  nameFr: string | null;
  basePriceRs: number;
  noticeDays: number | null;
  seasonStartsOn: string | null;
  seasonEndsOn: string | null;
  minQuantity: number | null;
  optionGroups: PricingGroup[];
  /** Active promotions covering the product that have not ended (drizzle/0012). */
  promotions?: SnapshotPromotion[];
}

/** One promotion row on a snapshot product: the window and this product's discount. */
interface SnapshotPromotion {
  id: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  placement: PromotionRule["placement"];
  discountKind: "percent" | "sale_price";
  percentOff: number | null;
  salePriceRs: number | null;
}

type ExistingOrder = PlacedOrderRef & { contactEmail: string | null; orderNumberPrefix: string };

/** What `CALL place_order` answers (drizzle/0004_place_order_procedure.sql). */
export type ProcedureResult =
  | { kind: "existing"; existing: ExistingOrder }
  | { kind: "checked"; settings: SnapshotSettings; products: SnapshotProduct[] }
  | { kind: "placed"; settings: SnapshotSettings; products: SnapshotProduct[]; placed: PlacedOrderRef };

/**
 * One basket line for the procedure: ids, quantities and cleaned texts with their grapheme
 * lengths (computed here, never by the client; SQL cannot count grapheme clusters).
 */
interface ProcedureLine {
  productId: string;
  quantity: number;
  cakeMessage: string | null;
  cakeMessageLength: number;
  options: { groupId: string; choiceIds: string[]; quantity: number | null; text: string | null; textLength: number }[];
}

/** The procedure's input: ids, quantities and the parsed form only, never a price from the client except the displayed total. */
interface ProcedureInput {
  idempotencyKey: string | null;
  /** The request's Mauritius date: the procedure judges notice and horizon from it. */
  today: string;
  /**
   * The request instant (ISO): the procedure judges the promotion window from it (0012), and
   * it is the order's `created_at`, from which its 24 h payment deadline runs (0013, S-278, S-280).
   */
  now: string;
  insert: boolean;
  basket: ProcedureLine[];
  order: {
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    fulfilment: "delivery" | "pickup";
    address: string | null;
    landmark: string | null;
    fulfilOn: string;
    windowId: string;
    customerNote: string | null;
    locale: Locale;
    trackingToken: string;
    displayedTotalRs: number;
    policiesAcceptedAt: string;
  } | null;
}

/** One statement, one round trip. The input travels as one jsonb parameter (never spliced). */
export async function callPlaceOrder(db: Database, input: ProcedureInput): Promise<ProcedureResult> {
  const { rows } = (await db.execute(sql`call place_order(${JSON.stringify(input)}::jsonb, null)`)) as unknown as { rows: { result: ProcedureResult | string }[] };
  const result = rows[0]?.result;
  if (result === undefined) throw new Error("place_order returned no result");
  return typeof result === "string" ? (JSON.parse(result) as ProcedureResult) : result;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

const KEY_REUSED = { ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true } as const;

function placedOrder(prefix: string, ref: PlacedOrderRef, replayed: boolean, left: LeftOut = { ids: [], names: [] }): PlacedOrder {
  const { orderId, number, trackingToken, locale } = ref;
  return { ok: true, orderId, number, trackingToken, locale, orderNumber: formatOrderNumber(prefix, number), replayed, leftOut: left.ids, leftOutNames: left.names };
}

interface LeftOut {
  ids: string[];
  names: LocalizedName[];
}

/** The lines left out of a placed order: unique product ids in basket order, and the names of those the snapshot knows. */
function leftOutOf(lines: PricedLine[], products: SnapshotProduct[]): LeftOut {
  const ids = [...new Set(lines.filter((l) => l.problem !== null).map((l) => l.productId))];
  const known = productMap(products);
  return { ids, names: ids.flatMap((id) => (known.has(id) ? [known.get(id)!.name] : [])) };
}

/** The original order only when the posted email is the order's (normalised); else a neutral refusal. */
function replayFor(form: Record<string, unknown>, existing: ExistingOrder | null): PlaceOrderResult {
  if (!existing) throw new Error("place_order lost a race but found no winner");
  const posted = typeof form["contact.email"] === "string" ? normaliseEmail(form["contact.email"]) : "";
  const stored = existing.contactEmail === null ? null : normaliseEmail(existing.contactEmail);
  return posted !== "" && posted === stored ? placedOrder(existing.orderNumberPrefix, existing, true) : { ...KEY_REUSED, fields: [] };
}

/** Step 1 without the window (it needs Settings): what can be refused before the database. */
function preflight(form: Record<string, unknown>, basket: BasketLine[], now: Date) {
  const parsed = parsePlaceOrder(form);
  const datePassed = parsed.ok && parsed.data.date >= todayMU(now);
  return { parsed, insert: parsed.ok && basket.length > 0 && datePassed };
}

function procedureLine(line: BasketLine): ProcedureLine {
  const message = cleanText(line.cakeMessage) ?? null;
  return {
    productId: line.productId,
    quantity: line.quantity,
    cakeMessage: message,
    cakeMessageLength: message ? graphemeLength(message) : 0,
    options: line.options.map((o) => {
      const text = cleanText(o.text) ?? null;
      return { groupId: o.groupId, choiceIds: o.choiceIds, quantity: o.quantity ?? null, text, textLength: text ? graphemeLength(text) : 0 };
    }),
  };
}

function procedureInput(form: Record<string, unknown>, ctx: PlaceOrderContext, parsed: ReturnType<typeof parsePlaceOrder>, insert: boolean): ProcedureInput {
  const key = Uuid.safeParse(form.idempotencyKey);
  const basket = ctx.basket.map(procedureLine);
  const today = todayMU(ctx.now);
  const now = ctx.now.toISOString();
  if (!parsed.ok) return { idempotencyKey: key.success ? key.data : null, today, now, insert: false, basket, order: null };
  const input = parsed.data;
  const delivery = input.fulfilment === "delivery" ? input : undefined;
  return {
    idempotencyKey: input.idempotencyKey,
    today,
    now,
    insert,
    basket,
    order: {
      contactName: input.contact.name,
      contactPhone: input.contact.phone,
      contactEmail: input.contact.email,
      fulfilment: input.fulfilment,
      address: delivery?.address ?? null,
      landmark: delivery?.landmark ?? null,
      fulfilOn: input.date,
      windowId: input.windowId,
      customerNote: input.contact.note ?? null,
      locale: ctx.locale,
      trackingToken: newTrackingToken(),
      displayedTotalRs: input.displayedTotalRs,
      policiesAcceptedAt: ctx.now.toISOString(),
    },
  };
}

function productMap(products: SnapshotProduct[]): Map<string, ProductPricing> {
  return new Map(products.map((p) => [p.id, {
    id: p.id,
    status: p.status,
    basePriceRs: p.basePriceRs,
    name: { en: p.nameEn, fr: p.nameFr },
    minQuantity: p.minQuantity ?? null,
    optionGroups: p.optionGroups ?? [],
    season: p.seasonStartsOn && p.seasonEndsOn ? { startsOn: p.seasonStartsOn, endsOn: p.seasonEndsOn } : null,
  }]));
}

/** The snapshot's promotion rows as domain/promotions reads them (one discount each: this product's). */
function promotionRules(products: SnapshotProduct[]): PromotionRule[] {
  return products.flatMap((p) => (p.promotions ?? []).map((row) => ({
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
    placement: row.placement,
    discounts: [{ productId: p.id, kind: row.discountKind, percentOff: row.percentOff, salePriceRs: row.salePriceRs }],
  })));
}

const windowsOf = (settings: SnapshotSettings) => ({ delivery: settings.deliveryWindows, pickup: settings.pickupWindows });

/** Every invalid field at once (AC2): the parse result plus the basket and the window from Settings. */
function invalidFields(form: Record<string, unknown>, basket: BasketLine[], parsed: ReturnType<typeof parsePlaceOrder>, settings: SnapshotSettings): string[] {
  const fields = new Set(parsed.ok ? [] : parsed.fields);
  if (basket.length === 0) fields.add("basket");
  const fulfilment = form.fulfilment === "delivery" || form.fulfilment === "pickup" ? form.fulfilment : undefined;
  const windowId = fulfilment ? form[`windowId.${fulfilment}`] : undefined;
  if (fulfilment && !windowsOf(settings)[fulfilment].some((w) => w.id === windowId)) fields.add("windowId");
  return [...fields];
}

const publicRules = (settings: SnapshotSettings): AvailabilityRules => ({
  defaultNoticeDays: settings.defaultNoticeDays,
  closedWeekdays: settings.closedWeekdays,
  blocked: settings.blocked,
});

/**
 * Step 5 (FR-013..015, owner Q2): the date judged against the fresh Settings with the
 * orderable lines' largest notice and every seasonal window among them; null when fine.
 */
function dateProblem(date: string, now: Date, lines: PricedLine[], snapshot: Extract<ProcedureResult, { kind: "checked" | "placed" }>): DayReason | null {
  const products = new Map(snapshot.products.map((p) => [p.id, p]));
  const orderable = lines.filter((l) => l.problem === null).flatMap((l) => (products.has(l.productId) ? [products.get(l.productId)!] : []));
  const ctx: AvailabilityCtx = { today: todayMU(now), ...publicRules(snapshot.settings) };
  const seasons = orderable.flatMap((p) => (p.seasonStartsOn && p.seasonEndsOn ? [{ startsOn: p.seasonStartsOn, endsOn: p.seasonEndsOn }] : []));
  return dayStatus(date, ctx, noticeDaysFor(orderable, ctx.defaultNoticeDays), seasons).reason;
}

interface Priced {
  input: PlaceOrderInput;
  lines: PricedLine[];
  totals: CheckoutTotals;
}

/** Steps 1, 4, 5 and 6 on the snapshot, in the order the checkout spec gives: a refusal, or the priced order. */
function decide(form: Record<string, unknown>, ctx: PlaceOrderContext, parsed: ReturnType<typeof parsePlaceOrder>, snapshot: Extract<ProcedureResult, { kind: "checked" | "placed" }>): Exclude<PlaceOrderResult, { ok: true }> | Priced {
  const fields = invalidFields(form, ctx.basket, parsed, snapshot.settings);
  if (!parsed.ok || fields.length > 0) {
    return fields.includes("windowId") ? { ok: false, code: "VALIDATION_FAILED", fields, windows: windowsOf(snapshot.settings) } : { ok: false, code: "VALIDATION_FAILED", fields };
  }
  const input = parsed.data;
  const rules = promotionRules(snapshot.products);
  // Server prices only (S-081): the snapshot's products, options, promotions and Settings, never the client's.
  const { lines, ...totals } = priceBasket(ctx.basket, productMap(snapshot.products), {
    fulfilment: input.fulfilment,
    deliveryFeeRs: snapshot.settings.deliveryFeeRs,
    limits: { cakeMessageMax: snapshot.settings.cakeMessageMax },
    // S-084 AC7: a line out of its season today is left out, as the procedure does.
    today: todayMU(ctx.now),
    // S-082: the lowest live sale price, never stacked (the procedure's product_promotion, 0012).
    promotionFor: (product) => bestPromotion(product.id, product.basePriceRs, rules, ctx.now),
  });
  // ADR-0004: sold-out, hidden and deleted lines, and lines whose options are no longer
  // offered, are left out (the page showed them dimmed and outside the total); only a basket
  // with nothing orderable is refused.
  if (!lines.some((l) => l.problem === null)) return { ok: false, code: "VALIDATION_FAILED", fields: ["basket"] };
  const reason = dateProblem(input.date, ctx.now, lines, snapshot);
  if (reason) return { ok: false, code: "DATE_UNAVAILABLE", reason, availability: publicRules(snapshot.settings) };
  if (input.displayedTotalRs !== totals.totalRs) return { ok: false, code: "PRICE_CHANGED", lines, ...totals };
  return { input, lines, totals };
}

const logDrift = (kind: string) => console.error(JSON.stringify({ level: "error", event: "place_order_rule_drift", kind }));

export async function placeOrder(form: Record<string, unknown>, ctx: PlaceOrderContext): Promise<PlaceOrderResult> {
  const { parsed, insert } = preflight(form, ctx.basket, ctx.now);
  const result = await callPlaceOrder(ctx.db, procedureInput(form, ctx, parsed, insert));
  // Step 2 ran first in the procedure, on the key alone: a replay after success posts with an
  // emptied basket (cookie cleared) or a changed payload, and the key wins, but only for the
  // submitter who placed the order (G-21). The prefix of a replay is read from the next page.
  if (result.kind === "existing") return replayFor(form, result.existing);
  const decision = decide(form, ctx, parsed, result);
  if (result.kind === "placed") {
    // The order is committed. The procedure and domain/pricing must agree; a difference is a bug to fix, never the customer's problem.
    if ("ok" in decision || decision.totals.totalRs !== decision.input.displayedTotalRs) logDrift("placed_but_refused_here");
    const lines = "ok" in decision ? [] : decision.lines;
    const placed = placedOrder(result.settings.orderNumberPrefix, result.placed, false, leftOutOf(lines, result.products));
    // The procedure wrote the order only when its total equals the displayed one (parsed: a single
    // total or the one of the chosen fulfilment, as the page posts both).
    if (!parsed.ok) return placed;
    const { juiceName = null, juiceNumber = null, paymentWhatsapp = null } = result.settings;
    return { ...placed, payment: { totalRs: parsed.data.displayedTotalRs, juiceName, juiceNumber, paymentWhatsapp } };
  }
  if ("ok" in decision) return decision;
  // Here everything passed but the procedure did not write: its rules and ours disagree. Ask
  // the customer to review the (unchanged) prices rather than fail the checkout.
  logDrift(insert ? "accepted_here_refused_there" : "not_inserted");
  return { ok: false, code: "PRICE_CHANGED", lines: decision.lines, ...decision.totals };
}

/** True when `error` (or a cause it wraps, e.g. DrizzleQueryError) is a 23505 on `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    const pg = current as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    // PGlite and node-postgres name the field `constraint`, postgres.js `constraint_name`.
    if (pg.code === "23505" && (pg.constraint === constraint || pg.constraint_name === constraint)) return true;
    current = pg.cause;
  }
  return false;
}
