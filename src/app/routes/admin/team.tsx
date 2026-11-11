import { AdminErrorBoundary, NotAvailableYet } from "~/components/admin/admin-states";
import { placeholderAction, placeholderLoader } from "~/server/admin-placeholder.server";
import type { Route } from "./+types/team";

/** `admin/team` (**owner**): placeholder until the Team screen (S-027); the Owner-only guard is final (S-022). */
export const handle = { titleKey: "admin.nav.team" };

export const loader = (args: Route.LoaderArgs) => placeholderLoader(args, handle.titleKey, "owner");
export const action = (args: Route.ActionArgs) => placeholderAction(args, "owner");

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

export default function AdminTeam({ loaderData }: Route.ComponentProps) {
  return <NotAvailableYet title={loaderData.title} />;
}
