// Admin authentication and the `requireAdmin` guard (architecture "Auth", FR-039..041).
// `requireAdmin` runs at the top of EVERY admin loader and action, never in a layout
// alone: valid claims -> admin row -> active -> session age <= 30 days from the amr
// sign-in time; `{ role: "owner" }` for Owner-only modules (S-022, admin-policy.server.ts).
import { type RouterContextProvider, redirect } from "react-router";
import { readCookie } from "~/lib/cookies";
import type { Locale } from "~/lib/locale";
import { LOCALE_COOKIE } from "~/lib/locale-detect";
import { actionError } from "~/server/action-result.server";
import { type AuthGateway, authContext } from "~/server/auth-gateway.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { assertSameOrigin } from "~/server/origin.server";
import { type AdminRecord, findAdminById, recordSignIn } from "~/server/repos/admins.server";

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const ADMIN_HOME = "/admin";
export const LOGIN_PATH = "/admin/login";

export type AdminUser = Omit<AdminRecord, "active" | "sessionsRevokedAt">;

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
  /**
   * An admin whose session must end now: deactivated, signed in before their sessions were
   * revoked (S-032 deactivation; kept after reactivation), or older than 30 days.
   */
  | { status: "ended"; reason: "inactive" | "revoked" | "expired" };

const sessions = new WeakMap<AuthGateway, Promise<AdminSession>>();

async function readSession(args: GuardArgs, gateway: AuthGateway): Promise<AdminSession> {
  const claims = await gateway.claims();
  // A recovery link's session only opens /admin/reset (S-026): until a password is chosen it
  // is not an admin session, so a forwarded or leaked link cannot browse the admin app.
  if (!claims || claims.recoveredAt) return { status: "anonymous" };
  const record = await findAdminById(args.context.get(requestDbContext).db, claims.userId);
  if (!record) return { status: "not_admin" };
  if (!record.active) return { status: "ended", reason: "inactive" };
  // `amr` holds whole seconds: a sign-in in the same second as the revocation is refused too.
  if (record.sessionsRevokedAt && claims.signedInAt.getTime() <= record.sessionsRevokedAt.getTime()) return { status: "ended", reason: "revoked" };
  const age = args.context.get(clockContext).now().getTime() - claims.signedInAt.getTime();
  if (age > SESSION_MAX_AGE_MS) return { status: "ended", reason: "expired" };
  return { status: "admin", admin: adminUser(record) };
}

function adminUser(record: AdminRecord): AdminUser {
  const { active: _active, sessionsRevokedAt: _revoked, ...admin } = record;
  return admin;
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

const isMutation = (request: Request) => !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());

/** The visitor's language when there is no admin to ask (remembered cookie, else the browser's). */
function visitorLocale(request: Request): Locale {
  return adminLocale({ cookie: readCookie(request, LOCALE_COOKIE), acceptLanguage: request.headers.get("accept-language") });
}

/**
 * A deactivated or revoked admin is signed out of every device with their own token (Auth
 * scope `global`, S-032); an expired session only on this device. A failed global sign-out
 * is logged without personal data: the admin row already refuses every request.
 */
async function endSession(gateway: AuthGateway, reason: "inactive" | "revoked" | "expired"): Promise<void> {
  if (reason === "expired") return gateway.signOut();
  if (!(await gateway.signOutEverywhere())) console.error(JSON.stringify({ level: "error", event: "sign_out_everywhere_failed", reason }));
}

/**
 * The guard. Returns the active admin, or throws: 403 for a cross-site mutation; 403
 * FORBIDDEN for an Admin when `{ role: "owner" }` is asked (FR-041: the page's
 * ErrorBoundary shows the "Owner only" state, an action gets the envelope); 403
 * FORBIDDEN (envelope, no admin data) when a signed-in customer posts an admin action
 * (FR-039, S-021 AC3); else a redirect to the login page with `next` (empty body). An
 * ended admin session is signed out; a customer's session is left as it is.
 */
export async function requireAdmin(args: GuardArgs, options: { role?: "owner" } = {}): Promise<AdminUser> {
  assertSameOrigin(args.request);
  const session = await adminSession(args);
  if (session.status === "admin") {
    // Role comes from the admin row read for this request, so a role change applies at once (S-022 AC5).
    if (options.role === "owner" && session.admin.role !== "owner") throw actionError("FORBIDDEN", session.admin.locale);
    return session.admin;
  }
  if (session.status === "not_admin" && isMutation(args.request)) throw actionError("FORBIDDEN", visitorLocale(args.request));
  const gateway = args.context.get(authContext);
  if (session.status === "ended") {
    await endSession(gateway, session.reason);
    // An ended session's action (a fetcher in a tab left open) gets 401 and no data (S-032 AC2).
    if (isMutation(args.request)) throw actionError("UNAUTHENTICATED", visitorLocale(args.request), withCookies(gateway));
  }
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
  return { ok: true, admin: adminUser(record), headers: withCookies(gateway).headers };
}

/** A recovery session lets the admin choose a password for this long after the link was used (S-026). */
export const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

/**
 * The request's session when it comes from a recovery link used within the last hour
 * (S-026 AC4): `null` when there is no session, it is an ordinary sign-in, or it is too old.
 */
export async function recoverySession(args: GuardArgs): Promise<{ userId: string } | null> {
  const claims = await args.context.get(authContext).claims();
  if (!claims?.recoveredAt) return null;
  const age = args.context.get(clockContext).now().getTime() - claims.recoveredAt.getTime();
  return age >= 0 && age <= RECOVERY_WINDOW_MS ? { userId: claims.userId } : null;
}

/** The language of the admin UI: the signed-in admin's, else the visitor's remembered or browser language. */
export type AdminLocaleSource = { admin?: Locale; cookie?: string; acceptLanguage?: string | null };

export function adminLocale(source: AdminLocaleSource): Locale {
  if (source.admin) return source.admin;
  if (source.cookie === "fr" || source.cookie === "en") return source.cookie;
  const first = (source.acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "fr" || first.startsWith("fr-") ? "fr" : "en";
}
