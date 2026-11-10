// Supabase Auth behind the AuthGateway seam (architecture "Auth"): @supabase/ssr with
// cookies read from the request and written back through `takeSetCookies`. Claims are
// verified locally with the project's JWKS (cached per isolate), not with a call per request.
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { AuthClaims, AuthGateway } from "./auth-gateway.server";

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
  timestamp?: unknown;
}

/** The latest authentication time in `amr` (seconds), as a Date; undefined when absent. */
export function signInTime(amr: unknown): Date | undefined {
  if (!Array.isArray(amr)) return undefined;
  const stamps = (amr as AmrEntry[]).map((entry) => entry?.timestamp).filter((t): t is number => typeof t === "number");
  return stamps.length === 0 ? undefined : new Date(Math.max(...stamps) * 1000);
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
    return typeof data.claims.sub === "string" && signedInAt ? { userId: data.claims.sub, signedInAt } : null;
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
    takeSetCookies() {
      return pending.splice(0, pending.length);
    },
  };
}
