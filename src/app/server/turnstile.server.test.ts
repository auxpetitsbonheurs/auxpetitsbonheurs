// S-162 AC1, AC6: the Turnstile check, with a stubbed siteverify (no real network call).
import { describe, expect, test, vi } from "vitest";
import { NO_TURNSTILE, TURNSTILE_VERIFY_URL, cloudflareTurnstile, turnstileFromEnv } from "./turnstile.server";

const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("cloudflareTurnstile (S-162 AC1, AC6)", () => {
  test("a token Cloudflare accepts passes; secret, token and IP are posted to siteverify", async () => {
    const send = answer({ success: true });
    const check = cloudflareTurnstile({ siteKey: "site", secret: "test-secret", fetch: send });

    expect(await check.verify("tok", "203.0.113.5")).toBe("ok");
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const posted = new URLSearchParams(init.body as URLSearchParams);
    expect(Object.fromEntries(posted)).toEqual({ secret: "test-secret", response: "tok", remoteip: "203.0.113.5" });
  });

  test("a refused token or a missing token fails; an unreachable Cloudflare is unverified (never ok)", async () => {
    expect(await cloudflareTurnstile({ siteKey: "s", secret: "x", fetch: answer({ success: false }) }).verify("tok", "1.2.3.4")).toBe("failed");
    const neverCalled = answer({ success: true });
    expect(await cloudflareTurnstile({ siteKey: "s", secret: "x", fetch: neverCalled }).verify(undefined, "1.2.3.4")).toBe("failed");
    expect(neverCalled).not.toHaveBeenCalled();
    const down = vi.fn(async () => {
      throw new TypeError("network");
    });
    expect(await cloudflareTurnstile({ siteKey: "s", secret: "x", fetch: down }).verify("tok", "1.2.3.4")).toBe("unverified");
  });

  test("S-091 AC8: an expired or already used token is unverified, a forged one failed", async () => {
    const stale = answer({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await cloudflareTurnstile({ siteKey: "s", secret: "x", fetch: stale }).verify("tok", "1.2.3.4")).toBe("unverified");
    const forged = answer({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await cloudflareTurnstile({ siteKey: "s", secret: "x", fetch: forged }).verify("tok", "1.2.3.4")).toBe("failed");
  });

  test("AC6: without both keys in env there is no widget and no network call", async () => {
    expect(turnstileFromEnv({})).toBe(NO_TURNSTILE);
    expect(turnstileFromEnv({ TURNSTILE_SECRET_KEY: "only-secret" })).toBe(NO_TURNSTILE);
    expect(turnstileFromEnv({ TURNSTILE_SITE_KEY: "s", TURNSTILE_SECRET_KEY: "x" }).siteKey).toBe("s");
    expect(await NO_TURNSTILE.verify(undefined, "unknown")).toBe("ok");
  });
});
