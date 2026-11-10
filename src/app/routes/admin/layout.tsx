import { Outlet } from "react-router";
import { AdminHeader } from "~/components/admin/admin-header";
import { SkipLink } from "~/components/shell/skip-link";
import { adminMiddleware } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/**
 * `admin/layout` loader (minimal slice: `me`; `nav` and `vapidPublicKey` arrive with the
 * bottom bar and push in E-02). The guard here protects the shell's own data only;
 * every child loader and action calls `requireAdmin` itself (S-009 AC4).
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  return { me: { id: me.id, name: me.name, role: me.role, locale: me.locale } };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AdminHeader me={loaderData.me} />
      {/* tabIndex lets the skip link move focus here; not a control, so no ring. */}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 py-6 outline-none md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
