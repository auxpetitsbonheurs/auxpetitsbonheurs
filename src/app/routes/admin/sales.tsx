import { Bike, Globe, PencilLine, ShoppingBag, Sparkles } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { SalesExportButton } from "~/components/admin/sales-export-button";
import { StatusBadge } from "~/components/order/status-badge";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { ORDER_SOURCES, type RangeProblem, SALES_RANGES, type SalesRange, formatRangeLabel, resolveSalesRange } from "~/domain/sales";
import { formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { countAwaitingPayment, salesReport } from "~/server/repos/sales.server";
import type { Route } from "./+types/sales";

/** `admin/sales` (S-171..S-173, FR-068): Admins and Owners (owner decision). */
export const handle = { titleKey: "admin.nav.sales" };

const PAYMENT_TAB = "/admin/orders?tab=payment";

/** The query that reproduces a range (tabs, the CSV link). */
function rangeQuery(range: SalesRange, from: string, to: string): string {
  return range === "custom" ? `range=custom&from=${from}&to=${to}` : `range=${range}`;
}

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const db = args.context.get(requestDbContext).db;
  const today = todayMU(args.context.get(clockContext).now());
  const search = args.url.searchParams;
  const resolved = resolveSalesRange({ range: search.get("range"), from: search.get("from"), to: search.get("to") }, today);
  const common = {
    title: translate("admin.sales.metaTitle", me.locale),
    range: resolved.range,
    from: resolved.from,
    to: resolved.to,
    monthStart: `${today.slice(0, 8)}01`,
    today,
  };
  if (!resolved.ok) {
    const invalid = { code: "VALIDATION_FAILED" as const, problem: resolved.problem as RangeProblem };
    return data({ ...common, label: null, invalid, report: null, awaitingPayment: 0, query: "" }, { status: 400 });
  }
  const report = await salesReport(db, resolved, me.locale);
  const awaitingPayment = await countAwaitingPayment(db);
  console.log(JSON.stringify({ level: "info", event: "sales_viewed", range: resolved.range, actorRole: me.role }));
  return {
    ...common,
    label: formatRangeLabel(resolved.from, resolved.to, me.locale),
    invalid: null,
    report: { ...report, unpaid: report.unpaid.map((row) => ({ ...row, dateLabel: formatDayLabel(row.fulfilOn, me.locale) })) },
    awaitingPayment,
    query: rangeQuery(resolved.range, resolved.from, resolved.to),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type Report = NonNullable<LoaderData["report"]>;

const linkClass = "inline-flex min-h-11 items-center font-semibold link";

/** Period tabs (S-171 AC12): links in a `tablist`, arrows/Home/End move focus, Enter or Space opens. */
function PeriodTabs({ current, from, to, monthStart, today }: { current: SalesRange; from: string; to: string; monthStart: string; today: string }) {
  const { t } = useI18n();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const last = SALES_RANGES.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    } else if (target !== undefined) {
      event.preventDefault();
      refs.current[target]?.focus();
    }
  };
  const customFrom = current === "custom" ? from : monthStart;
  const customTo = current === "custom" ? to : today;
  return (
    <div role="tablist" aria-label={t("admin.sales.tabsLabel")} className="mt-4 flex flex-wrap gap-2">
      {SALES_RANGES.map((range, index) => (
        <Link
          key={range}
          ref={(el) => {
            refs.current[index] = el;
          }}
          id={`sales-tab-${range}`}
          role="tab"
          aria-selected={range === current}
          aria-controls="sales-panel"
          tabIndex={range === current ? 0 : -1}
          to={`/admin/sales?${rangeQuery(range, customFrom, customTo)}`}
          preventScrollReset
          onKeyDown={(event) => onKeyDown(event, index)}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md border-2 px-4 font-semibold",
            range === current ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
          )}
        >
          {t(`admin.sales.tab.${range}`)}
        </Link>
      ))}
    </div>
  );
}

