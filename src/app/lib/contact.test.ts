import { describe, expect, test } from "vitest";
import { mailHref, safeWebUrl, telHref, whatsappHref } from "./contact";

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

  test("S-251 AC2, S-252 AC2: a WhatsApp link can carry a pre-filled message, URL-encoded", () => {
    expect(whatsappHref("+230 5000 0000", "Hello, I'd like a custom cake.")).toBe("https://wa.me/23050000000?text=Hello%2C%20I'd%20like%20a%20custom%20cake.");
    expect(whatsappHref("+230 5000 0000", "Bonjour & merci")).toBe("https://wa.me/23050000000?text=Bonjour%20%26%20merci");
  });
});

describe("safeWebUrl (S-251 AC3)", () => {
  test("keeps http and https links", () => {
    expect(safeWebUrl("https://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(safeWebUrl(" http://example.com/map ")).toBe("http://example.com/map");
  });

  test.each([null, "", "javascript:alert(1)", "data:text/html,x", "maps.google.com", "ftp://x.test"])("refuses %s", (value) => {
    expect(safeWebUrl(value)).toBeNull();
  });
});
