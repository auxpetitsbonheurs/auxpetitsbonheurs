// Admin authentication and the `requireAdmin` guard (architecture "Auth", FR-039..041).
// `requireAdmin` runs at the top of EVERY admin loader and action, never in a layout
// alone: valid claims -> admin row -> active -> session age <= 30 days from the amr
// sign-in time. Full Owner/Admin role enforcement arrives with E-02 (S-021, S-022).
import { type RouterContextProvider, redirect } from "react-router";
import type { Locale } from "~/lib/locale";
import { type AuthGateway, authContext } from "~/server/auth-gateway.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { assertSameOrigin } from "~/server/origin.server";
import { type AdminRecord, findAdminById, recordSignIn } from "~/server/repos/admins.server";

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const ADMIN_HOME = "/admin";
export const LOGIN_PATH = "/admin/login";

export type AdminUser = Omit<AdminRecord, "active">;

/** What a loader or action receives (React Router args, narrowed to what the guard reads). */
export interface GuardArgs {
  request: Request;
  url: URL;
  context: Readonly<RouterContextProvider>;
}

export type AdminSession =
  | { status: "admin"; admin: AdminUser }
  | { status: "anonymous" }
  /** Signed in, but not as an admin (a customer): left intact, never upgraded (FR-039). */
  | { status: "not_admin" }
  /** An admin whose session must end now: deactivated or older than 30 days. */
  | { status: "ended"; reason: "inactive" | "expired" };

const sessions = new WeakMap<AuthGateway, Promise<AdminSession>>();

async function readSession(args: GuardArgs, gateway: AuthGateway): Promise<AdminSession> {
  const claims = await gateway.claims();
  if (!claims) return { status: "anonymous" };
  const record = await findAdminById(args.context.get(requestDbContext).db, claims.userId);
  if (!record) return { status: "not_admin" };
  if (!record.active) return { status: "ended", reason: "inactive" };
  const age = args.context.get(clockContext).now().getTime() - claims.signedInAt.getTime();
  if (age > SESSION_MAX_AGE_MS) return { status: "ended", reason: "expired" };
  const { active: _active, ...admin } = record;
  return { status: "admin", admin };
}

/** The request's admin session, read once per request. */
export function adminSession(args: GuardArgs): Promise<AdminSession> {
  const gateway = args.context.get(authContext);
  let session = sessions.get(gateway);
  if (!session) {
    session = readSession(args, gateway);
    sessions.set(gateway, session);
  }
  return session;
}

/** `/admin/login?next=<this page>`; `url` is the normalised URL (never a `.data` path). */
export function loginRedirectPath(url: URL): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`;
}

/** Only relative admin paths are followed after sign-in (S-009 AC6, NFR-003). */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return ADMIN_HOME;
  const isAdminPath = next === ADMIN_HOME || next.startsWith(`${ADMIN_HOME}/`) || next.startsWith(`${ADMIN_HOME}?`);
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused here
  const unsafe = /[\\\u0000-\u001f\u007f]|%(?:[01][0-9a-f]|7f|5c)/i.test(next);
  return isAdminPath && !unsafe ? next : ADMIN_HOME;
}

function withCookies(gateway: AuthGateway): { headers: Headers } {
  const headers = new Headers();
  for (const cookie of gateway.takeSetCookies()) headers.append("Set-Cookie", cookie);
  return { headers };
}

/**
 * The guard. Returns the active admin, or throws: 403 for a cross-site mutation, else a
 * redirect to the login page with `next` (no admin data in the body). An ended admin
 * session is signed out; a customer's session is left as it is.
 */
export async function requireAdmin(args: GuardArgs): Promise<AdminUser> {
  assertSameOrigin(args.request);
  const session = await adminSession(args);
  if (session.status === "admin") return session.admin;
  const gateway = args.context.get(authContext);
  if (session.status === "ended") await gateway.signOut();
  throw redirect(loginRedirectPath(args.url), withCookies(gateway));
}

/**
 * Password sign-in for the admin app. Any refusal (wrong password, unknown email,
 * deactivated admin, customer-only account) is the same `{ ok: false }` and leaves no
 * session behind (NFR-003: no account enumeration).
 */
export async function signInAdmin(
  args: GuardArgs,
  credentials: { email: string; password: string },
): Promise<{ ok: true; admin: AdminUser; headers: Headers } | { ok: false }> {
  const gateway = args.context.get(authContext);
  const signedIn = await gateway.signInWithPassword(credentials);
  if (!signedIn) return { ok: false };
  const db = args.context.get(requestDbContext).db;
  const record = await findAdminById(db, signedIn.userId);
  if (!record?.active) {
    await gateway.signOut();
    // The new session never reached the browser: drop its cookies so an existing session stays as it was.
    gateway.takeSetCookies();
    return { ok: false };
  }
  sessions.delete(gateway);
  await recordSignIn(db, record.id, args.context.get(clockContext).now());
  const { active: _active, ...admin } = record;
  return { ok: true, admin, headers: withCookies(gateway).headers };
}

/** The language of the admin UI: the signed-in admin's, else the visitor's remembered or browser language. */
export type AdminLocaleSource = { admin?: Locale; cookie?: string; acceptLanguage?: string | null };

export function adminLocale(source: AdminLocaleSource): Locale {
  if (source.admin) return source.admin;
  if (source.cookie === "fr" || source.cookie === "en") return source.cookie;
  const first = (source.acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "fr" || first.startsWith("fr-") ? "fr" : "en";
}

/**
 * RL-auth placeholder (S-009 note): the sign-in rate limit (5 per 15 min per email+IP)
 * is built with the rate-limit helper in S-023 (E-02); until then this always allows,
 * and the staging site is not announced. The action already answers RATE_LIMITED (429).
 */
export function signInAllowed(): boolean {
  return true;
}
