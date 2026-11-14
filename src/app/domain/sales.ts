// Sales summary rules (FR-068; spec admin-sales-customers "Definitions (single source for
// numbers)"). Pure: the repository groups orders in SQL, these functions turn the groups into
// the figures the page and the CSV show, so both always agree (FR-069).
import type { Locale } from "~/lib/locale";
import { CONFIRMED_STATUSES, type Fulfilment, type OrderSource, type OrderStatus } from "./status";
import { addDays, diffDays, isValidMuDate, isoWeekday } from "./time";

/**
 * Revenue counts Completed orders by order date (owner decision 4): not payment-based, so the
 * paid flag never changes it, and awaiting payment, approved, cancelled, declined and closed
 * orders never count.
 */
export const REVENUE_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["completed"]);

/**
 * The unpaid list (owner decision 16): the *confirmed* group with `paid = false`. Orders still
 * awaiting their Juice payment are not listed here: the Orders Payment tab owns them (S-279).
 */
export const UNPAID_STATUSES: ReadonlySet<OrderStatus> = CONFIRMED_STATUSES;

/** The unpaid list shows at most this many rows; the total covers them all (S-173 AC4). */
export const UNPAID_LIST_CAP = 200;

export const SALES_RANGES = ["week", "month", "last_month", "custom"] as const;
export type SalesRange = (typeof SALES_RANGES)[number];

/** A custom range covers at most this many days, both ends included (S-171 AC6). */
export const CUSTOM_RANGE_MAX_DAYS = 366;

export const ORDER_SOURCES = ["website", "custom_request", "manual", "workshop"] as const satisfies readonly OrderSource[];

/** Average order in whole rupees, half up; no orders gives 0 (S-171 AC3, AC4). */
export function averageRs(revenueRs: number, orderCount: number): number {
  return orderCount === 0 ? 0 : Math.floor(revenueRs / orderCount + 0.5);
}

/** Completed orders in range grouped by fulfilment and source (one SQL group by). */
export interface SalesGroup {
  fulfilment: Fulfilment;
  source: OrderSource;
  orderCount: number;
  revenueRs: number;
  /** Sum of the entered costs (S-318); 0 when none. */
  costRs: number;
  /** Orders in the group with no cost entered (S-318). */
  missingCost: number;
}

export interface SalesSummary {
  revenueRs: number;
  orderCount: number;
  averageRs: number;
  delivery: number;
  pickup: number;
  deliveryRevenueRs: number;
  pickupRevenueRs: number;
  /** All three sources, 0 when none (contracts.md `admin/sales`). */
  bySource: Record<OrderSource, number>;
}

export function summarise(groups: readonly Omit<SalesGroup, "costRs" | "missingCost">[]): SalesSummary {
  const bySource: Record<OrderSource, number> = { website: 0, custom_request: 0, manual: 0, workshop: 0 };
  const count = { delivery: 0, pickup: 0 };
  const revenue = { delivery: 0, pickup: 0 };
  for (const group of groups) {
    bySource[group.source] += group.revenueRs;
    count[group.fulfilment] += group.orderCount;
    revenue[group.fulfilment] += group.revenueRs;
  }
  const revenueRs = revenue.delivery + revenue.pickup;
  const orderCount = count.delivery + count.pickup;
  return {
    revenueRs,
    orderCount,
    averageRs: averageRs(revenueRs, orderCount),
    delivery: count.delivery,
    pickup: count.pickup,
    deliveryRevenueRs: revenue.delivery,
    pickupRevenueRs: revenue.pickup,
    bySource,
  };
}

/** Item lines of completed orders in range grouped by product; `productId` null = free-text item. */
export interface ProductSales {
  productId: string | null;
  name: string;
  quantity: number;
  revenueRs: number;
}

export interface TopProduct {
  name: string;
  quantity: number;
  revenueRs: number;
}

/**
 * Top products by units, ties by revenue (line totals, no delivery fee) then name (S-172 AC2).
 * Free-text manual items are never ranked (S-172 AC3).
 */
export function topProducts(rows: readonly ProductSales[], limit = 5): TopProduct[] {
  return rows
    .filter((row) => row.productId !== null)
    .sort((a, b) => b.quantity - a.quantity || b.revenueRs - a.revenueRs || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, quantity, revenueRs }) => ({ name, quantity, revenueRs }));
}

export interface SalesRangeQuery {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}

export type RangeProblem = "invalid" | "order" | "tooLong";

export type ResolvedRange =
  | { ok: true; range: SalesRange; from: string; to: string }
  | { ok: false; range: "custom"; from: string; to: string; problem: RangeProblem };

