// S-228 AC7 (NFR-003): every Worker response carries the baseline security headers; HTML pages
// also carry a nonce-based Content-Security-Policy that still lets the deferred-hydration loader,
// Turnstile, Supabase photos and uploads, and the self-hosted fonts work.
import { describe, expect, test } from "vitest";
import { contentSecurityPolicy, newCspNonce, withSecurityHeaders } from "./security-headers";

const SUPABASE = "https://abcd.supabase.co";
const html = () => new Response("<h1>Hi</h1>", { headers: { "Content-Type": "text/html" } });

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0])
      .map(([name, ...values]) => [name!, values]),
  );
}

describe("newCspNonce", () => {
  test("is 128 random bits, base64, different every time", () => {
    const a = newCspNonce();
    const b = newCspNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});

describe("contentSecurityPolicy", () => {
  const policy = directives(contentSecurityPolicy({ nonce: "abc123", supabaseUrl: `${SUPABASE}/`, https: true }));

  test("scripts: self, this response's nonce, WebAssembly for HEIC photos and Turnstile; never unsafe-inline or unsafe-eval", () => {
    const script = policy.get("script-src")!;
    expect(script).toEqual(expect.arrayContaining(["'self'", "'nonce-abc123'", "'wasm-unsafe-eval'", "https://challenges.cloudflare.com"]));
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("'strict-dynamic'");
  });

  test("photos and uploads may reach the Supabase project origin only", () => {
    expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:", SUPABASE]);
    expect(policy.get("connect-src")).toEqual(["'self'", SUPABASE]);
  });

  test("Turnstile's frame, self-hosted fonts, blob workers for photo conversion", () => {
    expect(policy.get("frame-src")).toEqual(["https://challenges.cloudflare.com"]);
    expect(policy.get("font-src")).toEqual(["'self'"]);
    expect(policy.get("worker-src")).toEqual(["'self'", "blob:"]);
  });

  test("locks down plugins, base, form targets and framing", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
  });

  test("a local http site (e2e) is not upgraded to https", () => {
    const local = directives(contentSecurityPolicy({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321", https: false }));
    expect(local.has("upgrade-insecure-requests")).toBe(false);
    expect(local.get("img-src")).toContain("http://127.0.0.1:54321");
  });
});

describe("withSecurityHeaders", () => {
  const options = { nonce: "abc123", supabaseUrl: SUPABASE, url: "https://auxpetitsbonheurs.mu/" };

  test("HTML pages get the CSP with their nonce and the baseline headers", () => {
    const response = withSecurityHeaders(html(), options);
    expect(response.headers.get("Content-Security-Policy")).toContain("'nonce-abc123'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  test("JSON, redirects and other non-HTML get the baseline headers but no CSP", () => {
    const json = withSecurityHeaders(Response.json({ ok: true }), options);
    expect(json.headers.get("Content-Security-Policy")).toBeNull();
    expect(json.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const redirect = withSecurityHeaders(Response.redirect("https://auxpetitsbonheurs.mu/fr", 302), options);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe("https://auxpetitsbonheurs.mu/fr");
    expect(redirect.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("a stricter Referrer-Policy set by a token page (no-referrer, G-07) is kept", () => {
    const own = new Response("x", { headers: { "Content-Type": "text/html", "Referrer-Policy": "no-referrer" } });
    expect(withSecurityHeaders(own, options).headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("plain http (local e2e) gets no HSTS and no upgrade", () => {
    const response = withSecurityHeaders(html(), { ...options, url: "http://localhost:4173/" });
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).not.toContain("upgrade-insecure-requests");
  });

  test("the Vite dev server (csp: false) keeps the baseline headers but gets no CSP", () => {
    const response = withSecurityHeaders(html(), { ...options, csp: false });
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("without a nonce (no page render) HTML still gets a CSP that allows no inline script", () => {
    const response = withSecurityHeaders(html(), { ...options, nonce: null });
    const script = directives(response.headers.get("Content-Security-Policy")!).get("script-src")!;
    expect(script.some((value) => value.startsWith("'nonce-"))).toBe(false);
    expect(script).not.toContain("'unsafe-inline'");
  });
});
