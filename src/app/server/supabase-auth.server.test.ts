// The Supabase-backed gateway against a fake GoTrue at the HTTP boundary (no network):
// cookie attributes (S-009 AC1), local JWKS verification and the amr sign-in time (AC3).
import { describe, expect, test } from "vitest";
import { createSupabaseAuth, recoveryTime } from "./supabase-auth.server";
import { createTestSigningKey, sessionBody, signTestJwt } from "./testing/test-jwt";

describe("recovery sessions (S-026)", () => {
  test("the latest amr method decides: recovery (or otp) gives its time, anything else none", () => {
    const at = (s: number) => new Date(s * 1000);

    expect(recoveryTime([{ method: "recovery", timestamp: 200 }])).toEqual(at(200));
    expect(recoveryTime([{ method: "otp", timestamp: 200 }])).toEqual(at(200));
    expect(recoveryTime([{ method: "recovery", timestamp: 100 }, { method: "password", timestamp: 200 }])).toBeUndefined();
    expect(recoveryTime([{ method: "password", timestamp: 100 }, { method: "recovery", timestamp: 200 }])).toEqual(at(200));
    expect(recoveryTime(undefined)).toBeUndefined();
  });
});

const URL_BASE = "https://project.test";
const USER = { id: "5b3e1f0a-2c4d-4e5f-8a9b-0c1d2e3f4a5b", email: "owner@example.com" };
const SIGNED_IN = new Date("2026-11-01T10:00:00Z");

async function fakeGoTrue() {
  const key = await createTestSigningKey();
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname === "/auth/v1/.well-known/jwks.json") return Response.json({ keys: [key.publicJwk] });
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname === "/auth/v1/token") {
      const body = JSON.parse(String(init?.body)) as { email?: string; password?: string };
      if (body.email !== USER.email || body.password !== "correct horse") {
        return Response.json({ code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" }, { status: 400 });
      }
      const token = await signTestJwt(key, { sub: USER.id, email: USER.email, signedInAt: SIGNED_IN });
      return Response.json(sessionBody(token, "refresh-1", USER));
    }
    return new Response("not found", { status: 404 });
  };
  return { key, calls, fetch: fetch as typeof globalThis.fetch };
}

const request = (cookie?: string) => new Request("https://shop.test/admin", { headers: cookie ? { cookie } : {} });
const asCookieHeader = (setCookies: string[]) => setCookies.map((c) => c.slice(0, c.indexOf(";"))).join("; ");

describe("Supabase gateway (S-009 AC1, AC3)", () => {
  test("a valid sign-in sets HttpOnly, Secure, SameSite=Lax cookies that last 30 days", async () => {
    const gotrue = await fakeGoTrue();
    const auth = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request());

    expect(await auth.signInWithPassword({ email: USER.email, password: "correct horse" })).toEqual({ userId: USER.id });

    const cookies = auth.takeSetCookies();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/; HttpOnly/i);
      expect(cookie).toMatch(/; Secure/i);
      expect(cookie).toMatch(/; SameSite=Lax/i);
      expect(cookie).toMatch(/; Max-Age=2592000/i);
      expect(cookie).toMatch(/; Path=\//i);
    }
    expect(auth.takeSetCookies()).toEqual([]);
  });

  test("wrong credentials give null and set no cookie", async () => {
    const gotrue = await fakeGoTrue();
    const auth = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request());

    expect(await auth.signInWithPassword({ email: USER.email, password: "wrong" })).toBeNull();
    expect(auth.takeSetCookies()).toEqual([]);
  });

  test("the next request's claims are verified with the JWKS and carry the amr sign-in time, memoised", async () => {
    const gotrue = await fakeGoTrue();
    const first = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request());
    await first.signInWithPassword({ email: USER.email, password: "correct horse" });
    const cookie = asCookieHeader(first.takeSetCookies());

    const next = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request(cookie));
    const claims = await next.claims();
    await next.claims();

    expect(claims).toEqual({ userId: USER.id, signedInAt: SIGNED_IN });
    expect(gotrue.calls.filter((c) => c.startsWith("GET /auth/v1/user"))).toEqual([]);
  });

  test("a token signed by another key is refused", async () => {
    const gotrue = await fakeGoTrue();
    const forger = await createTestSigningKey(gotrue.key.kid);
    const forged = await signTestJwt(forger, { sub: USER.id, email: USER.email, signedInAt: SIGNED_IN });
    const session = sessionBody(forged, "refresh-x", USER);
    const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

    const auth = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request(`sb-project-auth-token=${value}`));

    expect(await auth.claims()).toBeNull();
  });

  test("no cookie means no claims and no network call", async () => {
    const gotrue = await fakeGoTrue();
    const auth = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request());

    expect(await auth.claims()).toBeNull();
    expect(gotrue.calls).toEqual([]);
  });

  test("sign-out clears the cookies (Max-Age=0)", async () => {
    const gotrue = await fakeGoTrue();
    const first = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request());
    await first.signInWithPassword({ email: USER.email, password: "correct horse" });
    const cookie = asCookieHeader(first.takeSetCookies());

    const next = createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, request(cookie));
    await next.signOut();

    const cleared = next.takeSetCookies();
    expect(cleared.length).toBeGreaterThan(0);
    for (const c of cleared) expect(c).toMatch(/Max-Age=0/i);
  });
});
