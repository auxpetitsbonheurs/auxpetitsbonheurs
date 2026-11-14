import { DayList } from "~/components/admin/today/day-list";
import { TodayTiles } from "~/components/admin/today/tiles";
import { UndoToast } from "~/components/admin/today/undo-toast";
import { listLinkClass } from "~/components/admin/orders/types";
import { Alert } from "~/components/ui/alert";
import { adminAllowed } from "~/domain/order-transitions";
import { formatOrderNumber } from "~/domain/order-number";
import { addDays, formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { adminPageLocale } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import { noStore } from "~/server/response-headers.server";
import { clockContext } from "~/server/clock.server";
import { TodayActionInput } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { type AdminOrderItem, type AdminOrderRow, itemsOfOrders } from "~/server/repos/admin-orders.server";
import { countToday, listDayOrders } from "~/server/repos/admin-today.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
import { runOrderAction } from "~/server/services/order-action.server";
import type { Route } from "./+types/home";

/** Names the page in the admin header (S-033 AC6). */
export const handle = { titleKey: "admin.nav.today" };

/** Counts change with every action: never stored, page or data request (S-120 AC6). */
export const middleware: Route.MiddlewareFunction[] = [noStore];

function itemsPreview(items: AdminOrderItem[] = [], locale: Locale): string[] {
  const shown = items.slice(0, 2).map((item) => translate("admin.orders.itemPreview", locale, { quantity: item.quantity, name: localized(item.name, locale) }));
  return items.length > 2 ? [...shown, translate("admin.orders.moreItems", locale, { count: items.length - 2 })] : shown;
}

/**
 * `admin/today` loader (contracts.md, FR-048, S-120): the greeting, `counts` (to review, quotes
 * to send, awaiting payment, unpaid), and the active orders of today and tomorrow in Mauritius
 * time with `nextStatus` (null when the row needs Approve, a quote or the Juice payment).
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const db = args.context.get(requestDbContext).db;
  const today = todayMU(args.context.get(clockContext).now());
  const tomorrow = addDays(today, 1);
  const [counts, rows] = await Promise.all([countToday(db), listDayOrders(db, [today, tomorrow])]);
  const items = await itemsOfOrders(db, rows.map((row) => row.id));
  const prefix = rows.some((row) => row.numberPrefix === null) ? (await getCheckoutSettings(db)).orderNumberPrefix : "";
  const view = ({ numberPrefix, ...row }: AdminOrderRow) => ({
    ...row,
    number: formatOrderNumber(numberPrefix ?? prefix, row.number),
    dateLabel: formatDayLabel(row.fulfilOn, me.locale),
    itemsPreview: itemsPreview(items.get(row.id), me.locale),
    nextStatus: adminAllowed(row.status, row.fulfilment).advance,
  });
  return {
    name: me.name,
    title: translate("admin.home.metaTitle", adminPageLocale(args)),
    counts,
    today: { date: today, label: formatDayLabel(today, me.locale), orders: rows.filter((row) => row.fulfilOn === today).map(view) },
    tomorrow: { date: tomorrow, label: formatDayLabel(tomorrow, me.locale), orders: rows.filter((row) => row.fulfilOn === tomorrow).map(view) },
  };
}

/** `admin/today` `advance` and its Undo `revert` (S-121): `{ orderId, version }` → `{ ok, intent, orderId, order }` or ORDER_CHANGED / INVALID_TRANSITION. */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = Object.fromEntries(await args.request.formData());
  const input = TodayActionInput.safeParse(form);
  if (!input.success) return actionError("VALIDATION_FAILED", me.locale);
  const { intent, orderId, version } = input.data;
  const db = args.context.get(requestDbContext).db;
  const result = await runOrderAction(db, { intent, version }, { orderId, adminId: me.id, now: args.context.get(clockContext).now() });
  if (!result.ok) return actionError(result.code, me.locale, { extra: { intent, orderId } });
  return { ok: true as const, intent, orderId, order: "order" in result ? result.order : null };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export type TodayLoaderData = Route.ComponentProps["loaderData"];

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("admin.home.title", { name: loaderData.name })}</h1>
      {/* E-07 S-131: phone, WhatsApp and walk-in orders. */}
      <a href="/admin/orders/new" className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-md border-2 border-primary bg-primary px-3 font-semibold text-primary-foreground hover:opacity-90">
        {t("admin.orderNew.add")}
      </a>
      <TodayTiles counts={loaderData.counts} />
      <DayList id="today-heading" title={t("admin.today.todayTitle", { date: loaderData.today.label })} empty={t("admin.today.emptyToday")} orders={loaderData.today.orders} />
      <DayList id="tomorrow-heading" title={t("admin.today.tomorrowTitle", { date: loaderData.tomorrow.label })} empty={t("admin.today.emptyTomorrow")} orders={loaderData.tomorrow.orders} />
      <UndoToast />
    </>
  );
}

/** Today failed (S-120 AC8): an Alert with Retry. */
export function ErrorBoundary() {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("admin.nav.today")}</h1>
      <Alert tone="danger" role="alert" className="mt-6">
        <p className="font-semibold">{t("admin.today.loadFailed")}</p>
        <a href="/admin" className={listLinkClass}>
          {t("admin.today.retry")}
        </a>
      </Alert>
    </>
  );
}
