import { Outlet, useMatches } from "react-router";
import { AdminHeader } from "~/components/admin/admin-header";
import { AdminBottomBar } from "~/components/admin/bottom-bar";
import { SkipLink } from "~/components/shell/skip-link";
import { useI18n } from "~/i18n/react";
import { adminMiddleware } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/**
 * `admin/layout` loader (contracts.md v0.14, `badges` arrives with S-034): `me`,
 * `nav.ownerItems` (More shows Availability, Settings, Team) and `vapidPublicKey` (null
 * until push, E-10). The guard here protects the frame's own data only; every child
 * loader and action calls `requireAdmin` itself (S-009 AC4).
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  return {
    me: { id: me.id, name: me.name, role: me.role, locale: me.locale },
    nav: { ownerItems: me.role === "owner" },
    vapidPublicKey: null,
  };
}

/** The deepest page's `handle.titleKey` (each admin page names itself for the header). */
function usePageTitleKey(): string | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const key = (matches[i]!.handle as { titleKey?: unknown } | undefined)?.titleKey;
    if (typeof key === "string") return key;
  }
  return undefined;
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const titleKey = usePageTitleKey();
  return (
    <div data-admin-frame="" className="flex min-h-dvh flex-col">
      <SkipLink />
      <AdminHeader me={loaderData.me} title={titleKey ? t(titleKey) : undefined} />
      {/* Before main in the DOM so the skip link jumps past it; fixed to the bottom on phones. */}
      <AdminBottomBar />
      {/* tabIndex lets the skip link move focus here; not a control, so no ring. Bottom padding keeps content above the bar. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-content flex-1 px-4 pt-6 pb-6 outline-none min-[20rem]:pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-6"
      >
        <Outlet />
      </main>
    </div>
  );
}
