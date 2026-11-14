import { data } from "react-router";
import { CalendarHeader } from "~/components/admin/calendar/header";
import { DayView } from "~/components/admin/calendar/day-view";
import { MonthGrid } from "~/components/admin/calendar/month-grid";
import { WeekView } from "~/components/admin/calendar/week-view";
import { listLinkClass } from "~/components/admin/orders/types";
import { Alert } from "~/components/ui/alert";
import { BLOCK_REASON_MAX } from "~/domain/availability";
import { calendarDayFlags, monthGrid, parseCalendarQuery } from "~/domain/calendar";
import { formatOrderNumber } from "~/domain/order-number";
import { addDays, formatDayLabel, formatDayMonth, formatLongDate, formatMonthYear, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { type AdminUser, requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { CalendarBlockInput } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { type AdminOrderItem, type AdminOrderRow, itemsOfOrders } from "~/server/repos/admin-orders.server";
import { blocksBetween, countDays, listCalendarOrders } from "~/server/repos/admin-calendar.server";
import { readAvailabilityRules } from "~/server/repos/owner-settings.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
import { noStore } from "~/server/response-headers.server";
import { blockDay, unblockDay } from "~/server/services/calendar-blocks.server";
import type { Route } from "./+types/calendar";

/** `admin/calendar` (admin): month counts, week and day lists, block and reopen a day (E-07 S-136..S-138). */
export const handle = { titleKey: "admin.nav.calendar" };

/** Counts change with every order: never stored. */
export const middleware: Route.MiddlewareFunction[] = [noStore];

/** A busy day or week still answers fast; the day view of one date shows up to this many (S-137 AC5). */
const LIST_LIMIT = 300;

function itemsPreview(items: AdminOrderItem[] = [], locale: Locale): string[] {
  const shown = items.slice(0, 2).map((item) => translate("admin.orders.itemPreview", locale, { quantity: item.quantity, name: localized(item.name, locale) }));
  return items.length > 2 ? [...shown, translate("admin.orders.moreItems", locale, { count: items.length - 2 })] : shown;
}

async function orderViews(db: Parameters<typeof itemsOfOrders>[0], rows: AdminOrderRow[], locale: Locale) {
  if (rows.length === 0) return [];
  const items = await itemsOfOrders(db, rows.map((row) => row.id));
  const prefix = rows.some((row) => row.numberPrefix === null) ? (await getCheckoutSettings(db)).orderNumberPrefix : "";
  return rows.map(({ numberPrefix, ...row }) => ({
    ...row,
    number: formatOrderNumber(numberPrefix ?? prefix, row.number),
    dateLabel: formatDayLabel(row.fulfilOn, locale),
    itemsPreview: itemsPreview(items.get(row.id), locale),
  }));
}

export type CalendarOrderView = Awaited<ReturnType<typeof orderViews>>[number];

/**
 * `admin/calendar` loader (contracts.md): `?month=YYYY-MM&view=month|week|day&date`. `days` covers
 * the view's dates with active counts and block flags (reason for admins only); `list` the view's
 * active orders (week and day views; the month grid needs counts only). A bad query is 400.
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const today = todayMU(args.context.get(clockContext).now());
  const query = parseCalendarQuery(new URL(args.request.url).searchParams, today);
  if (!query.ok) throw data(translate("admin.calendar.badQuery", me.locale), { status: 400 });
  const db = args.context.get(requestDbContext).db;
  const [counts, blocks, rules, rows] = await Promise.all([
    countDays(db, query.from, query.to),
    blocksBetween(db, query.from, query.to),
    readAvailabilityRules(db),
    query.view === "month" ? Promise.resolve([]) : listCalendarOrders(db, query.from, query.to, LIST_LIMIT + 1),
  ]);
  const byDate = new Map(counts.map((count) => [count.date, count]));
  const dates = Array.from({ length: Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86_400_000) + 1 }, (_, i) => addDays(query.from, i));
  const days = dates.map((date) => ({
    date,
    delivery: byDate.get(date)?.delivery ?? 0,
    pickup: byDate.get(date)?.pickup ?? 0,
    ...calendarDayFlags(date, blocks, rules.closedWeekdays),
    label: formatDayLabel(date, me.locale),
    longLabel: formatLongDate(date, me.locale),
    dayMonth: formatDayMonth(date, me.locale),
  }));
  return {
    title: translate(handle.titleKey, me.locale),
    view: query.view,
    month: query.month,
    date: query.date,
    today,
    role: me.role,
    monthLabel: formatMonthYear(`${query.month}-01`, me.locale),
    weeks: query.view === "month" ? monthGrid(query.month).map((week) => week.map((cell) => cell.date)) : [],
    days,
    list: await orderViews(db, rows.slice(0, LIST_LIMIT), me.locale),
    more: rows.length > LIST_LIMIT,
    reasonMax: BLOCK_REASON_MAX,
  };
}

export type CalendarLoaderData = Route.ComponentProps["loaderData"];

const refusal = (me: AdminUser, intent: string, date: string, field?: string) =>
  actionError("VALIDATION_FAILED", me.locale, { fields: field ? { [field]: translate(`admin.calendar.problem.${field}`, me.locale) } : undefined, extra: { intent, date } });

/** `blockDay` `{ date, reason? ≤ 200 }` → `{ ok, intent, date, existingOrders }` · `unblockDay` `{ date }` → `{ ok, intent, date }` (S-138). */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = Object.fromEntries(await args.request.formData());
  const parsed = CalendarBlockInput.safeParse(form);
  const intent = typeof form.intent === "string" ? form.intent : "";
  const date = typeof form.date === "string" ? form.date : "";
  if (!parsed.success) {
    const field = parsed.error.issues.some((issue) => issue.path[0] === "reason") ? "reason" : "date";
    return refusal(me, intent, date, field);
  }
  const db = args.context.get(requestDbContext).db;
  const actor = { adminId: me.id, role: me.role, today: todayMU(args.context.get(clockContext).now()) };
  if (parsed.data.intent === "blockDay") {
    const result = await blockDay(db, { date: parsed.data.date, reason: parsed.data.reason ?? null }, actor);
    if (!result.ok) return refusal(me, intent, date, "date");
    return { ok: true as const, intent: "blockDay" as const, date: parsed.data.date, existingOrders: await orderViews(db, result.existingOrders, me.locale) };
  }
  const result = await unblockDay(db, parsed.data.date, actor);
  if (result.ok) return { ok: true as const, intent: "unblockDay" as const, date: parsed.data.date };
  if (result.code === "VALIDATION_FAILED") return refusal(me, intent, date, "date");
  if (result.code === "FORBIDDEN") return actionError("FORBIDDEN", me.locale, { extra: { intent, date, details: { reason: result.reason } } });
  return actionError("NOT_FOUND", me.locale, { extra: { intent, date } });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AdminCalendar({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <CalendarHeader data={loaderData} />
      {loaderData.view === "month" && <MonthGrid data={loaderData} />}
      {loaderData.view === "week" && <WeekView data={loaderData} />}
      {loaderData.view === "day" && <DayView data={loaderData} />}
    </>
  );
}

/** A bad query or a failed load (S-136 AC5, S-137 AC6): an Alert with Retry. */
export function ErrorBoundary() {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("admin.nav.calendar")}</h1>
      <Alert tone="danger" role="alert" className="mt-6">
        <p className="font-semibold">{t("admin.calendar.loadFailed")}</p>
        <a href="/admin/calendar" className={listLinkClass}>
          {t("admin.calendar.retry")}
        </a>
      </Alert>
    </>
  );
}
