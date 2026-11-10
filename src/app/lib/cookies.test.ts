import { describe, expect, test } from "vitest";
import { readCookie } from "./cookies";

const request = (cookie?: string) => new Request("http://localhost/", cookie ? { headers: { cookie } } : undefined);

describe("readCookie", () => {
  test("returns the raw value of the named cookie", () => {
    expect(readCookie(request("a=1; apb_locale=fr; b=2"), "apb_locale")).toBe("fr");
  });

  test("is undefined when absent and ignores names that merely contain it", () => {
    expect(readCookie(request(), "apb_locale")).toBeUndefined();
    expect(readCookie(request("x_apb_locale=fr"), "apb_locale")).toBeUndefined();
  });
});
