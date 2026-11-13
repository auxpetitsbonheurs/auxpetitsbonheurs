// Supabase Auth behind the AuthGateway seam (architecture "Auth"): @supabase/ssr with
// cookies read from the request and written back through `takeSetCookies`. Claims are
// verified locally with the project's JWKS (cached per isolate), not with a call per request.
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { AuthClaims, AuthGateway, LinkUser } from "./auth-gateway.server";

/** The session cookie lives as long as the longest allowed session (FR-040). */
export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

const COOKIE_OPTIONS = { path: "/", sameSite: "lax", httpOnly: true, secure: true, maxAge: SESSION_COOKIE_MAX_AGE } as const;

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
  /** Injected by tests (fake GoTrue at the HTTP boundary). */
  fetch?: typeof globalThis.fetch;
}

interface AmrEntry {
  method?: unknown;
  timestamp?: unknown;
}

const stampsOf = (amr: unknown): { method: unknown; at: number }[] =>
  Array.isArray(amr)
    ? (amr as AmrEntry[]).flatMap((entry) => (typeof entry?.timestamp === "number" ? [{ method: entry.method, at: entry.timestamp }] : []))
    : [];

/** The latest authentication time in `amr` (seconds), as a Date; undefined when absent. */
export function signInTime(amr: unknown): Date | undefined {
  const stamps = stampsOf(amr);
  return stamps.length === 0 ? undefined : new Date(Math.max(...stamps.map((s) => s.at)) * 1000);
}

/** Auth methods a recovery link reports (`recovery`; older GoTrue versions say `otp`). */
const RECOVERY_METHODS = new Set(["recovery", "otp"]);

/** When the latest authentication was a recovery link: its time; else undefined (S-026). */
export function recoveryTime(amr: unknown): Date | undefined {
  const latest = stampsOf(amr).sort((a, b) => b.at - a.at)[0];
  return latest && RECOVERY_METHODS.has(String(latest.method)) ? new Date(latest.at * 1000) : undefined;
}

/** A client with no cookies and no stored session: recovery requests and password checks. */
function statelessClient(config: SupabaseAuthConfig) {
  return createClient(config.url, config.anonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: config.fetch ? { fetch: config.fetch } : undefined,
  });
}

export function createSupabaseAuth(config: SupabaseAuthConfig, request: Request): AuthGateway {
  const pending: string[] = [];
  let client: ReturnType<typeof createServerClient> | undefined;
  let claims: Promise<AuthClaims | null> | undefined;

  // Built on first use: requests that never touch auth create no client.
  const supabase = () =>
    (client ??= createServerClient(config.url, config.anonKey, {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll: () => parseCookieHeader(request.headers.get("cookie") ?? "").map(({ name, value }) => ({ name, value: value ?? "" })),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            // Removal keeps Max-Age=0; everything else lives 30 days and stays HttpOnly/Secure/Lax.
            const maxAge = options.maxAge === 0 ? 0 : SESSION_COOKIE_MAX_AGE;
            pending.push(serializeCookieHeader(name, value, { ...options, ...COOKIE_OPTIONS, maxAge }));
          }
        },
      },
      global: config.fetch ? { fetch: config.fetch } : undefined,
      auth: { detectSessionInUrl: false, autoRefreshToken: false },
    }));

  const hasSessionCookie = () => parseCookieHeader(request.headers.get("cookie") ?? "").some(({ name }) => /^sb-.+-auth-token/.test(name));

  async function readClaims(): Promise<AuthClaims | null> {
    if (!hasSessionCookie()) return null;
    const { data, error } = await supabase().auth.getClaims();
    if (error || !data) return null;
    const signedInAt = signInTime(data.claims.amr);
    if (typeof data.claims.sub !== "string" || !signedInAt) return null;
    const recoveredAt = recoveryTime(data.claims.amr);
    const email = typeof data.claims.email === "string" && data.claims.email !== "" ? data.claims.email.toLowerCase() : undefined;
    return { userId: data.claims.sub, signedInAt, ...(recoveredAt ? { recoveredAt } : {}), ...(email ? { email } : {}) };
  }

  return {
    async signInWithPassword({ email, password }) {
      const { data, error } = await supabase().auth.signInWithPassword({ email, password });
      if (error || !data.user) return null;
      claims = undefined;
      return { userId: data.user.id };
    },
    claims() {
      return (claims ??= readClaims());
    },
    async signOut() {
      await supabase().auth.signOut({ scope: "local" });
      claims = Promise.resolve(null);
    },
    async signOutOthers() {
      try {
        const { error } = await supabase().auth.signOut({ scope: "others" });
        return !error;
      } catch {
        return false;
      }
    },
    async signOutEverywhere() {
      const ended = await supabase()
        .auth.signOut({ scope: "global" })
        .then((result: { error: unknown }) => !result.error)
        .catch(() => false);
      // A failed global sign-out keeps the stored session: still clear this device's cookies.
      if (!ended) await supabase().auth.signOut({ scope: "local" }).catch(() => undefined);
      claims = Promise.resolve(null);
      return ended;
    },
    takeSetCookies() {
      return pending.splice(0, pending.length);
    },
    async requestRecovery(email, redirectTo) {
      const { error } = await statelessClient(config).auth.resetPasswordForEmail(email, { redirectTo });
      return !error;
    },
    async verifyRecovery(tokenHash) {
      const { data, error } = await supabase().auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
      if (error || !data.user) return null;
      claims = undefined;
      return { userId: data.user.id };
    },
    async updatePassword(password) {
      const { error } = await supabase().auth.updateUser({ password });
      if (!error) return { ok: true };
      return error.code === "weak_password" || error.code === "same_password" ? { ok: false, reason: "weak" } : { ok: false, reason: "failed" };
    },
    async signUp({ email, password, metadata, redirectTo }) {
      try {
        const { error } = await statelessClient(config).auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: metadata } });
        return !error;
      } catch {
        return false;
      }
    },
    async requestSignInLink(email, redirectTo) {
      try {
        const { error } = await statelessClient(config).auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
        return !error;
      } catch {
        return false;
      }
    },
    async verifyEmailLink(tokenHash, type): Promise<LinkUser | null> {
      const { data, error } = await supabase().auth.verifyOtp({ type, token_hash: tokenHash });
      if (error || !data.user?.email) return null;
      claims = undefined;
      return { userId: data.user.id, email: data.user.email.toLowerCase(), metadata: data.user.user_metadata ?? {} };
    },
    async checkPassword({ email, password }) {
      const checker = statelessClient(config);
      const { data, error } = await checker.auth.signInWithPassword({ email, password });
      if (error || !data.session) return false;
      // The check made a session of its own: end it so it leaves nothing behind.
      await checker.auth.signOut({ scope: "local" });
      return true;
    },
  };
}
