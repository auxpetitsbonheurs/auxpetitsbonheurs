import { describe, expect, test } from "vitest";
import { mailHref, telHref, whatsappHref } from "./contact";

describe("contact links (S-007 footer)", () => {
  test("WhatsApp links use wa.me with digits only", () => {
    expect(whatsappHref("+230 5000 0000")).toBe("https://wa.me/23050000000");
  });

  test("phone links keep the leading plus and drop spaces", () => {
    expect(telHref("+230 5000 0000")).toBe("tel:+23050000000");
  });

  test("email links are mailto", () => {
    expect(mailHref("hello@example.com")).toBe("mailto:hello@example.com");
  });
});
