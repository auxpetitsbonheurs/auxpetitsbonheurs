// `account/sign-out` (S-207 AC6): POST only, ends this device's session and goes home. A GET
// (a typed URL, a prefetch) signs nobody out and returns to the account page.
import { redirect } from "react-router";
import { localePath } from "~/lib/locale";
import { pageLocale, signOutCustomer } from "~/server/customer-auth.server";
import { assertSameOrigin } from "~/server/origin.server";
import type { Route } from "./+types/sign-out";

export function loader(args: Route.LoaderArgs) {
  throw redirect(localePath(pageLocale(args), "/account"));
}

export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const headers = await signOutCustomer(args);
  return redirect(localePath(pageLocale(args), "/"), { headers });
}
