import { Search } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { Form, Link, data, useFetcher, useSubmit } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { Button } from "~/components/ui/button";
import { parseCustomerSearch } from "~/domain/customer-search";
import { isAnonymised } from "~/domain/customer-totals";
import { formatDayLabel } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { type Locale, formatRupees } from "~/lib/locale";
import { useHydrated } from "~/lib/use-hydrated";
import { cn } from "~/lib/utils";
import { requireAdmin } from "~/server/auth.server";
import { pageLimit } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { CUSTOMER_SORTS, type CustomerListRow, type CustomerSort, listCustomers } from "~/server/repos/admin-customers.server";
import type { Route } from "./+types/customers";

/** `admin/customers` (S-174, S-175, FR-065): Admins and Owners. */
export const handle = { titleKey: "admin.nav.customers" };

const PATH = "/admin/customers";

function rowView(row: CustomerListRow, locale: Locale) {
  const deleted = isAnonymised(row);
  return {
    id: row.id,
    name: deleted ? translate("admin.customers.deleted", locale) : row.name,
    // An anonymised customer never shows a phone (S-174 AC6, NFR-004).
    phone: deleted ? null : row.phone,
    deleted,
    orderCount: row.orderCount,
    totalSpentRs: row.totalSpentRs,
    lastOrderOn: row.lastOrderOn,
    lastOrderLabel: row.lastOrderOn ? formatDayLabel(row.lastOrderOn, locale) : null,
  };
}

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const params = args.url.searchParams;
  const sort: CustomerSort = (CUSTOMER_SORTS as readonly string[]).includes(params.get("sort") ?? "") ? (params.get("sort") as CustomerSort) : "last_order";
  const search = parseCustomerSearch(params.get("q"));
  const common = { title: translate("admin.customers.metaTitle", me.locale), sort, q: (params.get("q") ?? "").trim() };
  if (!search.ok) return data({ ...common, invalid: { code: search.code }, data: [], nextCursor: null, total: 0 }, { status: 400 });
  const db = args.context.get(requestDbContext).db;
  const page = await listCustomers(db, { search, sort, cursor: params.get("cursor"), limit: pageLimit(params.get("limit")) });
  // The query itself is personal data: only its length is logged (S-175 AC5).
  if (search.text !== "") console.log(JSON.stringify({ level: "info", event: "customers_searched", length: search.text.length, actorRole: me.role }));
  return { ...common, q: search.text, invalid: null, data: page.rows.map((row) => rowView(row, me.locale)), nextCursor: page.nextCursor, total: page.total };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];
type Row = LoaderData["data"][number];

const linkClass = "inline-flex min-h-11 items-center font-semibold link";

function query(q: string, sort: CustomerSort, cursor?: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "last_order" || cursor) params.set("sort", sort);
  if (cursor) params.set("cursor", cursor);
  const text = params.toString();
  return text ? `${PATH}?${text}` : PATH;
}

