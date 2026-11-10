import { redirect } from "react-router";
import { adminMiddleware } from "~/server/admin-page.server";
import { authContext } from "~/server/auth-gateway.server";
import { LOGIN_PATH, adminSession } from "~/server/auth.server";
import { assertSameOrigin } from "~/server/origin.server";
import type { Route } from "./+types/sign-out";

export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

/** Nothing to show: a typed /admin/sign-out goes to the admin home (which guards itself). */
export function loader() {
  return redirect("/admin");
}

/**
 * `admin/sign-out`: ends this device's admin session and clears its cookies, then the
 * login page. Push subscription removal arrives with push (E-02). A customer's session
 * is never touched from the admin app.
 */
export async function action(args: Route.ActionArgs) {
  assertSameOrigin(args.request);
  const gateway = args.context.get(authContext);
  const session = await adminSession(args);
  if (session.status === "admin" || session.status === "ended") await gateway.signOut();
  const headers = new Headers();
  for (const cookie of gateway.takeSetCookies()) headers.append("Set-Cookie", cookie);
  return redirect(LOGIN_PATH, { headers });
}
