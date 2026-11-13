// GET /auth/confirm?token_hash&type&next (S-026, E-11 S-206/S-208/S-209/S-216; contracts.md
// `auth/confirm`). The emailed link lands here: the token is verified with Supabase Auth, the
// session cookies are set and the browser moves on to a fixed or same-site page. Nothing about
// the account is shown here.
//
// Customer links (signup, magiclink, recovery to /account/reset) prove the address, so this is
// the ONLY place a customer row gets its `auth_user_id` and earlier guest orders become visible
// (S-216 AC2, threat-model G-01/G-02). An admin's address never becomes a customer (AC9).
import { redirect } from "react-router";
import { type Locale, localeFromPathname, localePath } from "~/lib/locale";
import { type EmailLinkType, authContext } from "~/server/auth-gateway.server";
import { SIGNED_IN_HINT_SET, safeCustomerNext } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { linkConfirmedAccount } from "~/server/repos/customer-accounts.server";
import { recordUsage } from "~/server/usage.server";
import type { Route } from "./+types/confirm";

const TOKEN_HASH = /^[A-Za-z0-9_-]{1,256}$/;

/** Pages a recovery link may continue to; anything else (an absolute URL…) is ignored (AC6). */
const RECOVERY_NEXT = ["/admin/reset", "/account/reset", "/fr/account/reset"] as const;
const RECOVERY_FALLBACK = "/admin/reset";

export function recoveryNext(next: string | null): string {
  return (RECOVERY_NEXT as readonly (string | null)[]).includes(next) ? (next as string) : RECOVERY_FALLBACK;
}

/** The token is in the URL: never cache this answer, never send it on as a Referer. */
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

type Args = Route.LoaderArgs;

function go(args: Args, to: string, extra: string[] = []): never {
  const headers = new Headers(HEADERS);
  for (const cookie of args.context.get(authContext).takeSetCookies()) headers.append("Set-Cookie", cookie);
  for (const cookie of extra) headers.append("Set-Cookie", cookie);
  throw redirect(to, { headers });
}

/** Expired, used or refused link: the sign-in page explains and offers a new link (S-208 AC4). */
const expiredPage = (locale: Locale) => `${localePath(locale, "/account/sign-in")}?link=expired`;

/** Admin recovery (S-026): unchanged; an expired link sets nothing and the reset page says so. */
async function adminRecovery(args: Args, tokenHash: string): Promise<never> {
  if (TOKEN_HASH.test(tokenHash)) await args.context.get(authContext).verifyRecovery(tokenHash);
  return go(args, RECOVERY_FALLBACK);
}

async function customerLink(args: Args, tokenHash: string, type: EmailLinkType, next: string | null): Promise<never> {
  const locale = localeFromPathname(next ?? "/");
  const gateway = args.context.get(authContext);
  const user = TOKEN_HASH.test(tokenHash) ? await gateway.verifyEmailLink(tokenHash, type) : null;
  if (!user) return go(args, type === "recovery" ? `${localePath(locale, "/account/reset")}?expired=1` : expiredPage(locale));
  const linked = await linkConfirmedAccount(args.context.get(requestDbContext).db, user);
  if (!linked.ok) {
    // An admin's address (or a row held by another user): no customer session is left behind.
    await gateway.signOut();
    return go(args, expiredPage(locale));
  }
  if (!linked.alreadyLinked) await recordUsage(args, "account_created", { method: type === "signup" ? "signup" : "link", linkedOrders: linked.linkedOrders });
  if (type === "recovery") return go(args, localePath(locale, "/account/reset"), [SIGNED_IN_HINT_SET]);
  await recordUsage(args, "sign_in", { method: "magic_link" });
  if (type === "signup") {
    // First confirmation: choose a password (skippable; a sign-in link still works), then My orders (S-206 AC2).
    const after = safeCustomerNext(next, locale);
    const then = after === localePath(locale, "/account") ? localePath(locale, "/account/orders") : after;
    return go(args, `${localePath(locale, "/account/reset")}?mode=new&next=${encodeURIComponent(then)}`, [SIGNED_IN_HINT_SET]);
  }
  return go(args, safeCustomerNext(next, locale), [SIGNED_IN_HINT_SET]);
}

export async function loader(args: Args) {
  const url = new URL(args.request.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");
  if (type === "recovery") {
    const target = recoveryNext(next);
    return target === RECOVERY_FALLBACK ? adminRecovery(args, tokenHash) : customerLink(args, tokenHash, "recovery", target);
  }
  if (type === "signup" || type === "magiclink") return customerLink(args, tokenHash, type, next);
  return go(args, expiredPage(localeFromPathname(next ?? "/")));
}
