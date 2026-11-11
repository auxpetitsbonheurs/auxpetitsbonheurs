import { AdminErrorBoundary, NotAvailableYet } from "~/components/admin/admin-states";
import { placeholderAction, placeholderLoader } from "~/server/admin-placeholder.server";
import type { Route } from "./+types/menu";

/** `admin/menu` (admin): placeholder until the Menu list (S-041) (S-033 AC7). */
export const handle = { titleKey: "admin.nav.menu" };

export const loader = (args: Route.LoaderArgs) => placeholderLoader(args, handle.titleKey);
export const action = (args: Route.ActionArgs) => placeholderAction(args);

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

export default function AdminMenu({ loaderData }: Route.ComponentProps) {
  return <NotAvailableYet title={loaderData.title} />;
}
