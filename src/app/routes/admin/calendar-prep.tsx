import { ArrowLeft } from "lucide-react";
import { data } from "react-router";
import { PrepActions } from "~/components/admin/calendar/prep-actions";
import { PrepGroups } from "~/components/admin/calendar/prep-groups";
import { listLinkClass } from "~/components/admin/orders/types";
import { Alert } from "~/components/ui/alert";
import { buildPrepList, prepShareText } from "~/domain/prep-list";
import { formatClockTime, formatLongDate, isValidMuDate } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { prepItems } from "~/server/repos/admin-calendar.server";
import { noStore } from "~/server/response-headers.server";
import type { Route } from "./+types/calendar-prep";

/** `admin/prep` (`/admin/calendar/:date/prep`, admin): what to make that day (E-07 S-139, S-140). */
export const handle = { titleKey: "admin.prep.title" };

/** A snapshot of the moment: never stored (S-140 AC6 "Generated <time>"). */
export const middleware: Route.MiddlewareFunction[] = [noStore];

/**
 * `admin/prep` loader (contracts.md): `{ date, summary, groups, shareText }` from *confirmed*
 * orders only, grouped by product then variant; no customer name, phone or address anywhere
 * (S-139 AC8, S-140 AC3); `shareText` built here in the admin's language. A bad date is 400.
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const date = args.params.date;
  if (!isValidMuDate(date)) throw data(translate("admin.prep.badDate", me.locale), { status: 400 });
  const now = args.context.get(clockContext).now();
  const list = buildPrepList(await prepItems(args.context.get(requestDbContext).db, date), me.locale);
  const dateLabel = formatLongDate(date, me.locale);
  const generatedLabel = translate("admin.prep.generated", me.locale, { time: formatClockTime(now) });
  return {
    title: `${translate("admin.prep.title", me.locale)} · ${dateLabel}`,
    date,
    dateLabel,
    generatedLabel,
    ...list,
    shareText: list.groups.length === 0 ? "" : prepShareText(list, { dateLabel, generatedLabel, locale: me.locale }),
  };
}

export type PrepLoaderData = Route.ComponentProps["loaderData"];

/** `log { method: share | copy | print }`: a no-PII log line per Share or Print (spec analytics). */
export async function action(args: Route.ActionArgs) {
  const me = await requireAdmin(args);
  const form = await args.request.formData();
  const method = form.get("method");
  if (!isValidMuDate(args.params.date) || (method !== "share" && method !== "copy" && method !== "print")) return { ok: false as const };
  console.log(JSON.stringify({ level: "info", event: method === "print" ? "prep_list_printed" : "prep_list_shared", date: args.params.date, method, actorRole: me.role }));
  return { ok: true as const };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

function BackLink({ date }: { date: string }) {
  const { t } = useI18n();
  return (
    <a href={`/admin/calendar?view=day&date=${date}`} className={`${listLinkClass} gap-1 print:hidden`}>
      <ArrowLeft aria-hidden="true" className="size-5" />
      {t("admin.prep.backToDay")}
    </a>
  );
}

export default function AdminPrepList({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const empty = loaderData.groups.length === 0;
  return (
    <article data-prep-sheet="" className="grid gap-4">
      <BackLink date={loaderData.date} />
      <header className="grid gap-1">
        <h1>{t("admin.prep.title")}</h1>
        <p className="text-h2 first-letter:uppercase">{loaderData.dateLabel}</p>
        {!empty && (
          <p className="text-lg font-semibold">
            {t("admin.prep.summary", { orders: t("admin.prep.orders", { count: loaderData.summary.orders }), items: t("admin.prep.items", { count: loaderData.summary.items }) })}
          </p>
        )}
        <p className="text-sm">{loaderData.generatedLabel}</p>
      </header>
      {empty ? (
        <div className="grid gap-2">
          <p className="text-lg">{t("admin.prep.empty")}</p>
          <a href={`/admin/calendar?month=${loaderData.date.slice(0, 7)}`} className={listLinkClass}>
            {t("admin.prep.backToCalendar")}
          </a>
        </div>
      ) : (
        <>
          <PrepActions data={loaderData} />
          <PrepGroups groups={loaderData.groups} />
          <p className="text-sm print:hidden">{t("admin.prep.statusesNote")}</p>
        </>
      )}
    </article>
  );
}

/** A failed load or a bad date (S-139 AC7): an Alert with Retry. */
export function ErrorBoundary() {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("admin.prep.title")}</h1>
      <Alert tone="danger" role="alert" className="mt-6">
        <p className="font-semibold">{t("admin.prep.loadFailed")}</p>
        <a href="" className={listLinkClass}>
          {t("admin.prep.retry")}
        </a>
        <a href="/admin/calendar" className={listLinkClass}>
          {t("admin.prep.backToCalendar")}
        </a>
      </Alert>
    </>
  );
}
