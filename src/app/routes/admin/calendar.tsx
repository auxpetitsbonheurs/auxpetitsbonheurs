import { AdminErrorBoundary, NotAvailableYet } from "~/components/admin/admin-states";
import { placeholderAction, placeholderLoader } from "~/server/admin-placeholder.server";
import type { Route } from "./+types/calendar";

/** `admin/calendar` (admin): placeholder until the Calendar screen (E-07) (S-033 AC7). */
export const handle = { titleKey: "admin.nav.calendar" };

export const loader = (args: Route.LoaderArgs) => placeholderLoader(args, handle.titleKey);
export const action = (args: Route.ActionArgs) => placeholderAction(args);

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

export default function AdminCalendar({ loaderData }: Route.ComponentProps) {
  return <NotAvailableYet title={loaderData.title} />;
}
