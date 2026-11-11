import { describe, expect, test } from "vitest";
import { shouldRevalidate } from "./root";

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
