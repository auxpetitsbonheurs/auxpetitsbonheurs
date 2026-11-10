import { describe, expect, test } from "vitest";
import { TOKEN_PAGE_HEADERS, isTrackingToken, orderLanguageRedirect, tokenPageHeaders } from "./token-page.server";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd"; // 42
const VALID = `${TOKEN}e`;

describe("token format (threat-model C1)", () => {
  test("accepts exactly 43 base64url characters", () => {
    expect(VALID).toHaveLength(43);
    expect(isTrackingToken(VALID)).toBe(true);
  });

  test.each([
    ["too short", TOKEN],
    ["too long", `${VALID}x`],
    ["a padding character", `${TOKEN}=`],
    ["a slash", `${TOKEN}/`],
    ["a plus", `${TOKEN}+`],
    ["a dot", `${TOKEN}.`],
    ["a percent escape", `${TOKEN.slice(0, 40)}%2F`],
    ["empty", ""],
    ["undefined", undefined],
  ])("refuses %s", (_label, token) => {
    expect(isTrackingToken(token)).toBe(false);
  });
});

describe("token page headers (NFR-004, threat-model G-07)", () => {
  test("are no-store, noindex and no-referrer", () => {
    expect(TOKEN_PAGE_HEADERS).toEqual({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
  });

  test("the middleware sets them on every response, 404s and redirects included, replacing weaker values", async () => {
    for (const response of [
      new Response("ok"),
      new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } }),
      new Response(null, { status: 302, headers: { Location: "/fr/t/x" } }),
    ]) {
      const result = (await tokenPageHeaders({} as never, async () => response)) as Response;
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(result.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });
});

describe("order language on an unprefixed link (NFR-007)", () => {
  const request = (headers: Record<string, string> = {}) => new Request("http://localhost/t/x", { headers });

  test("a French order opened at the English URL on entry, with no remembered language, moves to /fr", () => {
    expect(orderLanguageRedirect(request(), new URL("http://localhost/t/x?a=1"), "fr")).toBe("/fr/t/x?a=1");
  });

  test.each([
    ["the page is already French", "http://localhost/fr/t/x", "fr", {}],
    ["the order is English", "http://localhost/t/x", "en", {}],
    ["a language is remembered", "http://localhost/t/x", "fr", { cookie: "apb_locale=en" }],
    ["it is an in-site navigation (the language switch)", "http://localhost/t/x", "fr", { "sec-fetch-site": "same-origin" }],
  ] as const)("stays when %s", (_label, href, orderLocale, headers) => {
    expect(orderLanguageRedirect(request(headers), new URL(href), orderLocale)).toBeUndefined();
  });
});