function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

function presetRange(range: Exclude<SalesRange, "custom">, today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (range === "week") {
    const from = addDays(today, 1 - isoWeekday(today));
    return { from, to: addDays(from, 6) };
  }
  if (range === "last_month") return month === 1 ? monthBounds(year - 1, 12) : monthBounds(year, month - 1);
  return monthBounds(year, month);
}

function customProblem(from: string, to: string): RangeProblem | null {
  if (!isValidMuDate(from) || !isValidMuDate(to)) return "invalid";
  const days = diffDays(from, to);
  if (days < 0) return "order";
  return days + 1 > CUSTOM_RANGE_MAX_DAYS ? "tooLong" : null;
}

/**
 * The dates a `?range=` query covers, in Mauritius calendar dates (`today` from the request
 * clock). An unknown range falls back to This month (the default tab); a bad custom range is a
 * `VALIDATION_FAILED` problem and no data loads (S-171 AC6).
 */
export function resolveSalesRange(query: SalesRangeQuery, today: string): ResolvedRange {
  const range = (SALES_RANGES as readonly string[]).includes(query.range ?? "") ? (query.range as SalesRange) : "month";
  if (range !== "custom") return { ok: true, range, ...presetRange(range, today) };
  const from = (query.from ?? "").slice(0, 10);
  const to = (query.to ?? "").slice(0, 10);
  const problem = customProblem(from, to);
  return problem ? { ok: false, range, from, to, problem } : { ok: true, range, from, to };
}

const MONTH_NAME: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }),
  fr: new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }),
};

function parts(date: string, locale: Locale) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return { year, month, day, monthName: MONTH_NAME[locale].format(new Date(Date.UTC(year, month - 1, day))) };
}

/** The header's range: "1–30 Nov 2026", "26 Oct – 1 Nov 2026"; French spells the month out (S-171 AC5, AC11). */
export function formatRangeLabel(from: string, to: string, locale: Locale): string {
  const a = parts(from, locale);
  const b = parts(to, locale);
  const end = `${b.day} ${b.monthName} ${b.year}`;
  if (from === to) return end;
  if (a.year !== b.year) return `${a.day} ${a.monthName} ${a.year} – ${end}`;
  if (a.month !== b.month) return `${a.day} ${a.monthName} – ${end}`;
  return `${a.day}–${end}`;
}

/**
 * A workshop registration's cost is its event's "Cost to run" (one figure per event, S-318), so
 * a registration without its own cost is never reported missing; any other order is.
 */
export function orderCostMissing(source: OrderSource): boolean {
  return source !== "workshop";
}

/** Events whose missing cost is reported (S-318): they ran or will run. Drafts and cancelled events without one are left out. */
export const COSTED_EVENT_STATUSES: ReadonlySet<string> = new Set(["published", "completed"]);

export interface EventCost {
  status: string;
  costRs: number | null;
}

export interface ProfitSummary {
  earnedRs: number;
  ordersCostRs: number;
  workshopsCostRs: number;
  spentRs: number;
  /** Earned minus spent; negative when costs were higher. */
  profitRs: number;
  ordersMissingCost: number;
  workshopsMissingCost: number;
}

/**
 * Amount earned, spent and profit for a period (S-318; contracts.md "Costs and profit").
 * Earned is the revenue rule (completed orders: refunds are only ever owed on declined or
 * cancelled orders, which never count). Spent = the costs of those orders plus the cost of every
 * event dated in the period that has one, whatever its status (money spent on a cancelled event
 * was still spent). A missing cost counts as Rs 0 and is always reported, never silent.
 */
export function profitSummary(groups: readonly SalesGroup[], events: readonly EventCost[]): ProfitSummary {
  let earnedRs = 0;
  let ordersCostRs = 0;
  let ordersMissingCost = 0;
  for (const group of groups) {
    earnedRs += group.revenueRs;
    ordersCostRs += group.costRs;
    if (orderCostMissing(group.source)) ordersMissingCost += group.missingCost;
  }
  let workshopsCostRs = 0;
  let workshopsMissingCost = 0;
  for (const event of events) {
    if (event.costRs !== null) workshopsCostRs += event.costRs;
    else if (COSTED_EVENT_STATUSES.has(event.status)) workshopsMissingCost += 1;
  }
  const spentRs = ordersCostRs + workshopsCostRs;
  return { earnedRs, ordersCostRs, workshopsCostRs, spentRs, profitRs: earnedRs - spentRs, ordersMissingCost, workshopsMissingCost };
}
