import { data } from "react-router";
import { NotFoundContent } from "~/components/shell/not-found-content";
import { requireAdmin } from "~/server/auth.server";
import type { Route } from "./+types/not-found";

/** Unknown /admin/* paths: signed-out visitors go to the login page like any admin page (S-009 AC4). */
export async function loader(args: Route.LoaderArgs) {
  await requireAdmin(args);
  throw data(null, { status: 404 });
}

export async function action(args: Route.ActionArgs) {
  await requireAdmin(args);
  throw data(null, { status: 404 });
}

export function ErrorBoundary() {
  return <NotFoundContent />;
}

export default function AdminNotFound() {
  return <NotFoundContent />;
}
