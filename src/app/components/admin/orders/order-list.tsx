import { useState } from "react";
import { useFetcher } from "react-router";
import { LoaderCircle } from "lucide-react";
import type { ListTab } from "~/domain/order-tabs";
import { useI18n } from "~/i18n/react";
import { type OrderListFilters, hasFilters, listHref } from "~/domain/order-list-filters";
import { OrderRow } from "./order-row";
import { type OrderRowView, listLinkClass } from "./types";

interface Page {
  data: OrderRowView[];
  nextCursor: string | null;
}

/**
 * Pages fetched with Load more, appended under the first one. Kept with the "state from the
 * previous render" pattern (no effect): each new fetcher answer is added once.
 */
function useMorePages(): { pages: Page[]; load: (href: string) => void; loading: boolean } {
  const fetcher = useFetcher<Page>();
  const [seen, setSeen] = useState<Page | undefined>(undefined);
  const [pages, setPages] = useState<Page[]>([]);
  if (fetcher.data && fetcher.data !== seen) {
    setSeen(fetcher.data);
    setPages((previous) => [...previous, fetcher.data!]);
  }
  return { pages, load: (href) => fetcher.load(href), loading: fetcher.state !== "idle" };
}

/**
 * A list tab's orders (S-111 AC4, AC5): 30 at a time; Load more appends the next page in place
 * (keyset cursor) and still works as a plain link before JavaScript. Empty tab and no-match texts
 * offer the next step. Re-mounted (key) whenever the tab or filters change.
 */
export function OrderList({ tab, filters, first }: { tab: ListTab; filters: OrderListFilters; first: Page }) {
  const { t } = useI18n();
  const { pages, load, loading } = useMorePages();
  const rows = [first, ...pages].flatMap((page) => page.data);
  const next = (pages.at(-1) ?? first).nextCursor;
  const nextHref = next ? `${listHref(tab, filters)}&cursor=${encodeURIComponent(next)}` : null;
  if (rows.length === 0) {
    return hasFilters(filters) ? (
      <p className="mt-6 text-lg">
        {t("admin.orders.noMatch")}{" "}
        <a href={`/admin/orders?tab=${tab}`} className={listLinkClass}>
          {t("admin.orders.clearFilters")}
        </a>
      </p>
    ) : (
      <p className="mt-6 text-lg">{t(`admin.orders.emptyTab.${tab}`)}</p>
    );
  }
  return (
    <>
      <ul className="mt-6 grid gap-3" aria-label={t("admin.orders.listTitle")}>
        {rows.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>
      {nextHref && (
        <p className="mt-6">
          <a
            href={nextHref}
            aria-busy={loading || undefined}
            onClick={(event) => {
              event.preventDefault();
              if (!loading) load(nextHref);
            }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-input bg-card px-6 font-semibold hover:bg-accent"
          >
            {loading && <LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />}
            {t("admin.orders.loadMore")}
          </a>
          <span role="status" className="sr-only">
            {loading ? t("admin.orders.loadingMore") : ""}
          </span>
        </p>
      )}
    </>
  );
}
