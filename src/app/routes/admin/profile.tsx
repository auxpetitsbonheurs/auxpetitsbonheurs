import { AdminErrorBoundary, NotAvailableYet } from "~/components/admin/admin-states";
import { placeholderAction, placeholderLoader } from "~/server/admin-placeholder.server";
import type { Route } from "./+types/profile";

/** `admin/profile` (admin): placeholder until the My profile (S-036) (S-033 AC7). */
export const handle = { titleKey: "admin.nav.profile" };

export const loader = (args: Route.LoaderArgs) => placeholderLoader(args, handle.titleKey);
export const action = (args: Route.ActionArgs) => placeholderAction(args);

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

export default function AdminProfile({ loaderData }: Route.ComponentProps) {
  return <NotAvailableYet title={loaderData.title} />;
}