/** Sticky search (S-175 AC8): visible label, `role=search`, sort select that applies at once with JavaScript. */
function SearchBar({ q, sort, invalid }: { q: string; sort: CustomerSort; invalid: boolean }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const submit = useSubmit();
  const errorId = "customer-search-error";
  const formId = "customer-search";
  // Only the field and its button stay pinned while scrolling (a phone keeps most of the screen
  // for results); Sort sits below, in the same form through the `form` attribute.
  return (
    <>
      <Form id={formId} method="get" action={PATH} role="search" className="sticky top-0 z-10 -mx-4 mt-4 border-b border-border bg-background px-4 py-3">
        <label htmlFor="customer-q" className="block font-semibold">
          {t("admin.customers.searchLabel")} <span className="font-normal text-muted-foreground">({t("admin.customers.searchHint")})</span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <input
            id="customer-q"
            type="search"
            name="q"
            defaultValue={q}
            autoComplete="off"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className="block min-h-11 min-w-0 flex-[1_1_10rem] rounded-md border-2 border-input bg-background px-3 text-base"
          />
          <Button type="submit" className="min-h-11 px-4">
            <Search aria-hidden="true" />
            {t("admin.customers.search")}
          </Button>
          {q && (
            <Link to={query("", sort)} className={cn(linkClass, "min-w-11 justify-center px-1")}>
              {t("admin.customers.clear")}
            </Link>
          )}
        </div>
        {invalid && (
          <p id={errorId} role="alert" className="mt-2 font-semibold text-destructive">
            {t("admin.customers.tooLong")}
          </p>
        )}
      </Form>
      <label className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
        {t("admin.customers.sortLabel")}
        <select
          name="sort"
          form={formId}
          defaultValue={sort}
          onChange={(event) => hydrated && submit(event.currentTarget.form)}
          className="block min-h-11 min-w-0 flex-[1_1_10rem] rounded-md border-2 border-input bg-background px-3 text-base sm:flex-none"
        >
          {(["last_order", "name", "spent"] as const).map((key) => (
            <option key={key} value={key}>
              {t(`admin.customers.sort.${key}`)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold">{term}:</dt>
      <dd className="min-w-0 wrap-anywhere tabular-nums">{children}</dd>
    </div>
  );
}

function CustomerCard({ row }: { row: Row }) {
  const { t } = useI18n();
  return (
    <li className="min-w-0 rounded-card border border-border bg-card px-2 py-2 min-[20rem]:px-4">
      <Link to={`${PATH}/${row.id}`} className={cn(linkClass, "text-lg wrap-anywhere")}>
        {row.name}
      </Link>
      <dl className="grid gap-1 pb-2">
        {row.phone && <Fact term={t("admin.customers.phone")}>{row.phone}</Fact>}
        <Fact term={t("admin.customers.orders")}>{row.orderCount}</Fact>
        <Fact term={t("admin.customers.spent")}>{formatRupees(row.totalSpentRs)}</Fact>
        <Fact term={t("admin.customers.lastOrder")}>{row.lastOrderLabel ?? t("admin.customers.none")}</Fact>
      </dl>
    </li>
  );
}

/** Next pages appended in place with JavaScript (the link works without it); cursor pages never overlap. */
function useMorePages(loaderData: LoaderData) {
  const fetcher = useFetcher<typeof loader>();
  const [pages, setPages] = useState<LoaderData[]>([]);
  const landed = fetcher.state === "idle" && fetcher.data && !pages.includes(fetcher.data as LoaderData) ? [fetcher.data as LoaderData] : [];
  const all = [...pages, ...landed];
  const cursor = all.length > 0 ? all.at(-1)!.nextCursor : loaderData.nextCursor;
  const loadMore = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!cursor || fetcher.state !== "idle") return;
    setPages(all);
    void fetcher.load(query(loaderData.q, loaderData.sort, cursor));
  };
  return { rows: [...loaderData.data, ...all.flatMap((page) => page.data)], cursor, loading: fetcher.state !== "idle", loadMore };
}

/** Keyed by the loaded page, so a new search or sort starts from its first page. */
function Results({ loaderData }: { loaderData: LoaderData }) {
  const { t } = useI18n();
  const { q, sort, invalid } = loaderData;
  const { rows, cursor, loading, loadMore } = useMorePages(loaderData);
  return (
    <>
      {rows.length === 0 && !invalid && <p className="mt-4 text-lg">{q ? t("admin.customers.noMatch", { query: q }) : t("admin.customers.empty")}</p>}
      {rows.length > 0 && (
        <ul className="mt-4 grid gap-3" aria-label={t("admin.nav.customers")}>
          {rows.map((row) => (
            <CustomerCard key={row.id} row={row} />
          ))}
        </ul>
      )}
      {cursor && (
        <p className="mt-6">
          <Link to={query(q, sort, cursor)} onClick={loadMore} aria-disabled={loading || undefined} className={linkClass}>
            {loading ? t("admin.customers.loadingMore") : t("admin.customers.more")}
          </Link>
        </p>
      )}
    </>
  );
}

export default function AdminCustomers({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { q, sort, invalid, total, nextCursor } = loaderData;
  return (
    <>
      <h1>{t("admin.nav.customers")}</h1>
      <SearchBar q={q} sort={sort} invalid={invalid !== null} />
      <p role="status" className="mt-3 font-semibold">
        {invalid ? "" : t("admin.customers.count", { count: total })}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t("admin.customers.spentHelp")}</p>
      <Results key={`${q}|${sort}|${nextCursor ?? ""}|${loaderData.data[0]?.id ?? ""}`} loaderData={loaderData} />
    </>
  );
}
