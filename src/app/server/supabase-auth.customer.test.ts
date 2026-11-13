// E-11 customer calls of the Supabase gateway against a fake GoTrue at the HTTP boundary (no
// network): sign-up with the discarded password, the sign-in link that never creates a user,
// and verifying an emailed link (cookies + the user's email and metadata).
import { describe, expect, test } from "vitest";
import { createSupabaseAuth } from "./supabase-auth.server";
import { createTestSigningKey, sessionBody, signTestJwt } from "./testing/test-jwt";

const URL_BASE = "https://project.test";
const USER = { id: "5b3e1f0a-2c4d-4e5f-8a9b-0c1d2e3f4a5b", email: "Aisha@Example.com", metadata: { name: "Aisha", locale: "fr" } };

async function fakeGoTrue() {
  const key = await createTestSigningKey();
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ path: `${init?.method ?? "GET"} ${url.pathname}${url.search}`, body });
    if (url.pathname === "/auth/v1/signup") return Response.json(sessionBody("unused", "unused", USER).user);
    if (url.pathname === "/auth/v1/otp") {
      return body.email === "known@example.com" ? Response.json({}) : Response.json({ code: "otp_disabled", msg: "Signups not allowed for otp" }, { status: 422 });
    }
    if (url.pathname === "/auth/v1/verify") {
      if (body.token_hash !== "good") return Response.json({ code: "otp_expired", msg: "expired" }, { status: 403 });
      const token = await signTestJwt(key, { sub: USER.id, email: USER.email, signedInAt: new Date(), method: "otp" });
      return Response.json(sessionBody(token, "refresh-1", USER));
    }
    return new Response("not found", { status: 404 });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const gateway = async () => {
  const gotrue = await fakeGoTrue();
  return { gotrue, auth: createSupabaseAuth({ url: URL_BASE, anonKey: "anon", fetch: gotrue.fetch }, new Request("https://shop.test/auth/confirm")) };
};

describe("customer calls (E-11)", () => {
  test("signUp posts the email, the given password and metadata with the redirect, and sets no cookie (S-206)", async () => {
    const { gotrue, auth } = await gateway();

    const ok = await auth.signUp({ email: "aisha@example.com", password: "random-43-chars", metadata: { name: "Aisha" }, redirectTo: "https://shop.test/auth/confirm?next=%2Faccount%2Forders" });

    expect(ok).toBe(true);
    const call = gotrue.calls.find((c) => c.path.startsWith("POST /auth/v1/signup"))!;
    expect(call.path).toContain("redirect_to=https%3A%2F%2Fshop.test%2Fauth%2Fconfirm");
    expect(call.body).toMatchObject({ email: "aisha@example.com", password: "random-43-chars", data: { name: "Aisha" } });
    expect(auth.takeSetCookies()).toEqual([]);
  });

  test("requestSignInLink asks Auth never to create a user; an unknown email is false (S-208 AC2)", async () => {
    const { gotrue, auth } = await gateway();

    expect(await auth.requestSignInLink("known@example.com", "https://shop.test/auth/confirm")).toBe(true);
    expect(await auth.requestSignInLink("nobody@example.com", "https://shop.test/auth/confirm")).toBe(false);
    expect(gotrue.calls[0]!.body).toMatchObject({ email: "known@example.com", create_user: false });
  });

  test("verifyEmailLink sets the session cookies and returns the lower-cased email and metadata; a bad token is null", async () => {
    const { auth } = await gateway();

    expect(await auth.verifyEmailLink("bad", "magiclink")).toBeNull();
    const user = await auth.verifyEmailLink("good", "signup");

    expect(user).toEqual({ userId: USER.id, email: "aisha@example.com", metadata: { name: "Aisha", locale: "fr" } });
    expect(auth.takeSetCookies().join("\n")).toMatch(/HttpOnly/);
  });
});
