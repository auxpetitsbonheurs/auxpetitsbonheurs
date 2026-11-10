import { describe, expect, test } from "vitest";
import { LOCALE_COOKIE, decideLocale, localeCookie, twinPath } from "./locale-detect";

const base = { pathname: "/", search: "", cookie: undefined, acceptLanguage: undefined, secFetchSite: "none" };

describe("decideLocale: first visit (AC1)", () => {
  test("no cookie and Accept-Language fr-FR on / redirects to /fr/", () => {
    expect(decideLocale({ ...base, acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8" })).toEqual({ redirectTo: "/fr/" });
  });

  test("keeps the path and query when redirecting", () => {
    expect(decideLocale({ ...base, pathname: "/basket", search: "?x=1", acceptLanguage: "fr" })).toEqual({
      redirectTo: "/fr/basket?x=1",
    });
  });

  test.each(["en-GB,en;q=0.9", "de-DE, fr;q=0.9", "", undefined])("Accept-Language %j stays in English", (acceptLanguage) => {
    expect(decideLocale({ ...base, acceptLanguage })).toEqual({ rememberLocale: "en" });
  });

  test("a French page never redirects and remembers French", () => {
    expect(decideLocale({ ...base, pathname: "/fr/", acceptLanguage: "en-GB" })).toEqual({ rememberLocale: "fr" });
  });
});

describe("decideLocale: remembered language (AC2, AC3)", () => {
  test("cookie en with a French browser: no redirect (the cookie wins)", () => {
    expect(decideLocale({ ...base, cookie: "en", acceptLanguage: "fr-FR" })).toEqual({});
  });

  test("cookie fr on an entry navigation to an English URL redirects to the French twin", () => {
    expect(decideLocale({ ...base, cookie: "fr", pathname: "/basket", search: "?x=1" })).toEqual({
      redirectTo: "/fr/basket?x=1",
    });
  });

  test("cookie fr on an in-site navigation to English (the switch) stays and remembers English", () => {
    expect(decideLocale({ ...base, cookie: "fr", pathname: "/basket", search: "?x=1", secFetchSite: "same-origin" })).toEqual({
      rememberLocale: "en",
    });
  });

  test("in-site navigation never redirects, even without a cookie (cookies blocked)", () => {
    expect(decideLocale({ ...base, acceptLanguage: "fr-FR", secFetchSite: "same-origin" })).toEqual({ rememberLocale: "en" });
  });

  test("a matching cookie needs no new cookie", () => {
    expect(decideLocale({ ...base, cookie: "fr", pathname: "/fr/menu" })).toEqual({});
  });
});

describe("decideLocale: invalid cookie (AC4)", () => {
  test.each(["it", "FR", "", "en;", "%00"])("cookie %j is ignored and detection applies", (cookie) => {
    expect(decideLocale({ ...base, cookie, acceptLanguage: "fr-CA" })).toEqual({ redirectTo: "/fr/" });
    expect(decideLocale({ ...base, cookie, acceptLanguage: "en" })).toEqual({ rememberLocale: "en" });
  });
});

describe("twinPath", () => {
  test.each([
    ["/", "", "fr", "/fr/"],
    ["/basket", "?x=1", "fr", "/fr/basket?x=1"],
    ["/fr/basket", "?x=1", "en", "/basket?x=1"],
    ["/fr", "", "en", "/"],
    ["/fr/", "", "en", "/"],
    ["/fr/basket", "", "fr", "/fr/basket"],
  ] as const)("%s%s in %s is %s", (pathname, search, locale, expected) => {
    expect(twinPath(pathname, search, locale)).toBe(expected);
  });
});

describe("localeCookie (AC2: one year)", () => {
  test("is a one-year, site-wide, Lax cookie", () => {
    expect(localeCookie("en")).toBe(`${LOCALE_COOKIE}=en; Max-Age=31536000; Path=/; SameSite=Lax; Secure; HttpOnly`);
  });
});

describe("twinPath: never produces a protocol-relative URL", () => {
  test.each(["/fr//evil.com", "/fr///evil.com/x", "/fr/\\evil.com"])("%s stays on this site", (pathname) => {
    const href = twinPath(pathname, "", "en");
    expect(href.startsWith("/")).toBe(true);
    expect(href.startsWith("//")).toBe(false);
    expect(href.startsWith("/\\")).toBe(false);
  });
});