/** Custom period: two labelled native date fields (keyboard-operable), GET so the range stays in the URL. */
function CustomRange({ from, to, problem }: { from: string; to: string; problem: RangeProblem | null }) {
  const { t } = useI18n();
  const field = "mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-md border-2 border-input bg-background px-2 text-base";
  const errorId = "sales-range-error";
  return (
    <Form method="get" action="/admin/sales" className="mt-4 rounded-card border border-border bg-card p-2 min-[20rem]:p-4" noValidate>
      <fieldset className="min-w-0">
        <legend className="font-semibold">{t("admin.sales.customLegend")}</legend>
        <input type="hidden" name="range" value="custom" />
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {(["from", "to"] as const).map((name) => (
            <label key={name} className="block min-w-0 font-semibold">
              {t(`admin.sales.${name}`)}
              <input
                type="date"
                name={name}
                defaultValue={name === "from" ? from : to}
                required
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? errorId : undefined}
                className={field}
              />
            </label>
          ))}
          <Button type="submit" className="min-h-11">
            {t("admin.sales.show")}
          </Button>
        </div>
        {problem && (
          <p id={errorId} role="alert" className="mt-3 font-semibold text-destructive">
            {t(`admin.sales.invalid.${problem}`)}
          </p>
        )}
      </fieldset>
    </Form>
  );
}

