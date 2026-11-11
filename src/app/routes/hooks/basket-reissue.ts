// POST /api/basket/reissue (ADR-0004, one-off migration): a basket cookie written before
// ADR-0004 is HttpOnly, so the browser store can neither read nor replace it. The store
// calls this once when the server counted items it cannot see; the answer re-sets the same
// lines without HttpOnly. Rewrites only the caller's own cookie, so it needs no CSRF check.
import { basketCookie, readBasket } from "~/server/basket.server";
import type { Route } from "./+types/basket-reissue";

export function action({ request }: Route.ActionArgs) {
  const lines = readBasket(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (lines.length > 0) headers.set("Set-Cookie", basketCookie(lines));
  return new Response(null, { status: 204, headers });
}
