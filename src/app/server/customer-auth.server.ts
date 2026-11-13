// Customer sessions (E-11, contracts.md "Auth column" `customer`). `requireCustomer` runs at the
// top of EVERY customer-account loader and action (never a layout alone): verified claims ->
// the customer row linked to that Auth user (`customer.auth_user_id`). An admin, a signed-in
// user with no linked row, or nobody is not a customer: pages redirect to sign-in with `next`,
// actions get the 401 envelope and no data (FR-039 the other way round, S-207 AC5..AC8).
import { redirect } from "react-router";
import { readCookie } from "~/lib/cookies";
import { type Locale, localeFromPathname, localePath } from "~/lib/locale";
import { actionError } from "~/server/action-result.server";
import { type AuthGateway, authContext } from "~/server/auth-gateway.server";
import type { GuardArgs } from "~/server/auth.server";
import { requestDbContext } from "~/server/db.server";
import { assertSameOrigin } from "~/server/origin.server";
import { type CustomerAccount, findAccountByAuthUser } from "~/server/repos/customer-accounts.server";
import { findAdminById } from "~/server/repos/admins.server";

export type { CustomerAccount } from "~/server/repos/customer-accounts.server";

/**
 * Display hint only (never authorisation): "this browser has a customer session", so the
 * frame can show Account instead of Sign in without verifying a token on every page view
 * (browsing pages stay free of auth work, NFR-001). HttpOnly; cleared on sign-out and
 * whenever a customer page finds no session.
 */
export const SIGNED_IN_HINT = "apb_customer";
const HINT_ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";
export const SIGNED_IN_HINT_SET = `${SIGNED_IN_HINT}=1; ${HINT_ATTRIBUTES}; Max-Age=2592000`;
export const SIGNED_IN_HINT_CLEAR = `${SIGNED_IN_HINT}=; ${HINT_ATTRIBUTES}; Max-Age=0`;

export function hasSignedInHint(request: Request): boolean {
  return readCookie(request, SIGNED_IN_HINT) === "1";
}

export type CustomerSession =
  | { status: "customer"; customer: CustomerAccount }
  | { status: "anonymous" }
  /** Signed in as an admin, or as an Auth user with no linked customer row: never a customer. */
  | { status: "not_customer"; admin: boolean };

const sessions = new WeakMap<AuthGateway, Promise<CustomerSession>>();

async function readSession(args: GuardArgs, gateway: AuthGateway): Promise<CustomerSession> {
  const claims = await gateway.claims();
  if (!claims) return { status: "anonymous" };
  const db = args.context.get(requestDbContext).db;
  const account = await findAccountByAuthUser(db, claims.userId);
  if (account) return { status: "customer", customer: { ...account, authEmail: claims.email ?? account.email ?? "" } };
  return { status: "not_customer", admin: (await findAdminById(db, claims.userId)) !== null };
}

/** The request's customer session, read once per request. */
export function customerSession(args: GuardArgs): Promise<CustomerSession> {
  const gateway = args.context.get(authContext);
  let session = sessions.get(gateway);
  if (!session) {
    session = readSession(args, gateway);
    sessions.set(gateway, session);
  }
  return session;
}

/** Forget the memoised session (after a sign-in or sign-out in the same request). */
export function forgetCustomerSession(args: GuardArgs): void {
  sessions.delete(args.context.get(authContext));
}

const isMutation = (request: Request) => !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());

/** The customer pages' language comes from the URL (`/fr/...`). */
export function pageLocale(args: GuardArgs): Locale {
  return localeFromPathname(args.url.pathname);
}

/** `/account/sign-in?next=<this page>` in the page's language. */
export function customerSignInPath(url: URL): string {
  const locale = localeFromPathname(url.pathname);
  return `${localePath(locale, "/account/sign-in")}?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`;
}

/** Set-Cookie headers: the gateway's pending ones, plus clearing a stale signed-in hint. */
export function sessionHeaders(args: GuardArgs, extra: string[] = []): Headers {
  const headers = new Headers();
  for (const cookie of args.context.get(authContext).takeSetCookies()) headers.append("Set-Cookie", cookie);
  for (const cookie of extra) headers.append("Set-Cookie", cookie);
  return headers;
}

/**
 * The guard. Returns the signed-in customer, or throws: 403 for a cross-site mutation; for an
 * action, 403 FORBIDDEN (an admin session) or 401 UNAUTHENTICATED (anyone else), no data; for
 * a page, a redirect to the customer sign-in with `next` (an admin's session is left intact).
 */
export async function requireCustomer(args: GuardArgs): Promise<CustomerAccount> {
  assertSameOrigin(args.request);
  const session = await customerSession(args);
  if (session.status === "customer") return session.customer;
  const clearHint = hasSignedInHint(args.request) ? [SIGNED_IN_HINT_CLEAR] : [];
  const headers = sessionHeaders(args, clearHint);
  if (isMutation(args.request)) {
    const code = session.status === "not_customer" && session.admin ? "FORBIDDEN" : "UNAUTHENTICATED";
    throw actionError(code, pageLocale(args), { headers });
  }
  throw redirect(customerSignInPath(args.url), { headers });
}

/** The account home in `locale`. */
export const accountHome = (locale: Locale) => localePath(locale, "/account");

/**
 * `next` after a customer sign-in or emailed link (S-207 AC4, S-262 AC1): a path on this site
 * only (one leading "/", no backslash, no control character, no encoded one) and never the
 * admin app; anything else falls back to the account home.
 */
export function safeCustomerNext(next: unknown, locale: Locale): string {
  const fallback = accountHome(locale);
  if (typeof next !== "string" || next.length > 512 || !next.startsWith("/") || next.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused here
  if (/[\\\u0000-\u001f\u007f]|%(?:[01][0-9a-f]|7f|5c|2f)/i.test(next)) return fallback;
  const path = next.replace(/^\/fr(?=\/|$)/, "") || "/";
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin?") || path.startsWith("/auth/")) return fallback;
  return next;
}

/**
 * Password sign-in at the customer page (S-207). Any refusal (wrong password, unknown or
 * unconfirmed email, an admin's account: AC8) is the same `{ ok: false }` and leaves no new
 * session behind (NFR-003).
 */
export async function signInCustomer(
  args: GuardArgs,
  credentials: { email: string; password: string },
): Promise<{ ok: true; customer: CustomerAccount; headers: Headers } | { ok: false }> {
  const gateway = args.context.get(authContext);
  const signedIn = await gateway.signInWithPassword(credentials);
  if (!signedIn) return { ok: false };
  const account = await findAccountByAuthUser(args.context.get(requestDbContext).db, signedIn.userId);
  if (!account) {
    await gateway.signOut();
    // The new session never reached the browser: drop its cookies so an existing one stays as it was.
    gateway.takeSetCookies();
    return { ok: false };
  }
  forgetCustomerSession(args);
  return { ok: true, customer: { ...account, authEmail: credentials.email }, headers: sessionHeaders(args, [SIGNED_IN_HINT_SET]) };
}

/** Ends this device's customer session (S-207 AC6) and clears the hint. */
export async function signOutCustomer(args: GuardArgs): Promise<Headers> {
  await args.context.get(authContext).signOut();
  forgetCustomerSession(args);
  return sessionHeaders(args, [SIGNED_IN_HINT_CLEAR]);
}

export { isMutation };