function Tiles({ report }: { report: Report }) {
  const { t } = useI18n();
  const tile = (label: string, value: string, wide = false) => (
    <div className={cn("min-w-0 rounded-card border border-border bg-card p-3 min-[20rem]:p-4", wide && "col-span-2 sm:col-span-1")}>
      <dt className="font-semibold">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums wrap-anywhere">{value}</dd>
    </div>
  );
  return (
    <>
      <dl aria-label={t("admin.sales.tilesLabel")} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tile(t("admin.sales.revenue"), formatRupees(report.revenueRs), true)}
        {tile(t("admin.sales.orders"), String(report.orderCount))}
        {tile(t("admin.sales.average"), formatRupees(report.averageRs))}
      </dl>
      <p className="mt-2 text-sm text-muted-foreground">{t("admin.sales.footnote")}</p>
      {report.orderCount === 0 && <p className="mt-3 text-lg">{t("admin.sales.empty")}</p>}
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A labelled line with an icon and a word, never colour alone (S-172 AC7). */
function IconLine({ Icon, label, children }: { Icon: typeof Bike; label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
      <span className="inline-flex items-center gap-2 font-semibold">
        <Icon aria-hidden="true" className="size-5" />
        {label}
      </span>
      <span className="tabular-nums">{children}</span>
    </li>
  );
}

function Breakdowns({ report }: { report: Report }) {
  const { t } = useI18n();
  const empty = <p className="mt-3">{t("admin.sales.empty")}</p>;
  const sourceIcon = { website: Globe, custom_request: Sparkles, manual: PencilLine } as const;
  return (
    <>
      <Section id="sales-fulfilment" title={t("admin.sales.fulfilmentTitle")}>
        {report.orderCount === 0 ? empty : (
          <ul className="mt-2">
            <IconLine Icon={Bike} label={t("admin.sales.delivery")}>
              {t("admin.sales.ordersCount", { count: report.delivery })} · {formatRupees(report.deliveryRevenueRs)}
            </IconLine>
            <IconLine Icon={ShoppingBag} label={t("admin.sales.pickup")}>
              {t("admin.sales.ordersCount", { count: report.pickup })} · {formatRupees(report.pickupRevenueRs)}
            </IconLine>
          </ul>
        )}
      </Section>
      <Section id="sales-top" title={t("admin.sales.topTitle")}>
        {report.top5.length === 0 ? empty : <TopTable rows={report.top5} />}
      </Section>
      <Section id="sales-source" title={t("admin.sales.sourceTitle")}>
        {report.orderCount === 0 ? empty : (
          <ul className="mt-2">
            {ORDER_SOURCES.map((source) => (
              <IconLine key={source} Icon={sourceIcon[source]} label={t(`admin.sales.source.${source}`)}>
                {formatRupees(report.bySource[source])}
              </IconLine>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function TopTable({ rows }: { rows: Report["top5"] }) {
  const { t } = useI18n();
  const cell = "border-b border-border py-2 pr-2 align-top";
  return (
    <table className="mt-2 w-full table-fixed text-left">
      <thead>
        <tr>
          <th scope="col" className={cn(cell, "w-12")}>{t("admin.sales.rank")}</th>
          <th scope="col" className={cell}>{t("admin.sales.product")}</th>
          <th scope="col" className={cn(cell, "w-14 text-right")}>{t("admin.sales.units")}</th>
          <th scope="col" className={cn(cell, "w-24 pr-0 text-right")}>{t("admin.sales.revenue")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.name}>
            <td className={cell}>{t("admin.sales.rankLabel", { rank: i + 1 })}</td>
            <th scope="row" className={cn(cell, "font-normal wrap-anywhere")}>{row.name}</th>
            <td className={cn(cell, "text-right tabular-nums")}>{row.quantity}</td>
            <td className={cn(cell, "pr-0 text-right tabular-nums")}>{formatRupees(row.revenueRs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Unpaid({ report, awaitingPayment, query }: { report: Report; awaitingPayment: number; query: string }) {
  const { t } = useI18n();
  return (
    <Section id="sales-unpaid" title={t("admin.sales.unpaidTitle")}>
      <p className="mt-1 text-muted-foreground">{t("admin.sales.unpaidHelp")}</p>
      <p className="mt-2 text-lg">
        <span className="font-semibold">{t("admin.sales.unpaidTotal")}</span> <span className="tabular-nums">{formatRupees(report.unpaidTotalRs)}</span>
      </p>
      {report.unpaid.length === 0 ? (
        <p className="mt-2">{t("admin.sales.unpaidEmpty")}</p>
      ) : (
        <ul className="mt-3 grid gap-3" aria-labelledby="sales-unpaid">
          {report.unpaid.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-card px-4 py-2">
              <Link to={`/admin/orders/${row.id}`} className={cn(linkClass, "wrap-anywhere")}>
                {t("admin.sales.unpaidRow", { number: row.number, name: row.contactName, amount: formatRupees(row.totalRs) })}
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
                <StatusBadge status={row.status} audience="admin" />
                <span>{row.dateLabel}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {report.unpaidCount > report.unpaid.length && (
        <p className="mt-3">
          {t("admin.sales.unpaidCapped", { shown: report.unpaid.length, count: report.unpaidCount })}{" "}
          <a href={`/admin/sales.csv?${query}`} className={linkClass} download>
            {t("admin.sales.exportAll")}
          </a>
        </p>
      )}
      {awaitingPayment > 0 && (
        <Alert tone="info" className="mt-4">
          <p>{t("admin.sales.awaiting", { count: awaitingPayment })}</p>
          <Link to={PAYMENT_TAB} className={linkClass}>
            {t("admin.sales.awaitingLink")}
          </Link>
        </Alert>
      )}
    </Section>
  );
}

export default function AdminSales({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location?.pathname === "/admin/sales";
  const { range, from, to, label, invalid, report, awaitingPayment, query, monthStart, today } = loaderData;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{t("admin.nav.sales")}</h1>
        {report && <SalesExportButton query={query} />}
      </div>
      {label && <p className="mt-1 text-lg font-semibold">{t("admin.sales.rangeHeading", { label })}</p>}
      <PeriodTabs current={range} from={from} to={to} monthStart={monthStart} today={today} />
      <div id="sales-panel" role="tabpanel" aria-labelledby={`sales-tab-${range}`} aria-busy={loading || undefined} className={cn(loading && "opacity-60 motion-safe:transition-opacity")}>
        {loading && <p role="status" className="sr-only">{t("admin.sales.loading")}</p>}
        {range === "custom" && <CustomRange from={from} to={to} problem={invalid?.problem ?? null} />}
        {report && (
          <>
            <Tiles report={report} />
            <Breakdowns report={report} />
            <Unpaid report={report} awaitingPayment={awaitingPayment} query={query} />
          </>
        )}
      </div>
    </>
  );
}
