import { describe, expect, test } from "vitest";
import { assertSameOrigin, isSameOrigin, refuseCrossSiteAdminRequest } from "./origin.server";

const post = (headers: Record<string, string>, method = "POST") => new Request("https://shop.test/admin/orders/1", { method, headers });

describe("CSRF Origin check on non-GET admin requests (S-009 AC8, architecture Auth)", () => {
  test("a POST from the site's own origin passes", () => {
    expect(isSameOrigin(post({ origin: "https://shop.test" }))).toBe(true);
  });

  test.each([
    ["another site", { origin: "https://evil.example" }],
    ["another scheme", { origin: "http://shop.test" }],
    ["another port", { origin: "https://shop.test:8443" }],
    ["an opaque origin", { origin: "null" }],
    ["no Origin and no Referer", {}],
    ["no Origin and a foreign Referer", { referer: "https://evil.example/page" }],
    ["no Origin and a broken Referer", { referer: "::not a url" }],
  ])("a POST from %s is refused with 403", (_label, headers) => {
    expect(isSameOrigin(post(headers))).toBe(false);
    let thrown: unknown;
    try {
      assertSameOrigin(post(headers));
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { init?: { status?: number } }).init?.status).toBe(403);
  });

  test("without Origin, a same-site Referer is accepted (older browsers)", () => {
    expect(isSameOrigin(post({ referer: "https://shop.test/admin/login" }))).toBe(true);
  });

  test.each(["GET", "HEAD"])("%s requests are never refused", (method) => {
    expect(() => assertSameOrigin(post({ origin: "https://evil.example" }, method))).not.toThrow();
  });
});

describe("at the Worker entry, before React Router (S-009 AC8)", () => {
  const at = (path: string, method: string, origin?: string) =>
    new Request(`https://shop.test${path}`, { method, headers: origin ? { origin } : {} });

  test.each(["/admin/login", "/admin/sign-out", "/admin/orders/1.data", "/admin"])("a cross-site POST to %s is a 403, private and no-store", async (path) => {
    const response = refuseCrossSiteAdminRequest(at(path, "POST", "https://evil.example"));

    expect(response?.status).toBe(403);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response?.json()).toEqual({ ok: false, error: { code: "FORBIDDEN", message: "Forbidden" } });
  });

  test.each([
    ["a same-site admin POST", at("/admin/login", "POST", "https://shop.test")],
    ["an admin GET from anywhere", at("/admin", "GET", "https://evil.example")],
    ["a customer-site POST", at("/basket", "POST", "https://evil.example")],
    ["a path that only starts like admin", at("/administrator", "POST", "https://evil.example")],
  ])("%s passes through", (_label, request) => {
    expect(refuseCrossSiteAdminRequest(request)).toBeUndefined();
  });
});
