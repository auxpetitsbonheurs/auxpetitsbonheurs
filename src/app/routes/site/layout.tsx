import { Outlet } from "react-router";
import { SiteFooter } from "~/components/shell/site-footer";
import { SiteHeader } from "~/components/shell/site-header";
import { SkipLink } from "~/components/shell/skip-link";
import { todayMU } from "~/domain/time";
import { readBasketCount } from "~/server/basket-count.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { getFooterContacts } from "~/server/repos/settings.server";
import type { Route } from "./+types/layout";

/** Customer page frame (S-007): skip link, header, one main landmark, footer. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const contacts = await getFooterContacts(context.get(requestDbContext).db);
  return {
    basketCount: readBasketCount(request),
    contacts,
    year: todayMU(context.get(clockContext).now()).slice(0, 4),
  };
}

export default function SiteLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <SiteHeader basketCount={loaderData.basketCount} />
      {/* tabIndex lets the skip link move focus here in every browser; not a control, so no ring. */}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 py-8 outline-none md:px-6">
        <Outlet />
      </main>
      <SiteFooter contacts={loaderData.contacts} year={loaderData.year} />
    </div>
  );
}
