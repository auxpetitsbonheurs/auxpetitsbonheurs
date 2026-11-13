// Security headers on every Worker response (S-228 AC7, NFR-003). Static assets are served by
// Cloudflare before the Worker; public/_headers gives them `nosniff`.
//
// HTML pages get a Content-Security-Policy with a per-response nonce: React Router's inline
// scripts, React's own and the deferred-hydration loader (lib/defer-hydration.ts) carry it, and
// the loader passes it on to the module script it starts. No 'strict-dynamic': the modulepreload
// links and module imports are same-origin and rely on 'self'.
//   - 'wasm-unsafe-eval' + blob: workers: HEIC photo conversion (heic-to/csp) in the browser.
//   - challenges.cloudflare.com: Turnstile's script and frame on public forms.
//   - The Supabase project origin: public photos (img) and signed uploads (connect).
//   - style-src 'unsafe-inline': React style attributes (accepted low risk, see the audit).

const TURNSTILE = "https://challenges.cloudflare.com";

/** 128 random bits, base64 (CSP nonce). */
export function newCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export interface CspOptions {
  nonce: string | null;
  supabaseUrl: string;
  /** The site is served over https (deployed): ask the browser to upgrade any http subresource. */
  https: boolean;
}

export function contentSecurityPolicy({ nonce, supabaseUrl, https }: CspOptions): string {
  const supabase = new URL(supabaseUrl).origin;
  const script = ["'self'", ...(nonce ? [`'nonce-${nonce}'`] : []), "'wasm-unsafe-eval'", TURNSTILE];
  const directives = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase}`,
    `frame-src ${TURNSTILE}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export interface SecurityHeaderOptions {
  nonce: string | null;
  supabaseUrl: string;
  /** The request URL: https decides HSTS and the upgrade directive. */
  url: string;
  /** False on the Vite dev server only (its own inline scripts and websocket). Default true. */
  csp?: boolean;
}

const BASELINE: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function withSecurityHeaders(response: Response, { nonce, supabaseUrl, url, csp = true }: SecurityHeaderOptions): Response {
  // Copy first: redirects and fetched responses have immutable headers.
  const copy = new Response(response.body, response);
  const https = new URL(url).protocol === "https:";
  for (const [name, value] of Object.entries(BASELINE)) copy.headers.set(name, value);
  // A token page's stricter `no-referrer` (G-07) wins.
  if (!copy.headers.has("Referrer-Policy")) copy.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (https) copy.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (csp && (copy.headers.get("Content-Type") ?? "").startsWith("text/html")) {
    copy.headers.set("Content-Security-Policy", contentSecurityPolicy({ nonce, supabaseUrl, https }));
  }
  return copy;
}
