// Lines left out of a placed order (UX audit H1, checkout spec AC41, contracts.md v0.19).
// After a successful `placeOrder` the basket action sets `apb_left_out` with the product ids
// it left out (sold out, hidden, deleted). The cookie is scoped to that order's path
// (/order/:token, so the confirmation page and its `.data` request both get it), lives 15
// minutes (a refresh still shows the note), is HttpOnly and holds no personal data; nothing
// goes in the URL. The confirmation loader reads it back as untrusted input.
import { readCookie } from "~/lib/cookies";

export const LEFT_OUT_COOKIE = "apb_left_out";
const MAX_AGE_SECONDS = 15 * 60;
const MAX_IDS = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Set-Cookie value for `productIds`, sent only to `path` (the order's /order/:token prefix). */
export function leftOutCookie(productIds: readonly string[], path: string): string {
  return `${LEFT_OUT_COOKIE}=${productIds.join(".")}; Max-Age=${MAX_AGE_SECONDS}; Path=${path}; HttpOnly; SameSite=Lax; Secure`;
}

/** The product ids named by the cookie: valid UUIDs only, unique, at most 10. */
export function readLeftOut(request: Request): string[] {
  const raw = readCookie(request, LEFT_OUT_COOKIE) ?? "";
  const ids = raw.split(".").filter((id) => UUID.test(id));
  return [...new Set(ids)].slice(0, MAX_IDS);
}
