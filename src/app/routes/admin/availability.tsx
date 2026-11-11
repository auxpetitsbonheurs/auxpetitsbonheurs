import { AdminErrorBoundary, NotAvailableYet } from "~/components/admin/admin-states";
import { placeholderAction, placeholderLoader } from "~/server/admin-placeholder.server";
import type { Route } from "./+types/availability";

/** `admin/availability` (**owner**): placeholder until the Availability screen (S-056); the Owner-only guard is final (S-022). */
export const handle = { titleKey: "admin.nav.availability" };

export const loader = (args: Route.LoaderArgs) => placeholderLoader(args, handle.titleKey, "owner");
export const action = (args: Route.ActionArgs) => placeholderAction(args, "owner");

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

export default function AdminAvailability({ loaderData }: Route.ComponentProps) {
  return <NotAvailableYet title={loaderData.title} />;
}
