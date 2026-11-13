import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { RadioCard } from "~/components/ui/radio-card";
import type { ListTab } from "~/domain/order-tabs";
import { formatDayLabel } from "~/domain/time";
import { useI18n } from "~/i18n/react";
import { type FilterField, type FilterProblem, type OrderListFilters, hasFilters, listHref } from "~/domain/order-list-filters";
import { listLinkClass } from "./types";

const fieldClass = "mt-2 block min-h-12 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground aria-invalid:border-destructive";

interface Props {
  tab: ListTab;
  filters: OrderListFilters;
  problems: Partial<Record<FilterField, FilterProblem>>;
  /** The raw search text as typed (kept when it was too long, S-112 AC6). */
  typed: string;
}

/** Hidden inputs that keep the other filters when one form is sent. */
function Keep({ tab, filters, omit }: { tab: ListTab; filters: OrderListFilters; omit: (keyof OrderListFilters)[] }) {
  const kept = Object.entries(filters).filter(([key, value]) => value !== null && !omit.includes(key as keyof OrderListFilters));
  return (
    <>
      <input type="hidden" name="tab" value={tab} />
      {kept.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={String(value)} />
      ))}
    </>
  );
}

function RadioGroup({ legend, name, value, options }: { legend: string; name: string; value: string; options: [string, string][] }) {
  return (
    <fieldset className="mt-4">
      <legend className="font-semibold">{legend}</legend>
      <div className="mt-2 grid gap-2 min-[24rem]:grid-cols-3">
        {options.map(([optionValue, label]) => (
          <RadioCard key={optionValue} id={`filter-${name}-${optionValue || "any"}`} name={name} value={optionValue} title={label} defaultChecked={value === optionValue} />
        ))}
      </div>
    </fieldset>
  );
}

/** The filter sheet (S-112 AC3, AC4, AC8): a GET form; the Modal traps focus, Esc closes and returns focus. */
function FilterSheet({ open, onClose, tab, filters, problems }: Props & { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const dateError = problems.to ?? problems.from;
  return (
    <Modal open={open} onClose={onClose} title={t("admin.orders.filtersTitle")} closeLabel={t("admin.states.close")}>
      <form method="get" action="/admin/orders">
        <Keep tab={tab} filters={filters} omit={["fulfilment", "paid", "from", "to"]} />
        <RadioGroup legend={t("admin.orders.fulfilmentLegend")} name="fulfilment" value={filters.fulfilment ?? ""} options={[["", t("admin.orders.any")], ["delivery", t("admin.order.delivery")], ["pickup", t("admin.order.pickup")]]} />
        <RadioGroup legend={t("admin.orders.paidLegend")} name="paid" value={filters.paid === null ? "" : String(filters.paid)} options={[["", t("admin.orders.any")], ["true", t("admin.orders.paidOnly")], ["false", t("admin.orders.unpaidOnly")]]} />
        <div className="mt-4 grid gap-3 min-[24rem]:grid-cols-2">
          {(["from", "to"] as const).map((field) => (
            <div key={field}>
              <label htmlFor={`filter-${field}`} className="font-semibold">
                {t(`admin.orders.${field}`)}
              </label>
              <input id={`filter-${field}`} type="date" name={field} defaultValue={filters[field] ?? ""} aria-invalid={problems[field] ? true : undefined} aria-describedby={problems[field] ? "filter-date-error" : undefined} className={fieldClass} />
            </div>
          ))}
        </div>
        {dateError && (
          <p id="filter-date-error" className="mt-1 font-semibold text-destructive">
            {t(`admin.orders.problem.${dateError}`)}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="submit" size="lg" className="h-auto min-h-12 flex-1 whitespace-normal">
            {t("admin.orders.apply")}
          </Button>
          <a href={listHref(tab, { ...filters, fulfilment: null, paid: null, from: null, to: null })} className={`${listLinkClass} px-2`}>
            {t("admin.orders.clearFilters")}
          </a>
        </div>
      </form>
    </Modal>
  );
}

function chips(t: ReturnType<typeof useI18n>["t"], locale: "en" | "fr", filters: OrderListFilters): { key: keyof OrderListFilters; label: string }[] {
  const list: { key: keyof OrderListFilters; label: string }[] = [];
  if (filters.q) list.push({ key: "q", label: t("admin.orders.chipQuery", { q: filters.q }) });
  if (filters.fulfilment) list.push({ key: "fulfilment", label: t(`admin.order.${filters.fulfilment}`) });
  if (filters.paid !== null) list.push({ key: "paid", label: filters.paid ? t("admin.orders.paidOnly") : t("admin.orders.unpaidOnly") });
  if (filters.from) list.push({ key: "from", label: t("admin.orders.chipFrom", { date: formatDayLabel(filters.from, locale) }) });
  if (filters.to) list.push({ key: "to", label: t("admin.orders.chipTo", { date: formatDayLabel(filters.to, locale) }) });
  return list;
}

/**
 * Search under the tabs (S-112): a GET form with a labelled search box, the Filters sheet, and a
 * chip per active filter ("Remove filter: Delivery"), plus Clear filters. Search spans the active
 * tab only (recorded decision). Works without JavaScript except the sheet.
 */
export function SearchAndFilters(props: Props) {
  const { t, locale } = useI18n();
  const { tab, filters, problems, typed } = props;
  const [open, setOpen] = useState(false);
  const active = chips(t, locale, filters);
  return (
    <div className="mt-4">
      <form method="get" action="/admin/orders" role="search" className="flex flex-wrap items-end gap-2">
        <Keep tab={tab} filters={filters} omit={["q"]} />
        <div className="min-w-0 flex-1 basis-48">
          <label htmlFor="orders-q" className="font-semibold">
            {t("admin.orders.searchLabel")}
          </label>
          <input
            id="orders-q"
            type="search"
            name="q"
            defaultValue={typed}
            placeholder={t("admin.orders.searchHint")}
            autoComplete="off"
            aria-invalid={problems.q ? true : undefined}
            aria-describedby={problems.q ? "orders-q-error" : undefined}
            className={fieldClass}
          />
        </div>
        <Button type="submit" size="lg" className="h-auto min-h-12">
          {t("admin.orders.searchButton")}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-auto min-h-12" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal aria-hidden="true" />
          {t("admin.orders.filtersButton")}
        </Button>
      </form>
      {problems.q && (
        <p id="orders-q-error" className="mt-1 font-semibold text-destructive">
          {t("admin.orders.problem.tooLong")}
        </p>
      )}
      {(problems.from || problems.to) && (
        <Alert tone="warning" className="mt-3">
          <p>{t(`admin.orders.problem.${problems.to ?? problems.from}`)}</p>
        </Alert>
      )}
      {active.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label={t("admin.orders.filtersTitle")}>
          {active.map((chip) => (
            <li key={chip.key}>
              <a href={listHref(tab, { ...filters, [chip.key]: null })} aria-label={t("admin.orders.removeFilter", { label: chip.label })} className="inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-input bg-card px-3 font-semibold hover:bg-accent">
                <span className="wrap-anywhere">{chip.label}</span>
                <X aria-hidden="true" className="size-4 shrink-0" />
              </a>
            </li>
          ))}
          {hasFilters(filters) && (
            <li>
              <a href={`/admin/orders?tab=${tab}`} className={`${listLinkClass} px-2`}>
                {t("admin.orders.clearFilters")}
              </a>
            </li>
          )}
        </ul>
      )}
      <FilterSheet {...props} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
