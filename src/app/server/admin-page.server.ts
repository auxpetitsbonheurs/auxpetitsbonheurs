// Route middleware for every /admin page and action: CSRF refusal (403) before any
// loader or action, `private, no-store` + noindex on every response, the auth cookies
// of the request written back, and the admin UI language for the root loader.
// It is a convenience, not the guard: `requireAdmin` still runs in every loader/action.
import { type MiddlewareFunction, type RouterContextProvider, createContext } from "react-router";
import { readCookie } from "~/lib/cookies";
import type { Locale } from "~/lib/locale";
import { LOCALE_COOKIE } from "~/lib/locale-detect";
import { authContext } from "~/server/auth-gateway.server";
import { adminLocale, adminSession } from "~/server/auth.server";
import { forbiddenBody, isSameOrigin } from "~/server/origin.server";

export const ADMIN_PAGE_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

/** Set for /admin requests; the root loader uses it instead of the URL's language. */
export const adminLocaleContext = createContext<Locale | null>(null);

function stamp(response: Response): Response {
  for (const [name, value] of Object.entries(ADMIN_PAGE_HEADERS)) response.headers.set(name, value);
  return response;
}

const csrf: MiddlewareFunction<Response> = async ({ request }, next) => {
  const safe = ["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  if (!safe && !isSameOrigin(request)) return stamp(Response.json(forbiddenBody(), { status: 403 }));
  return next();
};

const pageRules: MiddlewareFunction<Response> = async (args, next) => {
  const session = await adminSession(args);
  args.context.set(
    adminLocaleContext,
    adminLocale({
      admin: session.status === "admin" ? session.admin.locale : undefined,
      cookie: readCookie(args.request, LOCALE_COOKIE),
      acceptLanguage: args.request.headers.get("accept-language"),
    }),
  );
  const response = stamp(await next());
  for (const cookie of args.context.get(authContext).takeSetCookies()) response.headers.append("Set-Cookie", cookie);
  return response;
};

export const adminMiddleware: MiddlewareFunction<Response>[] = [csrf, pageRules];

/** The admin UI language for a loader or action (the middleware's choice, else computed the same way). */
export function adminPageLocale(args: { request: Request; context: Readonly<RouterContextProvider> }): Locale {
  return (
    args.context.get(adminLocaleContext) ??
    adminLocale({ cookie: readCookie(args.request, LOCALE_COOKIE), acceptLanguage: args.request.headers.get("accept-language") })
  );
}
