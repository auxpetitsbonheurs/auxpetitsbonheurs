// Cloudflare Turnstile, server side (NFR-003; S-162). The public forms send the widget's
// token; the server asks Cloudflare's siteverify endpoint whether it is real. The secret is
// read only from validated env (TURNSTILE_SECRET_KEY) and never logged. Without the keys
// (an optional integration, ADR-0002 amendment) the check is skipped with a warning: the
// integration list says "public forms have no bot protection" until the Owner adds them.
import { createContext } from "react-router";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TIMEOUT_MS = 3000;

export type TurnstileVerdict = "ok" | "failed";

export interface TurnstileCheck {
  /** Public site key the page renders the widget with; null = not configured (no widget, no check). */
  siteKey: string | null;
  /** Verifies a token for the visitor's IP; "ok" without a configured secret. */
  verify(token: string | undefined, ip: string): Promise<TurnstileVerdict>;
}

/** Bot check that always passes: tests and environments without Turnstile keys. */
export const NO_TURNSTILE: TurnstileCheck = { siteKey: null, verify: async () => "ok" };

export const turnstileContext = createContext<TurnstileCheck>(NO_TURNSTILE);

interface SiteverifyBody {
  success?: unknown;
}

/**
 * The real check. A missing token, a Cloudflare "no" or an unreachable Cloudflare all fail
 * closed (BOT_CHECK_FAILED): the customer keeps the form and can try again or use WhatsApp.
 */
export function cloudflareTurnstile(options: { siteKey: string; secret: string; fetch?: typeof fetch }): TurnstileCheck {
  const send = options.fetch ?? fetch;
  return {
    siteKey: options.siteKey,
    async verify(token, ip) {
      if (!token) return "failed";
      const body = new URLSearchParams({ secret: options.secret, response: token });
      if (ip !== "unknown") body.set("remoteip", ip);
      try {
        const response = await send(TURNSTILE_VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS) });
        const result = (await response.json().catch(() => null)) as SiteverifyBody | null;
        return response.ok && result?.success === true ? "ok" : "failed";
      } catch {
        console.log(JSON.stringify({ level: "warn", event: "turnstile_unreachable" }));
        return "failed";
      }
    },
  };
}

/** The request's check from the env: real when both keys are set, else the skipping one (logged once per call site). */
export function turnstileFromEnv(env: { TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string }, send?: typeof fetch): TurnstileCheck {
  if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) return cloudflareTurnstile({ siteKey: env.TURNSTILE_SITE_KEY, secret: env.TURNSTILE_SECRET_KEY, fetch: send });
  return NO_TURNSTILE;
}
