import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { formatLogTime } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { requireAdmin } from "~/server/auth.server";
import { requestDbContext } from "~/server/db.server";
import { listSitePages } from "~/server/repos/site-pages.server";
import type { Route } from "./+types/pages";

/**
 * `admin/pages` (**admin**, E-13 S-246 AC1): the five brand pages, each with its name, a
 * "Sample text" badge while it still holds the placeholder, and when and by whom it was
 * last edited. Admins and Owners alike (Lead decision 1, 2026-11-12).
 */
export const handle = { titleKey: "admin.pages.title" };

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const rows = await listSitePages(args.context.get(requestDbContext).db);
  return {
    title: translate(handle.titleKey, me.locale),
    pages: rows.map((row) => ({
      key: row.key,
      name: translate(`admin.pages.names.${row.key}`, me.locale),
      isPlaceholder: row.isPlaceholder,
      // A page still holding the seed was never edited: no date to show.
      edited: row.isPlaceholder && !row.updatedByName ? null : { when: formatLogTime(row.updatedAt, me.locale), name: row.updatedByName },
    })),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

export default function AdminPages({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl">
      <h1>{loaderData.title}</h1>
      <p className="mt-1 max-w-measure">{t("admin.pages.intro")}</p>
      <ul aria-label={t("admin.pages.listLabel")} className="mt-4 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
        {loaderData.pages.map((page) => (
          <li key={page.key}>
            <Link to={`/admin/pages/${page.key}`} prefetch="intent" className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{page.name}</span>
                  {page.isPlaceholder && <span className="rounded-sm border border-input px-1.5 text-sm font-semibold">{t("admin.pages.sample")}</span>}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {page.edited ? (page.edited.name ? t("admin.pages.edited", page.edited as { when: string; name: string }) : t("admin.pages.editedNoName", { when: page.edited.when })) : t("admin.pages.neverEdited")}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
