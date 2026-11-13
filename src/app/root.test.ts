import { RouterContextProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { loader, shouldRevalidate } from "./root";

describe("root messages (S-006 AC5, S-254)", () => {
  const load = (path: string) =>
    loader({ url: new URL(path, "http://x"), context: new RouterContextProvider(), request: new Request(`http://x${path}`), params: {} } as never) as {
      messages: Record<string, unknown>;
    };

  test("customer pages ship no admin or email text (two thirds of the catalogue)", () => {
    const { messages } = load("/fr/menu");
    expect(messages.admin).toBeUndefined();
    expect(messages.email).toBeUndefined();
    expect(messages.checkout).toBeDefined();
    expect(messages.home).toBeDefined();
  });

  test("admin pages (login and the customer preview included) get the full bundle", () => {
    expect(load("/admin/login").messages.admin).toBeDefined();
    expect(load("/admin/menu/1/preview").messages.admin).toBeDefined();
  });
});

const args = (from: string, to: string, formMethod?: string) =>
  ({ currentUrl: new URL(from, "http://x"), nextUrl: new URL(to, "http://x"), formMethod, defaultShouldRevalidate: true }) as never;

describe("root revalidation", () => {
  test("a plain navigation between admin pages keeps the root data (no request for it)", () => {
    expect(shouldRevalidate(args("/admin", "/admin/menu"))).toBe(false);
  });

  test("an admin action (sign-in, sign-out, a save) reloads it: the admin's language may change", () => {
    expect(shouldRevalidate(args("/admin/login", "/admin", "POST"))).toBe(true);
  });

  test("entering or leaving the admin reloads it", () => {
    expect(shouldRevalidate(args("/", "/admin"))).toBe(true);
    expect(shouldRevalidate(args("/admin", "/"))).toBe(true);
  });

  test("customer pages: same language keeps it, a language switch reloads it", () => {
    expect(shouldRevalidate(args("/", "/basket"))).toBe(false);
    expect(shouldRevalidate(args("/", "/fr"))).toBe(true);
  });
});
