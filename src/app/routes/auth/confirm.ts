// GET /auth/confirm?token_hash&type&next (S-026; contracts.md `auth/confirm`). The emailed
// link lands here: the token is verified with Supabase Auth, the session cookies are set and
// the browser moves on to a fixed page. This story builds `type=recovery` only (E-11 adds
// signup, magiclink and email_change). Nothing about the account is shown here.
import { redirect } from "react-router";
import { authContext } from "~/server/auth-gateway.server";
import type { Route } from "./+types/confirm";

const TOKEN_HASH = /^[A-Za-z0-9_-]{1,256}$/;

/** Pages a recovery link may continue to; anything else (an absolute URL…) is ignored (AC6). */
const RECOVERY_NEXT = ["/admin/reset"] as const;
const RECOVERY_FALLBACK = "/admin/reset";

export function recoveryNext(next: string | null): string {
  return (RECOVERY_NEXT as readonly (string | null)[]).includes(next) ? (next as string) : RECOVERY_FALLBACK;
}

/** The token is in the URL: never cache this answer, never send it on as a Referer. */
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  if (url.searchParams.get("type") !== "recovery") throw redirect("/admin/login", { headers: HEADERS });
  const next = recoveryNext(url.searchParams.get("next"));
  const gateway = context.get(authContext);
  // An expired or used link sets nothing: the reset page then shows "This link has expired" (AC4).
  if (TOKEN_HASH.test(tokenHash)) await gateway.verifyRecovery(tokenHash);
  const headers = new Headers(HEADERS);
  for (const cookie of gateway.takeSetCookies()) headers.append("Set-Cookie", cookie);
  throw redirect(next, { headers });
}
